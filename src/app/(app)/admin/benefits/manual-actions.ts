"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { getActivePlanYear, amountForBand } from "@/lib/benefits/config";
import { flexCap } from "@/lib/benefits/rules";

export type ManualResult = { ok: true } | { ok: false; error: string };

/**
 * Record an already-approved claim/release (spec 016). HR/Super User back-fills a claim that happened
 * outside the app: it is stored as a RELEASED BenefitClaim with the entered approval date and the acting
 * admin, NOT queued for review. Server-authoritative: requires a real allocation target, rejects future
 * dates, and never lets total reimbursement exceed the benefit's allocation (covered terms, spec 012).
 *
 * `benefit` is "<kind>:<id>" where kind is "guaranteed" | "catalog".
 */
export async function recordManualRelease(formData: FormData): Promise<ManualResult> {
  const actor = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const benefitRef = String(formData.get("benefit") ?? "");
  const amount = Math.floor(Number(formData.get("amount")));
  const dateRaw = String(formData.get("approvalDate") ?? "").trim();

  if (!userId || !benefitRef) return { ok: false, error: "Choose an employee and a benefit." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a positive amount." };
  if (!dateRaw) return { ok: false, error: "Enter the approval date." };

  const approvalDate = new Date(dateRaw + "T00:00:00");
  if (Number.isNaN(approvalDate.getTime())) return { ok: false, error: "That approval date isn't valid." };
  // "Already happened" — can't be dated in the future (end-of-today tolerance).
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (approvalDate.getTime() > endOfToday.getTime()) {
    return { ok: false, error: "The approval date can't be in the future." };
  }

  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, error: "No open plan year to record against." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, employmentType: true, tenureBand: true, monthlySalary: true },
  });
  if (!user) return { ok: false, error: "Employee not found." };

  const [kind, id] = benefitRef.split(":");
  let allocation: number | null = null;
  const claimWhere: { guaranteedBenefitId?: string; catalogItemId?: string } = {};

  if (kind === "guaranteed") {
    const gb = await prisma.guaranteedBenefit.findUnique({ where: { id } });
    if (!gb) return { ok: false, error: "Guaranteed benefit not found." };
    if (user.employmentType && gb.employmentType !== user.employmentType) {
      return { ok: false, error: "That guaranteed benefit doesn't apply to this employee's employment type." };
    }
    const salaryDriven =
      gb.band6mo2y == null && gb.band2to4y == null && gb.band4to7y == null && gb.band7to10y == null;
    if (salaryDriven) {
      // Loans etc. — the allocation is the employee's monthly salary (confidential). Only a Super
      // User may record against it, so an HR Admin never sees the salary via the allocation.
      if (!isSuperUser(actor.role)) {
        return { ok: false, error: "Only a Super User can record a salary-based benefit (e.g. Loans)." };
      }
      if (!user.monthlySalary || user.monthlySalary <= 0) {
        return { ok: false, error: "This benefit is salary-driven but the employee has no monthly salary set." };
      }
      allocation = user.monthlySalary;
    } else {
      if (!user.tenureBand) return { ok: false, error: "The employee has no tenure band set." };
      allocation = amountForBand(user.tenureBand, gb);
    }
    claimWhere.guaranteedBenefitId = id;
  } else if (kind === "catalog") {
    // Flexible benefits (spec 018): no basket. The per-benefit allocation is 50% of the pool ceiling.
    const item = await prisma.benefitCatalogItem.findUnique({ where: { id }, select: { isMedical: true } });
    if (!item) return { ok: false, error: "Catalog benefit not found." };
    if (item.isMedical) return { ok: false, error: "Medical is automatic cover — it isn't claimed." };
    if (!user.employmentType || !user.tenureBand) {
      return { ok: false, error: "The employee has no employment type / tenure band set." };
    }
    const ceilingRow = await prisma.poolCeiling.findUnique({
      where: {
        employmentType_tenureBand: {
          employmentType: user.employmentType,
          tenureBand: user.tenureBand,
        },
      },
    });
    if (!ceilingRow) return { ok: false, error: "No pool ceiling configured for that employee." };
    allocation = flexCap(ceilingRow.amount);
    claimWhere.catalogItemId = id;
  } else {
    return { ok: false, error: "Unknown benefit type." };
  }

  if (allocation == null || allocation <= 0) {
    return { ok: false, error: "No allocation exists for that benefit — nothing to release against." };
  }

  // Cap: every non-rejected claim counts against the allocation.
  const existing = await prisma.benefitClaim.findMany({
    where: {
      userId: user.id,
      planYearId: planYear.id,
      status: { not: "REJECTED" },
      ...claimWhere,
    },
    select: { amount: true },
  });
  const claimed = existing.reduce((s, c) => s + c.amount, 0);
  const remaining = allocation - claimed;
  if (amount > remaining) {
    return {
      ok: false,
      error: `That exceeds what's left to claim (${remaining.toLocaleString()} of ${allocation.toLocaleString()}).`,
    };
  }

  await prisma.benefitClaim.create({
    data: {
      userId: user.id,
      planYearId: planYear.id,
      ...claimWhere,
      amount,
      // Back-filled = a payment that already happened → straight to Reimbursed, no emails.
      status: "REIMBURSED",
      decidedAt: approvalDate,
      reviewedById: actor.id,
      note: "Recorded by HR (back-filled)",
    },
  });

  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
  return { ok: true };
}
