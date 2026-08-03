"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getActivePlanYear, amountForBand } from "@/lib/benefits/config";
import { tracker } from "@/lib/benefits/claims";

function fail(msg: string): never {
  redirect("/benefits?claimError=" + encodeURIComponent(msg));
}

/**
 * File a reimbursement claim against a benefit the employee is entitled to.
 * Partial claims are allowed up to the benefit's allocation. PROOF benefits require
 * a file upload; NOTE benefits take an optional note; NONE benefits can't be claimed.
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
    select: { employmentType: true, tenureBand: true },
  });
  if (!user?.employmentType || !user?.tenureBand) fail("Your profile isn't set — contact HR.");

  // Resolve the benefit, its claim policy, and its allocation for this employee.
  let allocated: number | null = null;
  let claimType: "NONE" | "NOTE" | "PROOF";
  const link: { guaranteedBenefitId?: string; catalogItemId?: string } = {};

  if (kind === "guaranteed") {
    const gb = await prisma.guaranteedBenefit.findUnique({ where: { id: benefitId } });
    if (!gb || gb.employmentType !== user.employmentType) fail("That benefit isn't available to you.");
    claimType = gb.claimType;
    allocated = amountForBand(user.tenureBand, gb);
    link.guaranteedBenefitId = gb.id;
  } else if (kind === "catalog") {
    // Must be in the employee's submitted basket for this plan year.
    const selection = await prisma.benefitSelection.findUnique({
      where: { userId_planYearId: { userId: me.id, planYearId: planYear!.id } },
      include: { lines: { where: { catalogItemId: benefitId }, include: { catalogItem: true } } },
    });
    const line = selection?.lines[0];
    if (!selection || selection.status !== "SUBMITTED" || !line) {
      fail("You can only claim benefits in your submitted basket.");
    }
    if (line!.catalogItem.isMedical) fail("Medical cover doesn't need a claim.");
    claimType = line!.catalogItem.claimType;
    allocated = line!.amount;
    link.catalogItemId = benefitId;
  } else {
    fail("Unknown benefit type.");
  }

  if (claimType === "NONE") fail("That benefit is paid automatically — no claim needed.");
  if (!Number.isFinite(amount) || amount <= 0) fail("Enter a valid amount.");

  // Cap at the remaining allocation (pending + released count against it).
  const existing = await prisma.benefitClaim.findMany({
    where: {
      userId: me.id,
      planYearId: planYear!.id,
      ...(link.guaranteedBenefitId ? { guaranteedBenefitId: link.guaranteedBenefitId } : {}),
      ...(link.catalogItemId ? { catalogItemId: link.catalogItemId } : {}),
      status: { in: ["PENDING", "RELEASED"] },
    },
    select: { amount: true, status: true },
  });
  const t = tracker(allocated, existing);
  if (t.remaining != null && amount > t.remaining) {
    fail(`That exceeds the amount left to claim (EGP ${t.remaining.toLocaleString()}).`);
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
    } catch {
      fail("Proof upload failed — is Blob storage configured?");
    }
  }

  await prisma.benefitClaim.create({
    data: {
      userId: me.id,
      planYearId: planYear!.id,
      guaranteedBenefitId: link.guaranteedBenefitId ?? null,
      catalogItemId: link.catalogItemId ?? null,
      amount,
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
