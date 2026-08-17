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

const OUTCOME: Record<string, string> = {
  PENDING: "Pending",
  FILLED: "Filled",
  CONFIRMED: "Confirmed",
  CORRECTED: "Corrected",
};

/**
 * The campaign outcome as a CSV (spec 033 follow-up, 2026-08-17): one row per targeted
 * employee, one value + outcome column pair per requested field. Downloaded from the
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

  const header = [
    "Name",
    "Email",
    "Status",
    ...campaign.fields.flatMap((key) => [campaignFieldLabel(key), `${campaignFieldLabel(key)} — outcome`]),
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const t of campaign.targets) {
    const left = t.user.status !== "ACTIVE";
    const done = t.fields.every((f) => f.status !== "PENDING");
    const row = [
      t.user.name,
      t.user.email,
      left ? "Left the company" : done ? "Complete" : "Pending",
      ...campaign.fields.flatMap((key) => {
        const f = t.fields.find((x) => x.field === key);
        if (!f) return ["", ""];
        const value =
          f.value != null && f.status !== "PENDING"
            ? campaignField(key)?.display(f.value) ?? f.value
            : "";
        return [value, OUTCOME[f.status] ?? f.status];
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
