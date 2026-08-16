"use server";

import { revalidatePath } from "next/cache";
import { formatEGP } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getActivePlanYear, getActivePolicyYear, getMedicalRateBands, medicalPolicyWindow, planYearWindow, poolCeilingFor, medicalScopeFor } from "@/lib/benefits/config";
import { classifyEligibility, prorate } from "@/lib/benefits/proration";
import { splitPremium } from "@/lib/benefits/policy-year";
import { sumMedicalPremium, proratedPremiumEGP, type PricedPerson } from "@/lib/benefits/rates";
import { deriveTenureBand } from "@/lib/tenure";

/** Medical insurance unlocks at 3 months of service (spec 019), before the 6-month basket. */
const MEDICAL_THRESHOLD_MONTHS = 3;

/** The covered dependants (spouse + children) the employee ticked; the employee is always included. */
export type MedicalPayload = {
  dependantIds: string[];
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
    select: {
      name: true,
      employmentType: true,
      tenureBand: true,
      startDate: true,
      dateOfBirth: true,
      dependants: { select: { id: true, name: true, dateOfBirth: true, kind: true } },
    },
  });
  if (!user?.employmentType) {
    return { ok: false, errors: ["Your employment type isn't set — contact HR."], warnings: [] };
  }
  // Age-band pricing needs the employee's DOB (spec 023) — block rather than guess.
  if (!user.dateOfBirth) {
    return {
      ok: false,
      errors: ["A date of birth is required to price medical. Contact HR to add your date of birth, then set up cover."],
      warnings: [],
    };
  }

  // Personal/Family gate (spec 021): only Family-eligible employees may add dependants.
  const scope = await medicalScopeFor(user.employmentType);
  if (!scope.offered) {
    return { ok: false, errors: ["Medical insurance isn't available to you."], warnings: [] };
  }

  // Resolve the ticked dependants against the employee's own records (spec 023). A selected id that
  // isn't theirs — or a Personal-only employee selecting anyone — is rejected, never guessed.
  const selectedIds = Array.from(new Set(payload.dependantIds ?? []));
  const covered = user.dependants.filter((d) => selectedIds.includes(d.id));
  if (covered.length !== selectedIds.length) {
    return { ok: false, errors: ["One of the selected dependants isn't on your record. Refresh and try again."], warnings: [] };
  }
  if (!scope.family && covered.length > 0) {
    return { ok: false, errors: ["You're eligible for personal medical only — remove spouse and children."], warnings: [] };
  }

  // Medical unlocks at 3 months of service (spec 019) — before the 6-month basket — and is
  // prorated for the remaining whole months of the POLICY TERM from that eligibility date
  // (spec 027). The term is what the premium buys, so it is what a mid-term joiner is prorated
  // against; falls back to the plan-year window when HR hasn't configured a term.
  const policyYear = await getActivePolicyYear();
  const policyWindow = medicalPolicyWindow(policyYear, planYear);
  const medicalEligibility = classifyEligibility(
    user.startDate,
    MEDICAL_THRESHOLD_MONTHS,
    policyWindow
  );
  if (medicalEligibility.status === "NOT_YET") {
    return { ok: false, errors: ["Medical insurance becomes available after 3 months of service."], warnings: [] };
  }

  const [ceilingAmount, bands, existing] = await Promise.all([
    // Tenure band is derived from the hire date so it's always current (entry-tier
    // 6mo–2y fallback inside poolCeilingFor when a sub-6-month employee has no band).
    poolCeilingFor(user.employmentType, deriveTenureBand(user.startDate).band),
    getMedicalRateBands(),
    // "Already committed?" is now a question about the POLICY TERM, not the cycle — a renewal
    // is a new commitment, and a term spanning two cycles must not read as two commitments.
    prisma.medicalCommitment.findFirst({
      where: { userId: me.id, OR: [{ cycleCharges: { some: { planYearId: planYear.id } } }, { planYearId: planYear.id }] },
    }),
  ]);
  if (ceilingAmount == null || bands.length === 0) {
    return { ok: false, errors: ["Benefits aren't fully configured yet."], warnings: [] };
  }
  if (existing) {
    return { ok: false, errors: ["Medical is already committed. Contact HR to change it."], warnings: [] };
  }

  // Price per person by age at the COMMIT DATE (spec 023). The employee is always covered.
  const refDate = new Date();
  const people: PricedPerson[] = [{ dob: user.dateOfBirth }, ...covered.map((d) => ({ dob: d.dateOfBirth }))];
  const { annualEGP, lines, anyOverTop } = sumMedicalPremium(people, bands, refDate);

  // Prorate the annual premium and the pool cap by the medical eligibility fraction (1 for a full year).
  const proratedCeiling = prorate(ceilingAmount, medicalEligibility.fraction);
  const proratedPremium = proratedPremiumEGP(annualEGP, medicalEligibility.fraction);
  const premium = Math.min(proratedPremium, proratedCeiling);

  const warnings: string[] = [];
  if (proratedPremium > proratedCeiling) {
    warnings.push(
      `Your medical premium of ${formatEGP(proratedPremium)} exceeds your pool — capped at ${formatEGP(proratedCeiling)}. Contact HR.`
    );
  }
  if (anyOverTop) {
    warnings.push("A covered person is over 75 and was priced at the top age band — HR will review.");
  }

  // Build the covered-person snapshot (lines align 1:1 with `people`: index 0 = employee).
  const coveredPeople = [
    { dependantId: null as string | null, label: user.name ?? "Employee", ageAtCommit: lines[0].ageAtCommit, premiumEGP: lines[0].premiumEGP },
    ...covered.map((d, i) => ({
      dependantId: d.id,
      label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}${lines[i + 1].overTop ? " (over 75 — top band)" : ""}`,
      ageAtCommit: lines[i + 1].ageAtCommit,
      premiumEGP: lines[i + 1].premiumEGP,
    })),
  ];

  // Split the premium across the benefits cycles the policy term overlaps (spec 027): this
  // cycle's pool absorbs only its months, the rest is charged when the next cycle opens. With no
  // policy term configured the window IS the plan year, so this yields one charge for the whole
  // premium — today's behaviour, through the same code path rather than a special case.
  const cycles = policyWindow
    ? await prisma.planYear.findMany({
        where: { startDate: { not: null }, endDate: { not: null } },
        orderBy: { startDate: "asc" },
        select: { id: true, startDate: true, endDate: true },
      })
    : [];
  const dated = cycles
    .filter((c): c is { id: string; startDate: Date; endDate: Date } => !!c.startDate && !!c.endDate)
    .map((c) => ({ id: c.id, start: c.startDate, end: c.endDate }));
  const split = policyWindow ? splitPremium(premium, policyWindow, dated) : null;

  // Fall back to a single charge on the active cycle when there is no window to split against —
  // the money must land somewhere, and the cycle being committed in is the only defensible place.
  const shares =
    split && split.shares.length > 0
      ? split.shares.map((sh) => ({
          planYearId: sh.cycle.id,
          amount: sh.amount,
          overlapMonths: sh.overlapMonths,
        }))
      : [{ planYearId: planYear.id, amount: premium, overlapMonths: 0 }];

  await prisma.medicalCommitment.create({
    data: {
      userId: me.id,
      planYearId: planYear.id,
      policyYearId: policyYear?.id ?? null,
      premium,
      coveredPeople: { create: coveredPeople },
      ...(policyYear
        ? {
            cycleCharges: {
              create: shares.map((sh) => ({
                planYearId: sh.planYearId,
                policyYearId: policyYear.id,
                amount: sh.amount,
                overlapMonths: sh.overlapMonths,
                // Only the cycle being committed in draws now; later cycles wait for their open.
                status: sh.planYearId === planYear.id ? ("APPLIED" as const) : ("SCHEDULED" as const),
                appliedAt: sh.planYearId === planYear.id ? new Date() : null,
              })),
            },
          }
        : {}),
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
