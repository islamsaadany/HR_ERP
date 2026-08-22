import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/roles";
import { RENEWAL_MONTHS } from "@/lib/learning/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs needs the Node runtime

const NAVY = "FF0F2444";
const MUTED = "FF5C6B7A";

function header(ws: ExcelJS.Worksheet, labels: string[]) {
  const row = ws.addRow(labels);
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle" };
  });
  row.height = 20;
  return row;
}

/**
 * The course upload template.
 *
 * Two data sheets, because a course is two different shapes: one row describing the COURSE, and
 * one row per LESSON. Sections are not a third sheet — repeating the section name on each lesson
 * row is how people actually think about it in a spreadsheet, and it removes a whole class of
 * "section named in one sheet but not the other" mistakes.
 *
 * Ships with a worked example already filled in. A blank template makes people guess at the format;
 * an example that is obviously an example does not, and they delete the rows they don't want.
 */
export async function GET() {
  await requireAdmin();
  const wb = new ExcelJS.Workbook();

  const course = wb.addWorksheet("Course", { views: [{ state: "frozen", ySplit: 1 }] });
  header(course, ["Title", "Summary", "Category", "Redo after (months)"]);
  course.addRow([
    "Client Engagement Essentials",
    "How we scope, run and hand over an engagement",
    "Consulting",
    "Never",
  ]);
  course.getColumn(1).width = 34;
  course.getColumn(2).width = 46;
  course.getColumn(3).width = 18;
  course.getColumn(4).width = 22;

  const lessons = wb.addWorksheet("Lessons", { views: [{ state: "frozen", ySplit: 1 }] });
  // No "Minutes" column on purpose: the platform learns a video's real length the first time
  // anyone plays it, so asking an author to measure and type it is work for a worse answer.
  header(lessons, ["Section", "Lesson", "Required", "Video link", "Must watch %", "Notes"]);
  const example: Array<[string, string, string, string, string, string]> = [
    ["Before the engagement", "Why scoping fails", "Yes", "https://vimeo.com/948120774", "80", ""],
    ["Before the engagement", "The kick-off checklist", "Yes", "https://www.youtube.com/watch?v=nc51UwuL8pE", "", "Bring the signed SOW."],
    ["Before the engagement", "Further reading", "No", "", "", "See the **handbook** for the full policy."],
    ["On site", "Running the first workshop", "Yes", "", "", "Notes only — no video for this one yet."],
  ];
  example.forEach((r) => lessons.addRow(r));
  [22, 30, 11, 46, 14, 44].forEach((w, i) => (lessons.getColumn(i + 1).width = w));

  const help = wb.addWorksheet("How to fill");
  const lines: Array<[string, boolean]> = [
    ["Course upload — how to fill this in", true],
    ["", false],
    ["The Course sheet: ONE row under the header. That row becomes the course.", false],
    ["  • Title — required.", false],
    ["  • Summary and Category — optional.", false],
    [`  • Redo after (months) — blank or "Never" for a one-off course, or one of ${RENEWAL_MONTHS.join(", ")} if it must be redone on a cycle.`, false],
    ["", false],
    ["The Lessons sheet: one row per lesson, in the order learners should see them.", false],
    ["  • Section — repeat the same name on consecutive rows to group them. Sections appear in the order they first show up.", false],
    ["  • Lesson — the lesson title. Two lessons in the same section can't share a name.", false],
    ["  • Required — Yes (counts toward progress) or No (optional). Blank means Yes.", false],
    ["  • Length is NOT asked for — the platform learns a video's real length the first time someone plays it.", false],
    ["  • Video link — an unlisted Vimeo or YouTube link. Video is not uploaded here; it stays on Vimeo/YouTube.", false],
    ["  • Must watch % — 0 or blank for no requirement. Only works on Vimeo/YouTube; Google Drive can't report playback, so a percentage on a Drive link is rejected.", false],
    ["  • Notes — optional. Markdown is supported (**bold**, lists, links).", false],
    ["  • Every lesson needs a video link, notes, or both.", false],
    ["", false],
    ["When you upload:", true],
    ["  • The course is created as a DRAFT. Nobody sees it until you publish it.", false],
    ["  • Nothing is imported unless the whole file is valid — you'll be shown every problem at once.", false],
    ["  • Uploading again creates a NEW course; it never overwrites an existing one.", false],
    ["  • Delete these example rows before uploading your own.", false],
  ];
  lines.forEach(([t, bold]) => {
    const r = help.addRow([t]);
    r.getCell(1).font = bold
      ? { bold: true, size: 12, color: { argb: NAVY } }
      : { size: 11, color: { argb: MUTED } };
  });
  help.getColumn(1).width = 120;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="course-template.xlsx"',
    },
  });
}
