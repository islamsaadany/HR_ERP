import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs needs the Node runtime

const NAVY = "FF0F2444";

/**
 * The public-holidays bulk-upload template (spec 035). Sheet 1 is what the importer
 * reads — a header row then one holiday per row — and ships pre-filled with the
 * currently listed holidays so the same file works as an export and as the base for
 * edits. Sheet 2 carries the instructions, out of the importer's way.
 */
export async function GET() {
  await requireAdmin();
  const existing = await prisma.publicHoliday.findMany({ orderBy: { date: "asc" } }).catch(() => []);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Holidays", { views: [{ state: "frozen", ySplit: 1 }] });
  const header = ws.addRow(["Date", "Holiday name"]);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle" };
  });
  header.height = 20;
  for (const h of existing) {
    const row = ws.addRow([formatDate(h.date), h.name]);
    row.getCell(1).alignment = { horizontal: "left" };
  }
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 36;

  const help = wb.addWorksheet("How to fill");
  const lines = [
    "Public holidays — bulk upload",
    "",
    "• One holiday per row on the Holidays sheet, under the header.",
    "• Date: dd/mm/yyyy (e.g. 06/10/2026) or a real Excel date — both work.",
    "• Holiday name: any short label (e.g. Eid al-Fitr — day 1).",
    "• Re-uploading updates the name of a date that's already listed; it never duplicates.",
    "• Listed dates stop counting as working days everywhere in Time-Off.",
  ];
  lines.forEach((t, i) => {
    const r = help.addRow([t]);
    if (i === 0) r.getCell(1).font = { bold: true, size: 13, color: { argb: NAVY } };
    else r.getCell(1).font = { size: 11, color: { argb: "FF5C6B7A" } };
  });
  help.getColumn(1).width = 90;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="public-holidays-template.xlsx"',
    },
  });
}
