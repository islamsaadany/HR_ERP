import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear } from "@/lib/benefits/config";

export const dynamic = "force-dynamic";

/** Minimal RFC-4180 CSV field escaping. */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export the plan-year's benefits activity as CSV for Finance (spec 018): one row per committed
 * medical premium and one row per filed claim (employee × benefit × covered amount × status).
 * HR / Super User only.
 */
export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const planYearId = url.searchParams.get("planYearId");
  const planYear = planYearId
    ? await prisma.planYear.findUnique({ where: { id: planYearId } })
    : await getActivePlanYear();

  if (!planYear) {
    return NextResponse.json({ error: "No plan year found." }, { status: 404 });
  }

  const [commitments, claims] = await Promise.all([
    prisma.medicalCommitment.findMany({
      where: { planYearId: planYear.id },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.benefitClaim.findMany({
      where: { planYearId: planYear.id },
      include: {
        user: { select: { name: true, email: true } },
        catalogItem: { select: { name: true, category: true } },
        guaranteedBenefit: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const header = [
    "Plan Year",
    "Employee",
    "Email",
    "Benefit",
    "Type",
    "Category",
    "Covered Amount (EGP)",
    "Status",
    "Date",
  ];
  const rows: string[] = [header.map(csvCell).join(",")];

  // Committed medical premiums (automatic cover, not a claim).
  for (const c of commitments) {
    rows.push(
      [
        planYear.name,
        c.user.name,
        c.user.email,
        "Medical insurance",
        "Medical (committed)",
        "",
        c.premium,
        "Committed",
        c.committedAt.toISOString().slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    );
  }

  // Filed claims (flexible + guaranteed).
  for (const cl of claims) {
    const name = cl.catalogItem?.name ?? cl.guaranteedBenefit?.name ?? "";
    const type = cl.catalogItemId ? "Flexible" : "Guaranteed";
    rows.push(
      [
        planYear.name,
        cl.user.name,
        cl.user.email,
        name,
        type,
        cl.catalogItem?.category ?? "",
        cl.amount,
        cl.status,
        cl.createdAt.toISOString().slice(0, 10),
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const csv = rows.join("\r\n") + "\r\n";
  const filename = `benefits-${planYear.name.replace(/[^\w.-]+/g, "_")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
