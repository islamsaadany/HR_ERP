import { NextResponse } from "next/server";
import { requireIncentiveAccess } from "@/lib/roles";
import { INCENTIVE_TEMPLATES } from "@/lib/incentive/templates";
import { buildPrefilledTemplate } from "@/lib/incentive/prefill";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ sheet: string }> }) {
  await requireIncentiveAccess();
  const { sheet } = await params;
  const key = sheet as keyof typeof INCENTIVE_TEMPLATES;
  if (!(key in INCENTIVE_TEMPLATES)) return NextResponse.json({ error: "Unknown template" }, { status: 404 });

  // With a cycle in context, seed the sheet from data we already hold (registry +
  // the prior cycle's clients). Without one, fall back to the static sample template.
  const cycleId = new URL(req.url).searchParams.get("cycleId");
  const tpl = cycleId ? await buildPrefilledTemplate(key, cycleId) : null;
  const { filename, csv } = tpl ?? INCENTIVE_TEMPLATES[key];

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
