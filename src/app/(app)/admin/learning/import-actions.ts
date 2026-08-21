"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import {
  groupIntoSections,
  parseCourseWorkbook,
  type ImportProblem,
} from "@/lib/learning/import";

const MAX_BYTES = 5 * 1024 * 1024;

export type ImportCourseResult =
  | { ok: true; courseId: string; lessons: number; sections: number }
  | { ok: false; error: string; problems?: ImportProblem[] };

/** Read a sheet into rows of trimmed strings, header row dropped. */
function sheetRows(ws: ExcelJS.Worksheet | undefined, columns: number): string[][] {
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow((row, index) => {
    if (index === 1) return; // header
    const cells: string[] = [];
    for (let c = 1; c <= columns; c++) {
      const v = row.getCell(c).value;
      // A cell holding a hyperlink comes back as an object; its `text` is what the operator typed.
      const s =
        v == null
          ? ""
          : typeof v === "object" && "text" in v
            ? String((v as { text: unknown }).text ?? "")
            : typeof v === "object" && "result" in v
              ? String((v as { result: unknown }).result ?? "")
              : String(v);
      cells.push(s.trim());
    }
    rows.push(cells);
  });
  return rows;
}

/**
 * Create a course from an uploaded workbook (HR Admin + Super User).
 *
 * Always creates a DRAFT, never touches an existing course. Importing twice gives you two courses
 * rather than silently overwriting one — an overwrite is not recoverable from a spreadsheet, and
 * deleting a duplicate draft is.
 *
 * The whole file is validated before anything is written, and the write is one transaction, so a
 * course is either fully there or not there at all. A partially imported course is the worst
 * outcome: it looks finished and isn't.
 */
export async function importCourseFromWorkbook(formData: FormData): Promise<ImportCourseResult> {
  const admin = await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a filled-in template file first." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That file is over 5 MB — it's larger than a course template should ever be." };
  }

  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      error: "That file couldn't be read as an Excel workbook. Download the template and fill that in.",
    };
  }

  const courseSheet = wb.getWorksheet("Course");
  const lessonSheet = wb.getWorksheet("Lessons");
  if (!courseSheet || !lessonSheet) {
    return {
      ok: false,
      error: 'The file needs a "Course" sheet and a "Lessons" sheet — use the downloaded template.',
    };
  }

  const courseRows = sheetRows(courseSheet, 4);
  const parsed = parseCourseWorkbook(courseRows[0] ?? [], sheetRows(lessonSheet, 7));
  if (!parsed.ok) {
    return {
      ok: false,
      error: `Nothing was imported — ${parsed.problems.length} problem${parsed.problems.length === 1 ? "" : "s"} to fix:`,
      problems: parsed.problems,
    };
  }

  const { course } = parsed;
  const sections = groupIntoSections(course.lessons);

  const created = await prisma.$transaction(async (tx) => {
    const max = await tx.course.aggregate({ _max: { order: true } });
    return tx.course.create({
      data: {
        title: course.title,
        summary: course.summary,
        category: course.category,
        renewAfterMonths: course.renewAfterMonths,
        order: (max._max.order ?? 0) + 1,
        createdById: admin.id,
        updatedById: admin.id,
        sections: {
          create: sections.map((section, si) => ({
            title: section.title,
            order: si + 1,
            lessons: {
              create: section.lessons.map((lesson, li) => ({
                title: lesson.title,
                order: li + 1,
                isRequired: lesson.isRequired,
                estimatedMinutes: lesson.estimatedMinutes,
                minWatchPercent: lesson.minWatchPercent,
                blocks: {
                  create: [
                    ...(lesson.videoUrl
                      ? [
                          {
                            type: "VIDEO" as const,
                            order: 1,
                            externalUrl: lesson.videoUrl,
                            videoSource: lesson.videoSource,
                          },
                        ]
                      : []),
                    ...(lesson.notes
                      ? [
                          {
                            type: "TEXT" as const,
                            order: lesson.videoUrl ? 2 : 1,
                            text: lesson.notes,
                          },
                        ]
                      : []),
                  ],
                },
              })),
            },
          })),
        },
      },
      select: { id: true },
    });
  });

  revalidatePath("/admin/learning");
  return {
    ok: true,
    courseId: created.id,
    lessons: course.lessons.length,
    sections: sections.length,
  };
}
