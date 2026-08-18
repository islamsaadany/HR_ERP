"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { isSalaryDriven } from "@/lib/benefits/config";
import { getActivePlanYear } from "@/lib/benefits/config";

export type GrantResult = { ok: true; message?: string } | { ok: false; error: string };

const PATHS = ["/admin/benefits", "/benefits"];

/**
 * Grant ONE active employee ONE guaranteed benefit for the open cycle, at a typed amount
 * (spec 036). Super-User only — this is a governance exception, not day-to-day config.
 * One grant per person per benefit per cycle; salary-driven benefits (Loans) excluded.
 */
export async function addGrant(formData: FormData): Promise<GrantResult> {
  const actor = await requireSuperUser();
  const benefitId = String(formData.get("benefitId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const amount = Math.floor(Number(String(formData.get("amount") ?? "").replace(/[^0-9]/g, "")));

  if (!benefitId || !userId) return { ok: false, error: "Pick an employee and a benefit." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a positive amount (EGP)." };

  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, error: "No open plan year — grants belong to a cycle." };

  const [benefit, user] = await Promise.all([
    prisma.guaranteedBenefit.findUnique({ where: { id: benefitId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { status: true, name: true } }),
  ]);
  if (!benefit) return { ok: false, error: "Benefit not found." };
  if (isSalaryDriven(benefit)) {
    return { ok: false, error: "Salary-driven benefits (Loans) can't be granted — their amount is the person's salary by rule." };
  }
  if (!user || user.status !== "ACTIVE") return { ok: false, error: "Only active employees can be granted a benefit." };

  try {
    await prisma.guaranteedBenefitGrant.create({
      data: { guaranteedBenefitId: benefitId, userId, planYearId: planYear.id, amount, grantedById: actor.id },
    });
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code?: string }).code === "P2002") {
      return { ok: false, error: `${user.name} already has a grant on this benefit for ${planYear.name}.` };
    }
    throw e;
  }

  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, message: `${user.name} granted ${benefit.name} for ${planYear.name}.` };
}

/**
 * Remove an unused grant — the benefit disappears from the person's page again. Refused once
 * a non-rejected claim exists on it (the money story must stay auditable, FR-007).
 */
export async function removeGrant(formData: FormData): Promise<GrantResult> {
  await requireSuperUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing grant." };

  const grant = await prisma.guaranteedBenefitGrant.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!grant) return { ok: false, error: "Grant not found." };

  const [claims, releases] = await Promise.all([
    prisma.benefitClaim.count({
      where: {
        userId: grant.userId,
        guaranteedBenefitId: grant.guaranteedBenefitId,
        planYearId: grant.planYearId,
        status: { not: "REJECTED" },
      },
    }),
    prisma.benefitRelease.count({
      where: {
        userId: grant.userId,
        guaranteedBenefitId: grant.guaranteedBenefitId,
        planYearId: grant.planYearId,
      },
    }),
  ]);
  if (claims > 0) {
    return { ok: false, error: `${grant.user.name} has already requested this benefit — the grant can't be removed. Handle the claim first.` };
  }
  if (releases > 0) {
    return { ok: false, error: `${grant.user.name} was already released this benefit at the granted amount — the grant can't be removed (the money story must stay auditable).` };
  }

  await prisma.guaranteedBenefitGrant.delete({ where: { id } });
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true, message: "Grant removed." };
}
