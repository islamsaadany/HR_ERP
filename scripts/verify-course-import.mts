/** Template round trip: build the workbook, read it back, and create the course. */
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { parseCourseWorkbook, groupIntoSections } from "../src/lib/learning/import.js";

const db = new PrismaClient();
let pass = 0, fail = 0;
const check = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${l}${ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
};

// Build the same workbook the download route produces, then read it back — the round trip is the
// point: a template whose own example rows don't import is worse than no template.
const wb = new ExcelJS.Workbook();
const cs = wb.addWorksheet("Course");
cs.addRow(["Title", "Summary", "Category", "Redo after (months)"]);
cs.addRow(["Client Engagement Essentials", "How we scope", "Consulting", "Never"]);
const ls = wb.addWorksheet("Lessons");
ls.addRow(["Section", "Lesson", "Required", "Video link", "Must watch %", "Notes"]);
ls.addRow(["Before the engagement", "Why scoping fails", "Yes", "https://vimeo.com/948120774", "80", ""]);
ls.addRow(["Before the engagement", "The kick-off checklist", "Yes", "https://www.youtube.com/watch?v=nc51UwuL8pE", "", "Bring the signed SOW."]);
ls.addRow(["Before the engagement", "Further reading", "No", "", "", "See the **handbook**."]);
ls.addRow(["On site", "Running the first workshop", "Yes", "", "", "Notes only."]);
const buf = await wb.xlsx.writeBuffer();

const back = new ExcelJS.Workbook();
await back.xlsx.load(buf as ArrayBuffer);
const rows = (name: string, cols: number) => {
  const ws = back.getWorksheet(name)!;
  const out: string[][] = [];
  ws.eachRow((row, i) => {
    if (i === 1) return;
    const cells: string[] = [];
    for (let c = 1; c <= cols; c++) {
      const v = row.getCell(c).value;
      const s = v == null ? "" : typeof v === "object" && "text" in v ? String((v as {text: unknown}).text ?? "") : String(v);
      cells.push(s.trim());
    }
    out.push(cells);
  });
  return out;
};

const parsed = parseCourseWorkbook(rows("Course", 4)[0], rows("Lessons", 6));
check("the template's OWN example rows import cleanly", parsed.ok, true);
if (!parsed.ok) { console.log(parsed.problems); process.exit(1); }
check("4 lessons", parsed.course.lessons.length, 4);
check("2 sections, in sheet order", groupIntoSections(parsed.course.lessons).map(s => s.title), ["Before the engagement", "On site"]);
check("'Never' → no renewal", parsed.course.renewAfterMonths, null);
check("hyperlink cells still read as their text", parsed.course.lessons[1].videoSource, "YOUTUBE");

// Write it, exactly as the action does.
await db.course.deleteMany({ where: { title: "Client Engagement Essentials" } });
const sections = groupIntoSections(parsed.course.lessons);
const created = await db.course.create({
  data: {
    title: parsed.course.title, summary: parsed.course.summary, category: parsed.course.category,
    renewAfterMonths: parsed.course.renewAfterMonths, order: 99,
    sections: { create: sections.map((s, si) => ({ title: s.title, order: si + 1,
      lessons: { create: s.lessons.map((l, li) => ({ title: l.title, order: li + 1, isRequired: l.isRequired,
        minWatchPercent: l.minWatchPercent,
        blocks: { create: [
          ...(l.videoUrl ? [{ type: "VIDEO" as const, order: 1, externalUrl: l.videoUrl, videoSource: l.videoSource }] : []),
          ...(l.notes ? [{ type: "TEXT" as const, order: l.videoUrl ? 2 : 1, text: l.notes }] : []),
        ] } })) } })) },
  },
  include: { sections: { include: { lessons: { include: { blocks: true } } } } },
});
check("course created as a DRAFT", created.status, "DRAFT");
check("sections written", created.sections.length, 2);
const all = created.sections.flatMap(s => s.lessons);
check("lessons written", all.length, 4);
check("the optional lesson stayed optional", all.find(l => l.title === "Further reading")?.isRequired, false);
check("the watch requirement carried over", all.find(l => l.title === "Why scoping fails")?.minWatchPercent, 80);
check("a lesson with video + notes got both blocks", all.find(l => l.title === "The kick-off checklist")?.blocks.length, 2);
check("a notes-only lesson got one block", all.find(l => l.title === "Running the first workshop")?.blocks.length, 1);

console.log(`\n${pass} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
