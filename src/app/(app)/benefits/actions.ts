"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getActivePlanYear, getMedicalRate, planYearWindow, poolCeilingFor } from "@/lib/benefits/config";
import { computeMedicalPremium, type MedicalConfig } from "@/lib/benefits/rules";
import { classifyEligibility, prorate } from "@/lib/benefits/proration";

/** Medical insurance unlocks at 3 months of service (spec 019), before the 6-month basket. */
const MEDICAL_THRESHOLD_MONTHS = 3;

export type MedicalPayload = {
  spouse: boolean;
  childrenUnder18: number;
  children18Plus: number;
};

export type CommitResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  premium?: number;
};

/**
 * Commit the employee's medical election once for the active plan year (spec 018). Medical is the
 * single commitment in the module: after this it is locked and only HR can change/remove it. The
 * premium is drawn from the pool (capped at the ceiling) as automatic cover and is never "claimed".
 */
export async function commitMedical(payload: MedicalPayload): Promise<CommitResult> {
  const me = await requireUser();

  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, errors: ["Benefits selection isn't open right now."], warnings: [] };

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { employmentType: true, tenureBand: true, startDate: true },
  });
  if (!user?.employmentType) {
    return { ok: false, errors: ["Your employment type isn't set — contact HR."], warnings: [] };
  }

  // Medical unlocks at 3 months of service (spec 019) — before the 6-month basket — and is
  // prorated for the remaining whole months of the plan year from that eligibility date.
  const medicalEligibility = classifyEligibility(
    user.startDate,
    MEDICAL_THRESHOLD_MONTHS,
    planYearWindow(planYear)
  );
  if (medicalEligibility.status === "NOT_YET") {
    return { ok: false, errors: ["Medical insurance becomes available after 3 months of service."], warnings: [] };
  }

  const [ceilingAmount, medicalRate, existing] = await Promise.all([
    // Entry-tier (6mo–2y) fallback when a sub-6-month employee has no band yet.
    poolCeilingFor(user.employmentType, user.tenureBand),
    getMedicalRate(),
    prisma.medicalCommitment.findUnique({
      where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
    }),
  ]);
  if (ceilingAmount == null || !medicalRate) {
    return { ok: false, errors: ["Benefits aren't fully configured yet."], warnings: [] };
  }
  if (existing) {
    return { ok: false, errors: ["Medical is already committed. Contact HR to change it."], warnings: [] };
  }

  const cfg: MedicalConfig = {
    spouse: !!payload.spouse,
    childrenUnder18: Math.max(0, Math.floor(payload.childrenUnder18)),
    children18Plus: Math.max(0, Math.floor(payload.children18Plus)),
  };
  const rawPremium = computeMedicalPremium(medicalRate, cfg);
  // Prorate both the annual premium and the pool cap by the medical eligibility fraction
  // (fraction = 1 for a full-year employee, so this is a no-op for them).
  const proratedCeiling = prorate(ceilingAmount, medicalEligibility.fraction);
  const proratedPremium = prorate(rawPremium, medicalEligibility.fraction);
  const premium = Math.min(proratedPremium, proratedCeiling);

  const warnings: string[] = [];
  if (proratedPremium > proratedCeiling) {
    warnings.push(
      `Your medical premium of EGP ${proratedPremium.toLocaleString()} exceeds your pool — capped at EGP ${proratedCeiling.toLocaleString()}. Contact HR.`
    );
  }

  await prisma.medicalCommitment.create({
    data: {
      userId: me.id,
      planYearId: planYear.id,
      spouse: cfg.spouse,
      childrenUnder18: cfg.childrenUnder18,
      children18Plus: cfg.children18Plus,
      premium,
    },
  });

  revalidatePath("/benefits");
  revalidatePath("/dashboard");
  return { ok: true, errors: [], warnings, premium };
}

/**
 * Mark the Benefits orientation tour as seen for the current user (spec 017), so it stops
 * auto-opening. Set once; a no-op if already set. The "How it works" button ignores this flag.
 */
export async function markOrientationSeen(): Promise<void> {
  const me = await requireUser();
  await prisma.user.updateMany({
    where: { id: me.id, benefitsOrientationSeenAt: null },
    data: { benefitsOrientationSeenAt: new Date() },
  });
  revalidatePath("/benefits");
}
