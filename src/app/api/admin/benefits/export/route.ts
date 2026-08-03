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
 * Export the plan-year's benefit submissions as CSV for Finance — one row per
 * selected benefit line (employee × benefit × amount). HR / Super User only.
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

  const selections = await prisma.benefitSelection.findMany({
    where: { planYearId: planYear.id },
    include: {
      user: { select: { name: true, email: true } },
      lines: { include: { catalogItem: { select: { name: true, category: true, isMedical: true } } } },
    },
    orderBy: [{ status: "asc" }, { user: { name: "asc" } }],
  });

  const header = [
    "Plan Year",
    "Employee",
    "Email",
    "Status",
    "Submitted At",
    "Benefit",
    "Category",
    "Medical",
    "Amount (EGP)",
  ];
  const rows: string[] = [header.map(csvCell).join(",")];

  for (const s of selections) {
    const submittedAt = s.submittedAt ? s.submittedAt.toISOString().slice(0, 10) : "";
    if (s.lines.length === 0) {
      // Keep the employee visible even with an empty basket (e.g. a draft).
      rows.push(
        [planYear.name, s.user.name, s.user.email, s.status, submittedAt, "", "", "", "0"]
          .map(csvCell)
          .join(",")
      );
      continue;
    }
    for (const l of s.lines) {
      rows.push(
        [
          planYear.name,
          s.user.name,
          s.user.email,
          s.status,
          submittedAt,
          l.catalogItem.name,
          l.catalogItem.category ?? "",
          l.catalogItem.isMedical ? "Yes" : "No",
          l.amount,
        ]
          .map(csvCell)
          .join(",")
      );
    }
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
