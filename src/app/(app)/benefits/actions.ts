"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getActivePlanYear, getMedicalRate } from "@/lib/benefits/config";
import { computeMedicalPremium, type MedicalConfig } from "@/lib/benefits/rules";

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
    select: { employmentType: true, tenureBand: true },
  });
  if (!user?.employmentType || !user?.tenureBand) {
    return { ok: false, errors: ["Your employment type or tenure isn't set — contact HR."], warnings: [] };
  }

  const [ceilingRow, medicalRate, existing] = await Promise.all([
    prisma.poolCeiling.findUnique({
      where: {
        employmentType_tenureBand: {
          employmentType: user.employmentType,
          tenureBand: user.tenureBand,
        },
      },
    }),
    getMedicalRate(),
    prisma.medicalCommitment.findUnique({
      where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
    }),
  ]);
  if (!ceilingRow || !medicalRate) {
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
  const premium = Math.min(rawPremium, ceilingRow.amount);

  const warnings: string[] = [];
  if (rawPremium > ceilingRow.amount) {
    warnings.push(
      `Your medical premium of EGP ${rawPremium.toLocaleString()} exceeds your pool — capped at EGP ${ceilingRow.amount.toLocaleString()}. Contact HR.`
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
