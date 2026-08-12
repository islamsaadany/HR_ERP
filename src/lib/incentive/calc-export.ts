/**
 * Incentive Scheme — per-person calculation export (.xlsx).
 *
 * Produces a workbook the operator can share with each consultant alongside
 * their payout: a Summary sheet (everyone at a glance) plus one sheet per
 * person showing exactly how their number was built — the assignments they led,
 * the ones they contributed to (with tier/allocation), and their commission.
 *
 * Figures come straight from the computed report; this module only formats them.
 */
import ExcelJS from "exceljs";
import type { CycleReport } from "./compute";

const MONEY_FMT = "#,##0.00";
const PCT_FMT = "0.0%";

const NAVY = "FF13233B";
const NAVY_SOFT = "FFEDF1F7";

const key = (s: string) => s.trim().toLowerCase();

/** Excel sheet names: ≤31 chars, none of []:*?/\, and unique within the book. */
function sheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, " ").trim() || "Person").slice(0, 28);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 28 - String(n).length - 1)} ${n}`;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle" };
  });
}

function styleTotalRow(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
  });
}

export async function buildCalculationWorkbook(
  cycleLabel: string,
  report: CycleReport
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HR_ERP — Incentive Scheme";

  // ── Summary sheet ───────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary", { views: [{ state: "frozen", ySplit: 4 }] });
  summary.mergeCells("A1:G1");
  const title = summary.getCell("A1");
  title.value = `Incentive Scheme — ${cycleLabel}`;
  title.font = { bold: true, size: 14, color: { argb: NAVY } };
  summary.mergeCells("A2:G2");
  const sub = summary.getCell("A2");
  sub.value = "Released compensation by person (commission is protected — shown separately).";
  sub.font = { italic: true, size: 9, color: { argb: "FF5C6B7A" } };
  summary.addRow([]);

  const summaryHeader = summary.addRow(["Person", "Salary", "Lead fee", "Contributor", "Total", "Months", "Commission"]);
  styleHeaderRow(summaryHeader);
  for (const p of report.byPerson) {
    summary.addRow([p.name, p.salary, p.leadFee, p.contributor, p.total, p.months, p.commission]);
  }
  const sTot = summary.addRow([
    "Total",
    null,
    report.totals.leadFees,
    report.totals.contributorPayments,
    report.byPerson.reduce((s, p) => s + p.total, 0),
    null,
    report.totals.commission,
  ]);
  styleTotalRow(sTot);
  summary.columns.forEach((col, i) => {
    col.width = i === 0 ? 26 : 14;
    if (i >= 1 && i !== 5) col.numFmt = MONEY_FMT;
  });

  // ── Per-person sheets ───────────────────────────────────────────
  const used = new Set<string>(["summary"]);
  for (const person of report.byPerson) {
    const ws = wb.addWorksheet(sheetName(person.name, used));
    ws.columns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

    ws.mergeCells("A1:E1");
    const h = ws.getCell("A1");
    h.value = person.name;
    h.font = { bold: true, size: 14, color: { argb: NAVY } };
    ws.mergeCells("A2:E2");
    const c2 = ws.getCell("A2");
    c2.value = `Incentive Scheme — ${cycleLabel}`;
    c2.font = { italic: true, size: 9, color: { argb: "FF5C6B7A" } };
    ws.addRow([]);

    // Headline figures
    const hl = ws.addRow(["Monthly salary", person.salary]);
    hl.getCell(2).numFmt = MONEY_FMT;
    const hl2 = ws.addRow(["Total released (lead fee + contributor)", person.total]);
    hl2.getCell(2).numFmt = MONEY_FMT;
    hl2.font = { bold: true };
    const hl3 = ws.addRow(["Equivalent months of salary", person.months]);
    const hl4 = ws.addRow(["Commission (protected, paid separately)", person.commission]);
    hl4.getCell(2).numFmt = MONEY_FMT;
    ws.addRow([]);

    // As Lead
    const leadRows = report.assignments.filter((a) => key(a.leadName) === key(person.name));
    if (leadRows.length) {
      const secLead = ws.addRow(["As Lead"]);
      secLead.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
      const lh = ws.addRow(["Client", "Gross profit", "GP %", "Envelope", "Lead fee"]);
      styleHeaderRow(lh);
      for (const a of leadRows) {
        const r = ws.addRow([a.client, a.grossProfit, a.grossMarginPct, a.envelope, a.leadFee]);
        r.getCell(2).numFmt = MONEY_FMT;
        r.getCell(3).numFmt = PCT_FMT;
        r.getCell(4).numFmt = MONEY_FMT;
        r.getCell(5).numFmt = MONEY_FMT;
      }
      const lt = ws.addRow(["Subtotal — lead fees", null, null, null, person.leadFee]);
      lt.getCell(5).numFmt = MONEY_FMT;
      styleTotalRow(lt);
      ws.addRow([]);
    }

    // As Contributor
    const contribRows = report.assignments
      .flatMap((a) => a.contributors.map((cn) => ({ client: a.client, ...cn })))
      .filter((cn) => key(cn.name) === key(person.name));
    if (contribRows.length) {
      const secC = ws.addRow(["As Contributor"]);
      secC.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
      const ch = ws.addRow(["Client", "Share", "Tier", "Allocation", "Paid"]);
      styleHeaderRow(ch);
      for (const cn of contribRows) {
        const r = ws.addRow([cn.client, cn.share, cn.tier, cn.allocation, cn.flooredToZero ? 0 : cn.payment]);
        r.getCell(2).numFmt = PCT_FMT;
        r.getCell(3).numFmt = PCT_FMT;
        r.getCell(4).numFmt = MONEY_FMT;
        r.getCell(5).numFmt = MONEY_FMT;
        if (cn.flooredToZero) r.getCell(5).note = "Below the 5%-of-month floor — paid as 0.";
      }
      const ct = ws.addRow(["Subtotal — contributor payments", null, null, null, person.contributor]);
      ct.getCell(5).numFmt = MONEY_FMT;
      styleTotalRow(ct);
      ws.addRow([]);
    }

    // Commission
    const commRows = report.assignments.filter(
      (a) => a.commission && a.commission.amount > 0 && key(a.commission.earner) === key(person.name)
    );
    if (commRows.length) {
      const secM = ws.addRow(["Commission"]);
      secM.getCell(1).font = { bold: true, size: 11, color: { argb: NAVY } };
      const mh = ws.addRow(["Client", "Type", "Base", "Rate", "Amount"]);
      styleHeaderRow(mh);
      for (const a of commRows) {
        const r = ws.addRow([a.client, a.type, a.commission!.base, a.commission!.rate, a.commission!.amount]);
        r.getCell(3).numFmt = MONEY_FMT;
        r.getCell(4).numFmt = PCT_FMT;
        r.getCell(5).numFmt = MONEY_FMT;
      }
      const mt = ws.addRow(["Subtotal — commission", null, null, null, person.commission]);
      mt.getCell(5).numFmt = MONEY_FMT;
      styleTotalRow(mt);
    }
  }

  return wb.xlsx.writeBuffer();
}
