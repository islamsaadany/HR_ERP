"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";

/**
 * Save the editable incentive rule constants (singleton). Super-User only — the
 * money knobs. Values are validated as finite numbers; months are whole numbers.
 * Writing the row makes the engine use these instead of the built-in defaults.
 */
export async function saveIncentiveConfig(formData: FormData): Promise<void> {
  const actor = await requireSuperUser();

  const num = (k: string) => Number(String(formData.get(k) ?? "").trim());
  const keys = [
    "envelopeRate", "marginGate",
    "tier1Min", "tier1Deduction", "tier2Min", "tier2Deduction", "tier3Min", "tier3Deduction",
    "maxTotalDeduction", "contributorCapMonths", "contributorFloorMonths",
    "commissionReferred", "commissionSelfGenerated",
    "retainerCommissionMonths", "cycleMonths",
    "vendorMarkupMin",
    "profitTargetMargin", "profitFloorMargin", "profitCeilingMonths", "profitLeadFeeOffsetShare",
    "pricingFloorMultiple",
  ] as const;

  const vals = {} as Record<(typeof keys)[number], number>;
  for (const k of keys) {
    const v = num(k);
    if (!Number.isFinite(v)) redirect(`/incentive/config?error=${encodeURIComponent(`"${k}" must be a number`)}`);
    vals[k] = v;
  }
  if (vals.cycleMonths <= 0) redirect("/incentive/config?error=Cycle+months+must+be+greater+than+0");

  const data = {
    envelopeRate: vals.envelopeRate,
    marginGate: vals.marginGate,
    tier1Min: vals.tier1Min,
    tier1Deduction: vals.tier1Deduction,
    tier2Min: vals.tier2Min,
    tier2Deduction: vals.tier2Deduction,
    tier3Min: vals.tier3Min,
    tier3Deduction: vals.tier3Deduction,
    maxTotalDeduction: vals.maxTotalDeduction,
    contributorCapMonths: vals.contributorCapMonths,
    contributorFloorMonths: vals.contributorFloorMonths,
    commissionReferred: vals.commissionReferred,
    commissionSelfGenerated: vals.commissionSelfGenerated,
    retainerCommissionMonths: Math.round(vals.retainerCommissionMonths),
    cycleMonths: Math.round(vals.cycleMonths),
    vendorMarkupMin: vals.vendorMarkupMin,
    profitTargetMargin: vals.profitTargetMargin,
    profitFloorMargin: vals.profitFloorMargin,
    profitCeilingMonths: vals.profitCeilingMonths,
    profitLeadFeeOffsetShare: vals.profitLeadFeeOffsetShare,
    pricingFloorMultiple: vals.pricingFloorMultiple,
    updatedById: actor.id,
  };

  await prisma.incentiveConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  revalidatePath("/incentive/config");
  redirect("/incentive/config?saved=1");
}

/** Restore the built-in defaults by removing the saved row. */
export async function resetIncentiveConfig(): Promise<void> {
  await requireSuperUser();
  await prisma.incentiveConfig.deleteMany({ where: { id: "singleton" } });
  revalidatePath("/incentive/config");
  redirect("/incentive/config?reset=1");
}
