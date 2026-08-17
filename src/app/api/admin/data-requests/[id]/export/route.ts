import { NextResponse } from "next/server";
import { requireDataRequestManager } from "@/lib/roles";
import { campaignTracker } from "@/lib/profile/campaigns";
import { campaignField, campaignFieldLabel } from "@/lib/profile/campaign-fields";

export const dynamic = "force-dynamic";

/** Minimal RFC-4180 CSV field escaping (matches the registry export). */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The campaign outcome as a CSV (spec 033): one row per targeted employee, one value column
 * per requested field — just the submitted data (feedback 2026-08-17). Downloaded from the
 * tracker by whoever can read it (HR Admin / Finance / Super User).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireDataRequestManager();
  const { id } = await params;
  const campaign = await campaignTracker(id);
  if (!campaign) return new NextResponse("Not found", { status: 404 });

  // Just the submitted data (feedback 2026-08-17): one value column per field, no per-field
  // outcome columns. The single Status column stays so a pending row's empty cells are never
  // mistaken for cleared values; outcomes remain visible on the tracker.
  const header = [
    "Name",
    "Email",
    "Status",
    ...campaign.fields.map((key) => campaignFieldLabel(key)),
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const t of campaign.targets) {
    const left = t.user.status !== "ACTIVE";
    const done = t.fields.every((f) => f.status !== "PENDING");
    const row = [
      t.user.name,
      t.user.email,
      left ? "Left the company" : done ? "Complete" : "Pending",
      ...campaign.fields.map((key) => {
        const f = t.fields.find((x) => x.field === key);
        if (!f || f.value == null || f.status === "PENDING") return "";
        return campaignField(key)?.display(f.value) ?? f.value;
      }),
    ];
    lines.push(row.map(csvCell).join(","));
  }

  const csv = lines.join("\r\n") + "\r\n";
  const safeTitle = campaign.title.replace(/[^\w.-]+/g, "-").slice(0, 60) || "campaign";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-request-${safeTitle}.csv"`,
    },
  });
}
