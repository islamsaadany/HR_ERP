"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClaimType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { getMedicalRate } from "@/lib/benefits/config";
import { computeMedicalPremium } from "@/lib/benefits/rules";

export async function createPlanYear(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return;
  // Close any currently open years, then open the new one.
  await prisma.planYear.updateMany({
    where: { status: "OPEN" },
    data: { status: "CLOSED" },
  });
  await prisma.planYear.create({ data: { name, status: "OPEN" } });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

export async function setPlanYearStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  const status = formData.get("status") as "OPEN" | "CLOSED";
  if (!id || (status !== "OPEN" && status !== "CLOSED")) return;
  if (status === "OPEN") {
    await prisma.planYear.updateMany({
      where: { status: "OPEN", NOT: { id } },
      data: { status: "CLOSED" },
    });
  }
  await prisma.planYear.update({ where: { id }, data: { status } });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/**
 * HR override (spec 018): edit an employee's committed medical election. Medical is locked to the
 * employee after commit; only HR may change dependants (which recomputes the premium, capped at the
 * employee's pool ceiling). `id` is the MedicalCommitment id.
 */
export async function editMedicalCommitment(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const commitment = await prisma.medicalCommitment.findUnique({
    where: { id },
    include: { user: { select: { employmentType: true, tenureBand: true } } },
  });
  if (!commitment) redirect("/admin/benefits?error=" + encodeURIComponent("That medical commitment no longer exists."));

  const spouse = formData.get("spouse") === "on" || formData.get("spouse") === "true";
  const childrenUnder18 = Math.max(0, Math.floor(Number(formData.get("childrenUnder18") ?? 0)));
  const children18Plus = Math.max(0, Math.floor(Number(formData.get("children18Plus") ?? 0)));

  const [rate, ceilingRow] = await Promise.all([
    getMedicalRate(),
    commitment.user.employmentType && commitment.user.tenureBand
      ? prisma.poolCeiling.findUnique({
          where: {
            employmentType_tenureBand: {
              employmentType: commitment.user.employmentType,
              tenureBand: commitment.user.tenureBand,
            },
          },
        })
      : Promise.resolve(null),
  ]);
  if (!rate || !ceilingRow) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Benefits aren't fully configured for that employee."));
  }
  const rawPremium = computeMedicalPremium(rate, { spouse, childrenUnder18, children18Plus });
  const premium = Math.min(rawPremium, ceilingRow.amount);

  await prisma.medicalCommitment.update({
    where: { id },
    data: { spouse, childrenUnder18, children18Plus, premium, committedById: admin.id },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/** HR override (spec 018): remove an employee's committed medical so they can re-commit. */
export async function removeMedicalCommitment(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.medicalCommitment.delete({ where: { id } });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

// ── Claim requirements (per-benefit policy) ──
export async function setClaimType(formData: FormData): Promise<void> {
  await requireAdmin();
  const kind = formData.get("kind");
  const id = formData.get("id") as string;
  const claimType = formData.get("claimType") as ClaimType;
  if (!id || !["NONE", "NOTE", "PROOF"].includes(claimType)) return;
  if (kind === "guaranteed") {
    await prisma.guaranteedBenefit.update({ where: { id }, data: { claimType } });
  } else if (kind === "catalog") {
    await prisma.benefitCatalogItem.update({ where: { id }, data: { claimType } });
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

// ── Claim review (release / reject) ──
export async function releaseClaim(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  const claim = await prisma.benefitClaim.findUnique({ where: { id } });
  if (!claim || claim.status !== "PENDING") return;
  await prisma.benefitClaim.update({
    where: { id },
    data: { status: "RELEASED", reviewedById: admin.id, decidedAt: new Date() },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

export async function rejectClaim(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id") as string;
  const reason = (formData.get("reason") as string | null)?.trim() || null;
  if (!id) return;
  const claim = await prisma.benefitClaim.findUnique({ where: { id } });
  if (!claim || claim.status !== "PENDING") return;
  await prisma.benefitClaim.update({
    where: { id },
    data: { status: "REJECTED", decisionNote: reason, reviewedById: admin.id, decidedAt: new Date() },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}
