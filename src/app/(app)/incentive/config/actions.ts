"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { CFG_KEYS, toStored } from "@/lib/incentive/config-fields";

/**
 * Save the editable incentive rule constants (singleton). Super-User only — the
 * money knobs. The form edits percentages/units; `toStored` converts each field
 * back to the stored fraction. Writing the row makes the engine use these
 * instead of the built-in defaults.
 */
export async function saveIncentiveConfig(formData: FormData): Promise<void> {
  const actor = await requireSuperUser();

  // Read + convert every field via the shared metadata (pct ÷100, months/× raw).
  const stored: Record<string, number> = {};
  for (const k of CFG_KEYS) {
    const raw = Number(String(formData.get(k) ?? "").trim());
    if (!Number.isFinite(raw)) redirect(`/incentive/config?error=${encodeURIComponent(`"${k}" must be a number`)}`);
    stored[k] = toStored(k, raw);
  }
  if (stored.cycleMonths <= 0) redirect("/incentive/config?error=Cycle+months+must+be+greater+than+0");

  const data = {
    envelopeRate: stored.envelopeRate,
    marginGate: stored.marginGate,
    tier1Min: stored.tier1Min,
    tier1Deduction: stored.tier1Deduction,
    tier2Min: stored.tier2Min,
    tier2Deduction: stored.tier2Deduction,
    tier3Min: stored.tier3Min,
    tier3Deduction: stored.tier3Deduction,
    maxTotalDeduction: stored.maxTotalDeduction,
    contributorCapMonths: stored.contributorCapMonths,
    contributorFloorMonths: stored.contributorFloorMonths,
    commissionReferred: stored.commissionReferred,
    commissionSelfGenerated: stored.commissionSelfGenerated,
    retainerCommissionMonths: stored.retainerCommissionMonths,
    cycleMonths: stored.cycleMonths,
    vendorMarkupMin: stored.vendorMarkupMin,
    profitTargetMargin: stored.profitTargetMargin,
    profitFloorMargin: stored.profitFloorMargin,
    profitCeilingMonths: stored.profitCeilingMonths,
    profitLeadFeeOffsetShare: stored.profitLeadFeeOffsetShare,
    pricingFloorMultiple: stored.pricingFloorMultiple,
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
