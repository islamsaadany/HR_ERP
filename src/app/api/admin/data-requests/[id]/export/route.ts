import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireDataRequestManager } from "@/lib/roles";
import { campaignTracker } from "@/lib/profile/campaigns";
import { campaignField, campaignFieldLabel } from "@/lib/profile/campaign-fields";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs needs the Node runtime

const NAVY = "FF0F2444";
const STATUS_COLOR: Record<string, string> = {
  Complete: "FF1C7C37",
  Pending: "FF5C6B7A",
  "Left the company": "FFB91C1C",
};

/**
 * The campaign outcome as a FORMATTED EXCEL workbook (spec 033; Excel per feedback
 * 2026-08-17): a title block, then one row per targeted employee with one value column per
 * requested field — just the submitted data — and Status last. Styled in the same navy/gold
 * conventions as the incentive workbooks: navy header, frozen panes, filters, sized columns.
 * Downloaded from the tracker by whoever can read it (HR Admin / Finance / Super User).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireDataRequestManager();
  const { id } = await params;
  const campaign = await campaignTracker(id);
  if (!campaign) return new NextResponse("Not found", { status: 404 });

  const active = campaign.targets.filter((t) => t.user.status === "ACTIVE");
  const completed = active.filter((t) => t.fields.every((f) => f.status !== "PENDING"));

  const wb = new ExcelJS.Workbook();
  // Sheet names cap at 31 chars and reject []:*?/\ — sanitise but keep the campaign identity.
  const sheetName = campaign.title.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Data request";
  const ws = wb.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 4 }] });

  // Title block
  const title = ws.addRow([campaign.title]);
  title.getCell(1).font = { bold: true, size: 14, color: { argb: NAVY } };
  const sub = ws.addRow([
    `${campaign.audience} · launched ${formatDate(campaign.createdAt)} by ${campaign.createdBy?.name ?? "—"} · ${completed.length}/${active.length} complete`,
  ]);
  sub.getCell(1).font = { italic: true, size: 9, color: { argb: "FF5C6B7A" } };
  ws.addRow([]);

  // Header
  const headerLabels = [
    "Name",
    "Email",
    ...campaign.fields.map((key) => campaignFieldLabel(key)),
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

  // Data — just the submitted values (per the CSV feedback), Status last.
  for (const t of campaign.targets) {
    const left = t.user.status !== "ACTIVE";
    const done = t.fields.every((f) => f.status !== "PENDING");
    const status = left ? "Left the company" : done ? "Complete" : "Pending";
    const row = ws.addRow([
      t.user.name,
      t.user.email,
      ...campaign.fields.map((key) => {
        const f = t.fields.find((x) => x.field === key);
        if (!f || f.value == null || f.status === "PENDING") return "";
        return campaignField(key)?.display(f.value) ?? f.value;
      }),
      status,
    ]);
    row.eachCell({ includeEmpty: true }, (c) => {
      c.border = { bottom: { style: "thin", color: { argb: "FFE7E3DA" } } };
    });
    const statusCell = row.getCell(headerLabels.length);
    statusCell.font = { bold: true, size: 10, color: { argb: STATUS_COLOR[status] ?? "FF16202E" } };
  }

  // Filters over the data table + readable column widths.
  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: ws.rowCount, column: headerLabels.length },
  };
  ws.columns.forEach((col, i) => {
    const key = campaign.fields[i - 2]; // columns 0/1 are Name/Email, last is Status
    if (i === 0) col.width = 26;
    else if (i === 1) col.width = 32;
    else if (i === headerLabels.length - 1) col.width = 18;
    else col.width = key === "dependants" ? 40 : 22;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const safeTitle = campaign.title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "campaign";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="data-request-${safeTitle}.xlsx"`,
    },
  });
}
