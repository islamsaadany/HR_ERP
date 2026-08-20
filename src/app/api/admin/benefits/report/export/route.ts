import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireBenefitsReporting } from "@/lib/roles";
import { cycleReport, type ReportRow, type ReportChip } from "@/lib/benefits/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs needs the Node runtime

const NAVY = "FF0F2444";
const CHIP_TEXT: Record<ReportChip, string> = {
  NO_POOL: "No pool",
  NO_ACTIVITY: "No activity",
  ACTIVE: "Active",
  PENDING: "Pending review",
  EXHAUSTED: "Pool exhausted",
  OVER_POOL: "Over pool",
};
const CHIP_COLOR: Record<ReportChip, string> = {
  ACTIVE: "FF1C7C37",
  PENDING: "FF8A6402",
  NO_ACTIVITY: "FF5C6B7A",
  NO_POOL: "FF5C6B7A",
  EXHAUSTED: "FFB91C1C",
  OVER_POOL: "FFB91C1C",
};

/**
 * The benefits cycle report as a FORMATTED EXCEL workbook (spec 034, FR-007): the same
 * rows and figures as the on-screen table, under the CURRENT filter — the page passes its
 * department/status/search/leavers filters on the URL and this route re-applies them
 * (SC-003). House workbook conventions: navy header, frozen panes, filters, sized columns.
 */
export async function GET(req: Request) {
  await requireBenefitsReporting(); // FR-001: page and export gated alike

  const url = new URL(req.url);
  const cycleId = url.searchParams.get("cycle");
  if (!cycleId) return new NextResponse("Missing cycle", { status: 400 });
  const report = await cycleReport(cycleId);
  if (!report) return new NextResponse("Not found", { status: 404 });

  // The exact filter logic the table applies client-side.
  const department = url.searchParams.get("department") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const leavers = url.searchParams.get("leavers") === "1";
  const rows = report.rows.filter(
    (r: ReportRow) =>
      (leavers || !r.left) &&
      (!department || r.department === department) &&
      (!status || r.chip === status) &&
      (!q || r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q))
  );

  const wb = new ExcelJS.Workbook();
  const sheetName =
    report.planYear.name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Benefits report";
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 4 }] });

  // Title block
  const title = ws.addRow([`Benefits report — ${report.planYear.name}`]);
  title.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } };
  const sums = {
    ceiling: rows.reduce((n, r) => n + (r.ceiling ?? 0), 0),
    medical: rows.reduce((n, r) => n + r.medical, 0),
    flex: rows.reduce((n, r) => n + r.flexUsed, 0),
    pending: rows.reduce((n, r) => n + r.pending, 0),
    remaining: rows.reduce((n, r) => n + (r.remaining ?? 0), 0),
    guaranteed: rows.reduce((n, r) => n + r.guaranteed, 0),
  };
  const sub = ws.addRow([
    `${report.planYear.window ? `Cycle ${report.planYear.window} · ` : ""}${rows.length} ${
      rows.length === 1 ? "person" : "people"
    } · ceilings ${sums.ceiling.toLocaleString("en-EG")} · medical ${sums.medical.toLocaleString(
      "en-EG"
    )} · flex ${sums.flex.toLocaleString("en-EG")} (pending ${sums.pending.toLocaleString(
      "en-EG"
    )}) · remaining ${sums.remaining.toLocaleString("en-EG")} · guaranteed ${sums.guaranteed.toLocaleString("en-EG")}`,
  ]);
  sub.getCell(1).font = { italic: true, size: 9, color: { argb: "FF5C6B7A" } };
  ws.addRow([]);

  const headerLabels = [
    "Employee",
    "Department",
    "Contract",
    "Pool ceiling (EGP)",
    "Prorated",
    "Medical (EGP)",
    "Flex used (EGP)",
    "Pending (EGP)",
    "Remaining (EGP)",
    "Guaranteed (EGP)",
    "Utilization",
    "Status",
  ];
  const header = ws.addRow(headerLabels);
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.border = { bottom: { style: "thin", color: { argb: "FFE7E3DA" } } };
    c.alignment = { vertical: "middle" };
  });
  header.height = 20;

  for (const r of rows) {
    const chipText =
      r.chip === "PENDING"
        ? `Pending review (${r.pendingCount})`
        : r.chip === "NO_POOL" && r.noPoolReason
          ? `No pool — ${r.noPoolReason}`
          : CHIP_TEXT[r.chip];
    const row = ws.addRow([
      r.name + (r.left ? " (left)" : ""),
      r.department ?? "",
      r.contract,
      r.ceiling ?? "",
      r.prorated && r.proratedFrom != null ? `from ${r.proratedFrom.toLocaleString("en-EG")}` : "",
      r.medical || "",
      r.flexUsed || "",
      r.pending || "",
      r.remaining ?? "",
      r.guaranteed || "",
      r.utilization != null ? Math.round(r.utilization * 100) / 100 : "",
      chipText,
    ]);
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { bottom: { style: "thin", color: { argb: "FFE7E3DA" } } };
    });
    [4, 6, 7, 8, 9, 10].forEach((i) => (row.getCell(i).numFmt = "#,##0"));
    row.getCell(11).numFmt = "0%";
    const statusCell = row.getCell(12);
    statusCell.font = { bold: true, size: 10, color: { argb: CHIP_COLOR[r.chip] } };
  }

  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: ws.rowCount, column: headerLabels.length },
  };
  const widths = [26, 16, 24, 16, 14, 13, 14, 13, 15, 16, 11, 22];
  ws.columns.forEach((col, i) => {
    col.width = widths[i] ?? 14;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const safeName = report.planYear.name.replace(/[^\w.-]+/g, "-").slice(0, 60) || "cycle";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="benefits-report-${safeName}.xlsx"`,
    },
  });
}
