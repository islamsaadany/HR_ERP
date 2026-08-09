"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getActivePlanYear, amountForBand, getMedicalCommitment } from "@/lib/benefits/config";
import { tracker } from "@/lib/benefits/claims";
import { evaluateClaim, type AllowanceContext } from "@/lib/benefits/rules";

function fail(msg: string): never {
  redirect("/benefits?claimError=" + encodeURIComponent(msg));
}

/**
 * File a reimbursement claim (spec 018). Flexible (catalog) benefits are claimed directly — no
 * submitted basket — and the employee enters the FULL price paid (matching their proof); the server
 * computes the covered share and enforces the 50%-per-benefit cap (FT + PT) and the pool ceiling.
 * Guaranteed benefits are unchanged (partial PROOF up to allocation; NOTE takes the remainder).
 */
export async function createClaim(formData: FormData): Promise<void> {
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
    select: { employmentType: true, tenureBand: true, monthlySalary: true },
  });
  if (!user?.employmentType || !user?.tenureBand) fail("Your profile isn't set — contact HR.");

  let claimType: "NONE" | "NOTE" | "PROOF";
  let claimAmount: number; // the COVERED amount stored on the claim
  const link: { guaranteedBenefitId?: string; catalogItemId?: string } = {};

  if (kind === "guaranteed") {
    const gb = await prisma.guaranteedBenefit.findUnique({ where: { id: benefitId } });
    if (!gb || gb.employmentType !== user.employmentType) fail("That benefit isn't available to you.");
    claimType = gb.claimType;
    if (claimType === "NONE") fail("That benefit is paid automatically — no claim needed.");
    const allocated = amountForBand(user.tenureBand, gb) ?? user.monthlySalary ?? null;
    const existing = await prisma.benefitClaim.findMany({
      where: {
        userId: me.id,
        planYearId: planYear.id,
        guaranteedBenefitId: gb.id,
        status: { in: ["PENDING", "RELEASED"] },
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
        fail(`That exceeds the amount left to claim (EGP ${t.remaining.toLocaleString()}).`);
      }
      claimAmount = amount;
    }
    link.guaranteedBenefitId = gb.id;
  } else if (kind === "catalog") {
    const item = await prisma.benefitCatalogItem.findUnique({ where: { id: benefitId } });
    if (!item || !item.active) fail("That benefit isn't available.");
    if (item.isMedical) fail("Medical cover doesn't need a claim.");
    claimType = item.claimType;
    if (claimType === "NONE") fail("That benefit is paid automatically — no claim needed.");

    const ceilingRow = await prisma.poolCeiling.findUnique({
      where: {
        employmentType_tenureBand: {
          employmentType: user.employmentType,
          tenureBand: user.tenureBand,
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
          status: { in: ["PENDING", "RELEASED"] },
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
      ceiling: ceilingRow.amount,
      medicalPremium: commitment?.premium ?? 0,
      claimedByBenefit,
      employmentType: user.employmentType,
    };

    // The employee enters the FULL price they paid (matches proof); the server computes covered.
    if (!Number.isFinite(amount) || amount <= 0) fail("Enter the full price you paid.");
    const result = evaluateClaim(ctx, {
      key: item.key,
      name: item.name,
      fullCost: amount,
      coverageRate: item.coverageRate,
    });
    if (result.errors.length > 0) fail(result.errors[0]);
    claimAmount = result.covered;
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
      const blob = await put(`claims/${me.id}/${safeName}`, file, { access: "public", addRandomSuffix: true });
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
      note,
      proofUrl,
      proofName,
      status: "PENDING",
    },
  });

  revalidatePath("/benefits");
  revalidatePath("/admin/benefits");
  redirect("/benefits?claimOk=1");
}
