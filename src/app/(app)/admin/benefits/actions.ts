"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClaimType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

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

/** Reopen a submitted basket so the employee can edit it (while the window is open). */
export async function reopenSelection(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.benefitSelection.update({
    where: { id },
    data: { status: "DRAFT", submittedAt: null },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/** Fully reset a submission — deletes the basket so the employee starts fresh.
 *  Blocked if any claims exist for that employee's plan year (so nothing is lost). */
export async function resetSelection(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  const sel = await prisma.benefitSelection.findUnique({ where: { id } });
  if (!sel) return;
  const claimCount = await prisma.benefitClaim.count({
    where: { userId: sel.userId, planYearId: sel.planYearId },
  });
  if (claimCount > 0) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Can't reset — this employee has claims for the year. Resolve them first."));
  }
  await prisma.benefitSelection.delete({ where: { id } }); // lines cascade
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
