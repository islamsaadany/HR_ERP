import { NextResponse } from "next/server";
import { requireIncentiveAccess } from "@/lib/roles";
import { loadCycleReport } from "@/lib/incentive/load";
import { buildCalculationWorkbook } from "@/lib/incentive/calc-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // exceljs needs the Node runtime

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireIncentiveAccess();
  const { id } = await params;

  const loaded = await loadCycleReport(id);
  if (!loaded) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const buffer = await buildCalculationWorkbook(loaded.label, loaded.report);
  const safeLabel = loaded.label.replace(/[^a-z0-9._-]+/gi, "_");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="incentive-${safeLabel}-calculation.xlsx"`,
    },
  });
}
