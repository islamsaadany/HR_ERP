"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { getActivePlanYear, amountForBand, isSalaryDriven, isEligibleFor } from "@/lib/benefits/config";

export type ReleaseResult = { ok: boolean; error?: string; skipped?: number };

/**
 * Mark (or un-mark) a set of employees as "Released" for a fixed-allowance guaranteed benefit,
 * in the active plan year (spec 013). HR/Super-User only. Salary-driven benefits (Loans) are
 * rejected. Only active employees of the benefit's employment type with a resolvable band amount
 * are affected; the released amount snapshots the band figure at release time.
 */
export async function setReleased(
  benefitId: string,
  userIds: string[],
  released: boolean
): Promise<ReleaseResult> {
  const actor = await requireAdmin();

  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, error: "Benefits selection isn't open right now." };

  const benefit = await prisma.guaranteedBenefit.findUnique({ where: { id: benefitId } });
  if (!benefit) return { ok: false, error: "Benefit not found." };
  if (isSalaryDriven(benefit)) {
    return { ok: false, error: "Salary-driven benefits (Loans) can't be released here." };
  }
  if (userIds.length === 0) return { ok: true };

  if (released) {
    // A benefit already received (or in flight) via a CLAIM this cycle must not be released
    // on top — that pays the person twice (the Summer-allowance double, 2026-08-18). Every
    // non-rejected claim blocks: SUBMITTED reserves it, APPROVED/REIMBURSED already granted it.
    const claimed = await prisma.benefitClaim.findMany({
      where: {
        guaranteedBenefitId: benefitId,
        planYearId: planYear.id,
        userId: { in: userIds },
        status: { not: "REJECTED" },
      },
      select: { userId: true },
    });
    const alreadyClaimed = new Set(claimed.map((c) => c.userId));

    // Only active employees whose employment type is eligible for this benefit, with a resolvable band amount.
    const users = await prisma.user.findMany({
      where: { id: { in: userIds.filter((id) => !alreadyClaimed.has(id)) }, status: "ACTIVE" },
      select: { id: true, tenureBand: true, employmentType: true },
    });
    const data = users
      .map((u) => ({
        id: u.id,
        amount:
          u.tenureBand && u.employmentType && isEligibleFor(u.employmentType, benefit)
            ? amountForBand(u.employmentType, u.tenureBand, benefit)
            : null,
      }))
      .filter((x): x is { id: string; amount: number } => x.amount != null)
      .map((x) => ({
        userId: x.id,
        guaranteedBenefitId: benefitId,
        planYearId: planYear.id,
        amount: x.amount,
        releasedById: actor.id,
      }));
    if (data.length > 0) {
      // Presence of a row = released; skipDuplicates keeps the first release's snapshot/date.
      await prisma.benefitRelease.createMany({ data, skipDuplicates: true });
    }
    if (alreadyClaimed.size > 0) {
      revalidatePath("/admin/benefits/release");
      return { ok: true, skipped: alreadyClaimed.size };
    }
  } else {
    await prisma.benefitRelease.deleteMany({
      where: { guaranteedBenefitId: benefitId, planYearId: planYear.id, userId: { in: userIds } },
    });
  }

  revalidatePath("/admin/benefits/release");
  return { ok: true };
}
