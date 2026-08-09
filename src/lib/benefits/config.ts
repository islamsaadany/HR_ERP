import type { EmploymentType, TenureBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlanYearWindow } from "@/lib/benefits/proration";

/** Pick a guaranteed-benefit amount for a tenure band from its four columns. */
export function amountForBand(
  band: TenureBand,
  row: {
    band6mo2y: number | null;
    band2to4y: number | null;
    band4to7y: number | null;
    band7to10y: number | null;
  }
): number | null {
  switch (band) {
    case "BAND_6MO_2Y":
      return row.band6mo2y;
    case "BAND_2_4Y":
      return row.band2to4y;
    case "BAND_4_7Y":
      return row.band4to7y;
    case "BAND_7_10Y":
      return row.band7to10y;
  }
}

export async function getActivePlanYear() {
  return prisma.planYear.findFirst({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * The plan year's proration window (spec 019), or null when either date is unset
 * — callers treat null as "no window → no proration" and warn the admin.
 */
export function planYearWindow(
  planYear: { startDate: Date | null; endDate: Date | null } | null | undefined
): PlanYearWindow {
  if (!planYear?.startDate || !planYear?.endDate) return null;
  return { start: planYear.startDate, end: planYear.endDate };
}

/**
 * Pool ceiling for (employment type × tenure band). Falls back to the entry tier
 * (BAND_6MO_2Y) when the employee has no band yet — used for medical, which
 * unlocks at 3 months before a band is assigned (spec 019). Returns the ceiling
 * amount, or null if not configured.
 */
export async function poolCeilingFor(
  employmentType: EmploymentType,
  band: TenureBand | null
): Promise<number | null> {
  const row = await prisma.poolCeiling.findUnique({
    where: {
      employmentType_tenureBand: {
        employmentType,
        tenureBand: band ?? "BAND_6MO_2Y",
      },
    },
  });
  return row?.amount ?? null;
}

export async function getMedicalRate() {
  return prisma.medicalRateCard.findFirst();
}

/** The employee's committed medical election for a plan year, or null if not yet committed (spec 018). */
export async function getMedicalCommitment(userId: string, planYearId: string) {
  return prisma.medicalCommitment.findUnique({
    where: { userId_planYearId: { userId, planYearId } },
  });
}
