import { prisma } from "@/lib/prisma";
import { classifyEligibility, hasKnownStartDate } from "@/lib/benefits/proration";
import { planYearWindow } from "@/lib/benefits/config";

/**
 * What "needs attention" means in Benefits — defined once (mockup signed off 2026-08-16).
 *
 * Three surfaces read this: the admin home's card pill, the Medical tab's badge, and each
 * commitment row's charge-state chip. They must never disagree — a card saying "2 need
 * attention" that opens onto a list showing three is worse than no badge at all, so the
 * predicate lives here rather than in each of them.
 */

/** One commitment's charges, as much as the attention rules need to know about them. */
export type ChargeLike = {
  amount: number;
  status: "APPLIED" | "SCHEDULED" | "CANCELLED";
  planYear: { status: string };
};

export type CommitmentAttention = {
  /** Charged beyond what the cover costs. Zero unless something went wrong. */
  overCharged: number;
  /** A charge was cancelled — the employee left mid-term and premium is recoverable (spec 030). */
  coverEnded: boolean;
  /** Part of the premium is drawn from a closed cycle and can no longer be rewritten (spec 027). */
  frozen: boolean;
  /** Any of the above. */
  attention: boolean;
};

/** Classify one commitment. Pure — the row, the badge and the pill all call this. */
export function commitmentAttention(premium: number, charges: ChargeLike[]): CommitmentAttention {
  const chargeTotal = charges.reduce((n, c) => n + c.amount, 0);
  const overCharged = Math.max(0, chargeTotal - premium);
  const coverEnded = charges.some((c) => c.status === "CANCELLED");
  const frozen = charges.some((c) => c.status === "APPLIED" && c.planYear.status === "CLOSED");
  return { overCharged, coverEnded, frozen, attention: overCharged > 0 || coverEnded || frozen };
}

export type BenefitsAttention = {
  /** Claims waiting for an HR decision. */
  claimsToReview: number;
  overCharged: number;
  coverEnded: number;
  frozen: number;
  /** Eligible employees who cannot commit because they have no date of birth (spec 023). */
  blocked: number;
  /** Everything the Medical tab's badge counts. */
  medical: number;
  /** Everything the admin card's pill counts. */
  total: number;
};

const EMPTY: BenefitsAttention = {
  claimsToReview: 0,
  overCharged: 0,
  coverEnded: 0,
  frozen: 0,
  blocked: 0,
  medical: 0,
  total: 0,
};

/**
 * Count what is waiting in Benefits for the open cycle.
 *
 * Deliberately NOT counted: employees who simply haven't committed yet. That number is
 * large, normal and never urgent — in a pill it would keep the card permanently lit and
 * teach everyone to ignore it. It stays a filter inside the Medical tab.
 */
export async function benefitsAttention(): Promise<BenefitsAttention> {
  const planYears = await prisma.planYear.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, startDate: true, endDate: true },
  });
  const active = planYears.find((p) => p.status === "OPEN") ?? planYears[0];
  if (!active) return EMPTY;

  const [claimsToReview, commitments, activeEmployees] = await Promise.all([
    prisma.benefitClaim.count({ where: { planYearId: active.id, status: "SUBMITTED" } }),
    prisma.medicalCommitment.findMany({
      where: { planYearId: active.id },
      select: {
        userId: true,
        premium: true,
        cycleCharges: { select: { amount: true, status: true, planYear: { select: { status: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", employmentType: { not: null }, dateOfBirth: null },
      select: { id: true, startDate: true },
    }),
  ]);

  let overCharged = 0;
  let coverEnded = 0;
  let frozen = 0;
  for (const c of commitments) {
    const a = commitmentAttention(c.premium, c.cycleCharges as ChargeLike[]);
    if (a.overCharged > 0) overCharged += 1;
    if (a.coverEnded) coverEnded += 1;
    if (a.frozen) frozen += 1;
  }

  // Only people who are actually eligible to commit count as blocked — someone in their
  // first three months isn't being held up by anything.
  const window = planYearWindow(active);
  const committed = new Set(commitments.map((c) => c.userId));
  const blocked = activeEmployees.filter(
    (u) =>
      !committed.has(u.id) &&
      hasKnownStartDate(u.startDate) &&
      classifyEligibility(u.startDate, 3, window).status !== "NOT_YET"
  ).length;

  const medical = overCharged + coverEnded + frozen;
  return { claimsToReview, overCharged, coverEnded, frozen, blocked, medical, total: claimsToReview + medical + blocked };
}

/** Leave requests waiting for a decision — the Time-Off card's pill. */
export async function pendingLeaveCount(): Promise<number> {
  return prisma.leaveRequest.count({ where: { status: "PENDING" } });
}
