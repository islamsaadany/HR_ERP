import { NextResponse } from "next/server";
import { requireSuperUser } from "@/lib/roles";
import { INCENTIVE_TEMPLATES } from "@/lib/incentive/templates";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ sheet: string }> }) {
  await requireSuperUser();
  const { sheet } = await params;
  const tpl = INCENTIVE_TEMPLATES[sheet as keyof typeof INCENTIVE_TEMPLATES];
  if (!tpl) return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  return new NextResponse(tpl.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tpl.filename}"`,
    },
  });
}
