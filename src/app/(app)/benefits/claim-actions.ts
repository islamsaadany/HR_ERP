"use server";

import { revalidatePath } from "next/cache";
import { formatEGP } from "@/lib/labels";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import {
  getActivePlanYear,
  amountForBand,
  getMedicalCommitment,
  planYearWindow,
  isSalaryDriven,
  fixedAllowanceFor,
  isFixedAllowance,
  medicalCycleCharge,
} from "@/lib/benefits/config";
import { tracker } from "@/lib/benefits/claims";
import { evaluateClaim, type AllowanceContext } from "@/lib/benefits/rules";
import { classifyEligibility, prorate, poolCycleFraction } from "@/lib/benefits/proration";
import { deriveTenureBand } from "@/lib/tenure";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { claimSubmittedToHR } from "@/lib/email/templates";

/** Pool / Professional-development eligibility unlocks at 6 months of service. */
const POOL_THRESHOLD_MONTHS = 6;

/** A user-facing validation failure — carries a message back to the client inline. */
class ClaimError extends Error {}
function fail(msg: string): never {
  throw new ClaimError(msg);
}

export type ClaimResult = { ok: true } | { ok: false; error: string };

/**
 * File a reimbursement claim (spec 018). Returns a result (no redirect) so the client can show an
 * inline message and soft-refresh — the card the employee claimed updates in place, no full reload.
 */
export async function createClaim(formData: FormData): Promise<ClaimResult> {
  try {
    await createClaimImpl(formData);
    return { ok: true };
  } catch (e) {
    if (e instanceof ClaimError) return { ok: false, error: e.message };
    throw e; // real errors (incl. auth redirects) propagate as before
  }
}

/**
 * The claim logic. Flexible (catalog) benefits are claimed directly — the employee enters the FULL
 * price paid (matching their proof); the server computes the covered share and enforces the
 * 50%-per-benefit cap (FT + PT) and the pool ceiling. Guaranteed benefits are unchanged (partial
 * PROOF up to allocation; NOTE takes the remainder). Throws ClaimError on any validation failure.
 */
async function createClaimImpl(formData: FormData): Promise<void> {
  const me = await requireUser();
  const planYear = await getActivePlanYear();
  if (!planYear) fail("Benefits aren't open right now.");

  const kind = formData.get("kind"); // "guaranteed" | "catalog"
  const benefitId = (formData.get("benefitId") as string | null) ?? "";
  const amount = parseInt(((formData.get("amount") as string | null) ?? "").replace(/[^0-9]/g, ""), 10);
  const note = (formData.get("note") as string | null)?.trim() || null;
  const file = formData.get("proof");
  if (!benefitId) fail("Missing benefit.");

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { employmentType: true, tenureBand: true, monthlySalary: true, startDate: true },
  });
  if (!user?.employmentType) fail("Your profile isn't set — contact HR.");
  // Tenure band is derived from the hire date so claim-time enforcement always
  // uses the current band (never a stale stored value).
  const tenureBand = deriveTenureBand(user.startDate).band;
  if (!tenureBand) fail("Your profile isn't set — contact HR.");

  // Cycle-length proration (spec 019, revised): scale the pool ceiling / Professional-development
  // allocation by the LENGTH of the plan-year cycle, for every eligible employee (0 if not yet
  // 6-month-eligible). Medical is unaffected and keeps its own mid-joiner fraction.
  const poolWindow = planYearWindow(planYear);
  const poolEligibility = classifyEligibility(user.startDate, POOL_THRESHOLD_MONTHS, poolWindow);
  const poolFraction = poolCycleFraction(poolEligibility, poolWindow);

  let claimType: "NONE" | "NOTE" | "PROOF";
  let claimAmount: number; // the COVERED amount stored on the claim
  // The receipt value as entered, stored alongside the covered amount so HR can reconcile a
  // clamped claim against its proof. Null for guaranteed benefits (no coverage rate).
  let receiptCost: number | null = null;
  let benefitName = ""; // for the HR notification email
  const link: { guaranteedBenefitId?: string; catalogItemId?: string } = {};

  if (kind === "guaranteed") {
    const gb = await prisma.guaranteedBenefit.findUnique({ where: { id: benefitId } });
    const gbEligible = gb && (user.employmentType === "FULL_TIME" ? gb.eligibleFullTime : gb.eligiblePartTime);
    if (!gb || !gbEligible) fail("That benefit isn't available to you.");
    benefitName = gb.name;
    claimType = gb.claimType;
    if (claimType === "NONE") fail("That benefit is paid automatically — no claim needed.");
    // The monthly-salary fallback is ONLY valid for genuinely salary-driven benefits
    // (Loans — every band intentionally blank). For a band-based benefit that simply has
    // no amount set for this employee's type/tenure (e.g. an unset part-time figure), a
    // null band amount means "not available" — never authorize a claim off the salary.
    const bandAmount =
      amountForBand(user.employmentType, tenureBand, gb) ??
      (isSalaryDriven(gb) ? user.monthlySalary : null);
    if (bandAmount == null) fail("That benefit has no amount set for you yet — contact HR.");
    // Only benefits flagged `prorated` (Professional development) shrink to the cycle
    // length; event/season gifts (marriage, summer, special events, loans) stay full.
    const allocated = gb.prorated ? prorate(bandAmount, poolFraction) : bandAmount;
    const existing = await prisma.benefitClaim.findMany({
      where: {
        userId: me.id,
        planYearId: planYear.id,
        guaranteedBenefitId: gb.id,
        status: { not: "REJECTED" }, // every non-rejected claim consumes allowance
      },
      select: { amount: true, status: true },
    });
    const t = tracker(allocated, existing);
    if (claimType === "NOTE") {
      if (t.remaining != null && t.remaining <= 0) fail("You've already requested this benefit.");
      claimAmount = t.remaining ?? allocated ?? 0;
    } else {
      if (!Number.isFinite(amount) || amount <= 0) fail("Enter a valid amount.");
      if (t.remaining != null && amount > t.remaining) {
        fail(`That exceeds the amount left to claim (${formatEGP(t.remaining)}).`);
      }
      claimAmount = amount;
    }
    link.guaranteedBenefitId = gb.id;
  } else if (kind === "catalog") {
    const item = await prisma.benefitCatalogItem.findUnique({ where: { id: benefitId } });
    if (!item || !item.active) fail("That benefit isn't available.");
    const itemEligible = user.employmentType === "FULL_TIME" ? item.eligibleFullTime : item.eligiblePartTime;
    if (!itemEligible) fail("That benefit isn't available to you.");
    if (item.isMedical) fail("Medical cover doesn't need a claim.");
    benefitName = item.name;
    claimType = item.claimType;
    if (claimType === "NONE") fail("That benefit is paid automatically — no claim needed.");

    const ceilingRow = await prisma.poolCeiling.findUnique({
      where: {
        employmentType_tenureBand: {
          employmentType: user.employmentType,
          tenureBand,
        },
      },
    });
    if (!ceilingRow) fail("Benefits aren't fully configured yet.");

    // Build the allowance context: pool ceiling, committed medical premium, and covered totals
    // (pending + released) per catalog item — used by evaluateClaim for the 50% + ceiling rules.
    const [commitment, activeClaims, catalogItems] = await Promise.all([
      getMedicalCommitment(me.id, planYear.id),
      prisma.benefitClaim.findMany({
        where: {
          userId: me.id,
          planYearId: planYear.id,
          catalogItemId: { not: null },
          status: { not: "REJECTED" }, // every non-rejected claim consumes allowance
        },
        select: { catalogItemId: true, amount: true },
      }),
      prisma.benefitCatalogItem.findMany({ select: { id: true, key: true } }),
    ]);
    const idToKey = new Map(catalogItems.map((c) => [c.id, c.key]));
    const claimedByBenefit: Record<string, number> = {};
    for (const c of activeClaims) {
      const k = c.catalogItemId ? idToKey.get(c.catalogItemId) : undefined;
      if (k) claimedByBenefit[k] = (claimedByBenefit[k] ?? 0) + c.amount;
    }
    const ctx: AllowanceContext = {
      // Prorated to the plan-year cycle length (spec 019); full ceiling for a full-year cycle.
      ceiling: prorate(ceilingRow.amount, poolFraction),
      // This cycle's medical charge, matching what the pool card shows (spec 027).
      medicalPremium: medicalCycleCharge(commitment, planYear.id),
      claimedByBenefit,
      employmentType: user.employmentType,
      // Spec 031: the 50% cap belongs to the CYCLE. Read from this claim's own plan year, never
      // from the client and never from a global setting — a closed cycle keeps the rule it was
      // judged under.
      flexCapEnabled: planYear.flexCapEnabled,
    };

    // A fixed allowance (travel) is an entitlement, not a receipt: the employee requests it and
    // is paid the band amount for their tenure, prorated to the cycle like the pool itself.
    // Nothing is entered and nothing is proven, so the amount field is ignored entirely.
    const allowance = isFixedAllowance(item) ? fixedAllowanceFor(tenureBand, item) : null;
    if (allowance == null) {
      // The employee enters the FULL price they paid (matches proof); the server computes covered.
      if (!Number.isFinite(amount) || amount <= 0) fail("Enter the full price you paid.");
    }
    const result = evaluateClaim(ctx, {
      key: item.key,
      name: item.name,
      fullCost: amount,
      coverageRate: item.coverageRate,
      allocation: allowance == null ? null : prorate(allowance, poolFraction),
    });
    if (result.errors.length > 0) fail(result.errors[0]);
    // `covered` is already clamped to what's left on the benefit / in the pool, so a receipt
    // whose coverage share overshoots is paid down rather than refused (the 50% cap overrides
    // the coverage rate). Guard against a zero payout — nothing to reimburse is not a claim.
    if (result.covered <= 0) fail("There's nothing left to claim on this benefit.");
    claimAmount = result.covered;
    // No receipt exists for an allowance, so there is no receipt value to record.
    receiptCost = allowance == null ? amount : null;
    link.catalogItemId = item.id;
  } else {
    fail("Unknown benefit type.");
  }

  // Proof upload (mandatory for PROOF benefits).
  let proofUrl: string | null = null;
  let proofName: string | null = null;
  if (claimType === "PROOF") {
    if (!(file instanceof File) || file.size === 0) fail("A proof-of-payment file is required.");
    if (file.size > 10 * 1024 * 1024) fail("Proof file too large (max 10MB).");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    try {
      const blob = await put(`claims/${me.id}/${safeName}`, file, { access: "private", addRandomSuffix: true });
      proofUrl = blob.url;
      proofName = file.name;
    } catch (err) {
      // Surface the real cause in the server logs so we can tell a missing/invalid
      // BLOB_READ_WRITE_TOKEN apart from a transient upload failure.
      console.error("[benefits] proof upload to Vercel Blob failed:", err);
      const hint = !process.env.BLOB_READ_WRITE_TOKEN
        ? "Proof upload failed — file storage isn't configured yet (BLOB_READ_WRITE_TOKEN is missing). Contact HR/IT."
        : "Proof upload failed — please try again, and contact HR/IT if it keeps happening.";
      fail(hint);
    }
  }

  await prisma.benefitClaim.create({
    data: {
      userId: me.id,
      planYearId: planYear.id,
      guaranteedBenefitId: link.guaranteedBenefitId ?? null,
      catalogItemId: link.catalogItemId ?? null,
      amount: claimAmount,
      fullCost: receiptCost,
      note,
      proofUrl,
      proofName,
      status: "SUBMITTED",
    },
  });

  // Notify the HR inbox that a new claim awaits review (fire-and-forget; inert if
  // email is off/unconfigured, and never blocks the claim that was just saved).
  const settings = await getNotificationSettings();
  const amountClaimed = Number.isFinite(amount) && amount > 0 ? amount : claimAmount;
  await sendEmail({
    to: settings.hrInbox,
    ...claimSubmittedToHR({
      employeeName: me.name ?? me.email ?? "An employee",
      benefitName,
      amountClaimed,
      coveredAmount: claimAmount,
    }),
  });

  revalidatePath("/benefits");
  revalidatePath("/admin/benefits");
}
