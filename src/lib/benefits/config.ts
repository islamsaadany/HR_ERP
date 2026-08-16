import type { EmploymentType, TenureBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PlanYearWindow } from "@/lib/benefits/proration";
import type { Band } from "@/lib/benefits/rates";

/**
 * Pick a guaranteed-benefit amount for an employee, from the row's per-employment-type
 * band columns (spec 021: ft* for full-time, pt* for part-time).
 */
export function amountForBand(
  employmentType: EmploymentType,
  band: TenureBand,
  row: {
    ftBand6mo2y: number | null;
    ftBand2to4y: number | null;
    ftBand4to7y: number | null;
    ftBand7to10y: number | null;
    ptBand6mo2y: number | null;
    ptBand2to4y: number | null;
    ptBand4to7y: number | null;
    ptBand7to10y: number | null;
  }
): number | null {
  const ft = employmentType === "FULL_TIME";
  switch (band) {
    case "BAND_6MO_2Y":
      return ft ? row.ftBand6mo2y : row.ptBand6mo2y;
    case "BAND_2_4Y":
      return ft ? row.ftBand2to4y : row.ptBand2to4y;
    case "BAND_4_7Y":
      return ft ? row.ftBand4to7y : row.ptBand4to7y;
    case "BAND_7_10Y":
      return ft ? row.ftBand7to10y : row.ptBand7to10y;
  }
}

/** The four per-tenure-band amount columns a fixed-allowance catalogue item carries. */
export type BandAmounts = {
  band6mo2y: number | null;
  band2to4y: number | null;
  band4to7y: number | null;
  band7to10y: number | null;
};

/**
 * A flexible benefit's fixed allowance for a tenure band, or null when it isn't one
 * (spec 028 — travel allowance). Unlike `amountForBand`, this takes no employment type:
 * full- and part-timers get the same amount, and their differing pool ceilings do the
 * rest of the work.
 */
export function fixedAllowanceFor(band: TenureBand, row: BandAmounts): number | null {
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

/**
 * True when a catalogue item is a fixed allowance (an entitlement requested in full) rather
 * than a receipt-based, coverage-rate claim. Any band amount set makes it one.
 */
export function isFixedAllowance(row: BandAmounts): boolean {
  return (
    row.band6mo2y != null ||
    row.band2to4y != null ||
    row.band4to7y != null ||
    row.band7to10y != null
  );
}

/** Which eligibility flag applies to an employment type (spec 021). */
export function eligibilityWhere(employmentType: EmploymentType) {
  return employmentType === "FULL_TIME"
    ? { eligibleFullTime: true }
    : { eligiblePartTime: true };
}

/** True when an employee's employment type is eligible for a benefit (spec 021). */
export function isEligibleFor(
  employmentType: EmploymentType,
  row: { eligibleFullTime: boolean; eligiblePartTime: boolean }
): boolean {
  return employmentType === "FULL_TIME" ? row.eligibleFullTime : row.eligiblePartTime;
}

/**
 * A guaranteed benefit is "salary-driven" (e.g. Loans — one month's salary, not a fixed
 * figure) when no band amount is set for either employment type (spec 021).
 */
export function isSalaryDriven(row: {
  ftBand6mo2y: number | null;
  ftBand2to4y: number | null;
  ftBand4to7y: number | null;
  ftBand7to10y: number | null;
  ptBand6mo2y: number | null;
  ptBand2to4y: number | null;
  ptBand4to7y: number | null;
  ptBand7to10y: number | null;
}): boolean {
  return (
    row.ftBand6mo2y == null &&
    row.ftBand2to4y == null &&
    row.ftBand4to7y == null &&
    row.ftBand7to10y == null &&
    row.ptBand6mo2y == null &&
    row.ptBand2to4y == null &&
    row.ptBand4to7y == null &&
    row.ptBand7to10y == null
  );
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

/**
 * The age-banded medical rate card for a tier (spec 023), ordered youngest→oldest. Prisma returns
 * `annualPremium` as a Decimal; convert to a plain number for the pure pricing helpers (`rates.ts`).
 */
export async function getMedicalRateBands(tier = 1): Promise<Band[]> {
  const rows = await prisma.medicalRateBand.findMany({
    where: { tier },
    orderBy: { order: "asc" },
  });
  return rows.map((r) => ({
    tier: r.tier,
    minAge: r.minAge,
    maxAge: r.maxAge,
    annualPremium: Number(r.annualPremium),
  }));
}

/**
 * Which medical cover an employee's employment type is eligible for (spec 021), read from the
 * active medical catalogue items. `family` implies dependant pickers are shown; `offered` gates
 * whether any medical row appears at all. A medical item with no scope is treated as Personal.
 */
export async function medicalScopeFor(
  employmentType: EmploymentType
): Promise<{ personal: boolean; family: boolean; offered: boolean }> {
  const items = await prisma.benefitCatalogItem.findMany({
    where: { isMedical: true, active: true, ...eligibilityWhere(employmentType) },
    select: { medicalScope: true },
  });
  const family = items.some((i) => i.medicalScope === "FAMILY");
  const personal = items.some((i) => i.medicalScope === "PERSONAL" || i.medicalScope == null);
  return { personal, family, offered: personal || family };
}

/** The employee's committed medical election for a plan year, or null if not yet committed (spec 018).
 *  Includes the per-covered-person snapshot (spec 023) for an explainable premium breakdown. */
export async function getMedicalCommitment(userId: string, planYearId: string) {
  return prisma.medicalCommitment.findUnique({
    where: { userId_planYearId: { userId, planYearId } },
    include: { coveredPeople: true },
  });
}
