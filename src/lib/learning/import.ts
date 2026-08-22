import { videoSourceFor } from "@/lib/learning/video";
import type { VideoSource } from "@prisma/client";

/**
 * Parsing and validating an uploaded course workbook — pure, no database, no exceljs.
 *
 * The caller turns each sheet into rows of strings; everything below is arithmetic on those, so
 * the rules are testable without a file or a request. Two decisions shape it:
 *
 *  - **All or nothing.** A half-imported course is worse than none: you cannot tell by looking
 *    which lessons are missing. So one bad row rejects the file.
 *  - **Every fault at once.** The house learned this on the employee form — reporting only the
 *    first problem makes an operator fix, re-upload, fix, re-upload. Errors below accumulate.
 */

export type ParsedLesson = {
  section: string;
  title: string;
  isRequired: boolean;
  videoUrl: string | null;
  videoSource: VideoSource | null;
  minWatchPercent: number;
  notes: string | null;
};

export type ParsedCourse = {
  title: string;
  summary: string | null;
  category: string | null;
  renewAfterMonths: number | null;
  lessons: ParsedLesson[];
};

export type ImportProblem = { where: string; message: string };
export type ImportResult =
  | { ok: true; course: ParsedCourse; sectionCount: number }
  | { ok: false; problems: ImportProblem[] };

const text = (v: unknown): string => (v == null ? "" : String(v).trim());

/** "Yes"/"No"/"Required"/"Optional"/blank → required?  Blank means required, the safer default. */
function parseRequired(v: string): boolean | null {
  const s = v.toLowerCase();
  if (!s) return true;
  if (["yes", "y", "required", "true", "1"].includes(s)) return true;
  if (["no", "n", "optional", "false", "0"].includes(s)) return false;
  return null;
}

function parseInteger(v: string): number | null | "bad" {
  if (!v) return null;
  const n = Number(v.replace("%", "").trim());
  return Number.isFinite(n) && n >= 0 && Number.isInteger(n) ? n : "bad";
}

export const RENEWAL_MONTHS = [6, 12, 24, 36];

/**
 * @param courseRow  the single data row from the Course sheet
 * @param lessonRows the data rows from the Lessons sheet (header already removed)
 */
export function parseCourseWorkbook(
  courseRow: string[],
  lessonRows: string[][]
): ImportResult {
  const problems: ImportProblem[] = [];
  const add = (where: string, message: string) => problems.push({ where, message });

  // ── Course sheet ──
  const title = text(courseRow[0]);
  const summary = text(courseRow[1]) || null;
  const category = text(courseRow[2]) || null;
  const renewRaw = text(courseRow[3]);

  if (!title) add("Course sheet", "Give the course a title in the Title column.");

  let renewAfterMonths: number | null = null;
  if (renewRaw && !/^never$/i.test(renewRaw)) {
    const n = parseInteger(renewRaw);
    if (n === "bad" || n === null || !RENEWAL_MONTHS.includes(n)) {
      add(
        "Course sheet",
        `"Redo after (months)" should be blank, "Never", or one of ${RENEWAL_MONTHS.join(", ")} — got "${renewRaw}".`
      );
    } else {
      renewAfterMonths = n;
    }
  }

  // ── Lessons sheet ──
  const lessons: ParsedLesson[] = [];
  const seen = new Set<string>();

  lessonRows.forEach((raw, i) => {
    const row = raw.map(text);
    if (row.every((c) => !c)) return; // blank spacer rows are fine
    const where = `Lessons row ${i + 2}`; // +2: 1-indexed, and the header is row 1

    const section = row[0];
    const lessonTitle = row[1];
    if (!section) add(where, "Section is empty — every lesson needs a section name.");
    if (!lessonTitle) add(where, "Lesson is empty.");

    const key = `${section.toLowerCase()}||${lessonTitle.toLowerCase()}`;
    if (section && lessonTitle && seen.has(key)) {
      add(where, `"${lessonTitle}" appears twice in section "${section}".`);
    }
    seen.add(key);

    const required = parseRequired(row[2]);
    if (required === null) add(where, `Required should be Yes or No — got "${row[2]}".`);

    // No Minutes column: the platform learns a video's real length from the first playback, so
    // asking an author to measure and type it is work for a worse answer.
    const videoUrl = row[3] || null;
    let videoSource: VideoSource | null = null;
    if (videoUrl) {
      if (!/^https?:\/\//i.test(videoUrl)) {
        add(where, `Video link should start with http:// or https:// — got "${videoUrl}".`);
      } else {
        videoSource = videoSourceFor(videoUrl);
      }
    }

    const watch = parseInteger(row[4]);
    if (watch === "bad" || (typeof watch === "number" && watch > 100)) {
      add(where, `Must watch % should be a whole number from 0 to 100 — got "${row[4]}".`);
    }
    const minWatchPercent = typeof watch === "number" ? watch : 0;

    if (minWatchPercent > 0 && !videoUrl) {
      add(where, "Must watch % is set but there is no video link.");
    }
    // FR-031: never accept a rule we could not enforce.
    if (minWatchPercent > 0 && videoSource === "DRIVE") {
      add(
        where,
        "Google Drive can't report playback, so a Must watch % can't be enforced on it. Use Vimeo or YouTube, or clear the percentage."
      );
    }

    const notes = row[5] || null;
    if (!videoUrl && !notes) {
      add(where, "A lesson needs a video link, notes, or both — this row has neither.");
    }

    lessons.push({
      section,
      title: lessonTitle,
      isRequired: required ?? true,
      videoUrl,
      videoSource,
      minWatchPercent,
      notes,
    });
  });

  if (lessons.length === 0) add("Lessons sheet", "No lessons found — add at least one row.");

  if (problems.length > 0) return { ok: false, problems };

  const sectionCount = new Set(lessons.map((l) => l.section.toLowerCase())).size;
  return {
    ok: true,
    course: { title, summary, category, renewAfterMonths, lessons },
    sectionCount,
  };
}

/** Sections in first-appearance order, each with its lessons in sheet order. */
export function groupIntoSections(lessons: ParsedLesson[]): Array<{ title: string; lessons: ParsedLesson[] }> {
  const out: Array<{ title: string; lessons: ParsedLesson[] }> = [];
  for (const lesson of lessons) {
    const existing = out.find((s) => s.title.toLowerCase() === lesson.section.toLowerCase());
    if (existing) existing.lessons.push(lesson);
    else out.push({ title: lesson.section, lessons: [lesson] });
  }
  return out;
}
