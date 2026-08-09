import type { TenureBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

export async function getMedicalRate() {
  return prisma.medicalRateCard.findFirst();
}

/** The employee's committed medical election for a plan year, or null if not yet committed (spec 018). */
export async function getMedicalCommitment(userId: string, planYearId: string) {
  return prisma.medicalCommitment.findUnique({
    where: { userId_planYearId: { userId, planYearId } },
  });
}
