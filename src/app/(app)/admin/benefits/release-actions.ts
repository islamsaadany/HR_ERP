"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { getActivePlanYear, amountForBand } from "@/lib/benefits/config";

export type ReleaseResult = { ok: boolean; error?: string };

/** A guaranteed benefit is salary-driven (Loans) when all four band amounts are null. */
function isSalaryDriven(b: {
  band6mo2y: number | null;
  band2to4y: number | null;
  band4to7y: number | null;
  band7to10y: number | null;
}): boolean {
  return b.band6mo2y == null && b.band2to4y == null && b.band4to7y == null && b.band7to10y == null;
}

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
    // Only active employees of this benefit's employment type, with a resolvable band amount.
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, status: "ACTIVE", employmentType: benefit.employmentType },
      select: { id: true, tenureBand: true },
    });
    const data = users
      .map((u) => ({ id: u.id, amount: u.tenureBand ? amountForBand(u.tenureBand, benefit) : null }))
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
  } else {
    await prisma.benefitRelease.deleteMany({
      where: { guaranteedBenefitId: benefitId, planYearId: planYear.id, userId: { in: userIds } },
    });
  }

  revalidatePath("/admin/benefits/release");
  return { ok: true };
}
