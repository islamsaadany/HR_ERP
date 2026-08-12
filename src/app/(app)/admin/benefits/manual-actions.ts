"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import {
  getActivePlanYear,
  amountForBand,
  isEligibleFor,
  isSalaryDriven,
  getMedicalRateBands,
  poolCeilingFor,
  medicalScopeFor,
  planYearWindow,
} from "@/lib/benefits/config";
import { flexCap } from "@/lib/benefits/rules";
import { classifyEligibility, prorate } from "@/lib/benefits/proration";
import { sumMedicalPremium, proratedPremiumEGP, type PricedPerson } from "@/lib/benefits/rates";
import { deriveTenureBand } from "@/lib/tenure";

// Mirrors MEDICAL_THRESHOLD_MONTHS in benefits/actions.ts — medical unlocks at 3 months (spec 019).
const MEDICAL_THRESHOLD_MONTHS = 3;

export type ManualResult = { ok: true; message?: string } | { ok: false; error: string };

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
  const dateRaw = String(formData.get("approvalDate") ?? "").trim();

  if (!userId || !benefitRef) return { ok: false, error: "Choose an employee and a benefit." };
  if (!dateRaw) return { ok: false, error: "Enter the approval date." };

  const approvalDate = new Date(dateRaw + "T00:00:00");
  if (Number.isNaN(approvalDate.getTime())) return { ok: false, error: "That approval date isn't valid." };
  // "Already happened" — can't be dated in the future (end-of-today tolerance).
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (approvalDate.getTime() > endOfToday.getTime()) {
    return { ok: false, error: "The approval date can't be in the future." };
  }

  // Medical is auto-priced (no amount entered) — record a back-dated commitment.
  if (benefitRef === "medical") {
    return recordMedicalBackfill(actor.id, userId, approvalDate, dateRaw);
  }

  // Non-medical claims: HR enters the covered amount.
  const amount = Math.floor(Number(formData.get("amount")));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a positive amount." };

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
    if (!user.employmentType) {
      return { ok: false, error: "The employee has no employment type set." };
    }
    if (!isEligibleFor(user.employmentType, gb)) {
      return { ok: false, error: "That guaranteed benefit doesn't apply to this employee's employment type." };
    }
    if (isSalaryDriven(gb)) {
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
      allocation = amountForBand(user.employmentType, user.tenureBand, gb);
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

/**
 * Back-fill a medical commitment that already happened (spec 023 + 019). HR sets only the approval
 * date; the premium is priced automatically from each covered person's age at that date (age-banded
 * rate card) and prorated the same way a live commit is, capped at the pool ceiling. Covered set =
 * the employee + every dependant with a DOB on file (Family-eligible only; Personal-only → self).
 * Saved as a locked MedicalCommitment back-dated to the approval date, with a covered-person snapshot.
 */
async function recordMedicalBackfill(
  actorId: string,
  userId: string,
  approvalDate: Date,
  dateRaw: string
): Promise<ManualResult> {
  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, error: "No open plan year to record against." };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      employmentType: true,
      startDate: true,
      dateOfBirth: true,
      dependants: { select: { id: true, name: true, dateOfBirth: true, kind: true } },
    },
  });
  if (!user) return { ok: false, error: "Employee not found." };
  if (!user.employmentType) return { ok: false, error: "The employee has no employment type set." };
  if (!user.dateOfBirth) {
    return { ok: false, error: "The employee has no date of birth — medical can't be priced. Add a DOB first." };
  }

  const scope = await medicalScopeFor(user.employmentType);
  if (!scope.offered) {
    return { ok: false, error: "Medical isn't available to this employee's employment type." };
  }

  const existing = await prisma.medicalCommitment.findUnique({
    where: { userId_planYearId: { userId, planYearId: planYear.id } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "This employee already has a medical commitment for the open plan year — edit it from the submissions list instead." };
  }

  // Covered set: employee + all dependants with a DOB (Family-eligible only). Missing-DOB dependants
  // can't be priced, so they're skipped and reported.
  const withDob = user.dependants.filter((d) => d.dateOfBirth != null);
  const dependants = scope.family ? withDob : [];
  const skippedNoDob = scope.family ? user.dependants.length - withDob.length : 0;

  const eligibility = classifyEligibility(user.startDate, MEDICAL_THRESHOLD_MONTHS, planYearWindow(planYear));
  if (eligibility.status === "NOT_YET") {
    return { ok: false, error: "The employee isn't medical-eligible within this plan year (needs 3 months of service)." };
  }

  const [ceilingAmount, bands] = await Promise.all([
    poolCeilingFor(user.employmentType, deriveTenureBand(user.startDate).band),
    getMedicalRateBands(),
  ]);
  if (ceilingAmount == null || bands.length === 0) {
    return { ok: false, error: "Benefits aren't fully configured (pool ceiling / rate card)." };
  }

  // Age is measured at the approval (commit) date.
  const people: PricedPerson[] = [
    { dob: user.dateOfBirth },
    ...dependants.map((d) => ({ dob: d.dateOfBirth as Date })),
  ];
  const { annualEGP, lines, anyOverTop } = sumMedicalPremium(people, bands, approvalDate);

  const proratedCeiling = prorate(ceilingAmount, eligibility.fraction);
  const proratedPremium = proratedPremiumEGP(annualEGP, eligibility.fraction);
  const premium = Math.min(proratedPremium, proratedCeiling);

  const coveredPeople = [
    { dependantId: null as string | null, label: user.name ?? "Employee", ageAtCommit: lines[0].ageAtCommit, premiumEGP: lines[0].premiumEGP },
    ...dependants.map((d, i) => ({
      dependantId: d.id,
      label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}${lines[i + 1].overTop ? " (over 75 — top band)" : ""}`,
      ageAtCommit: lines[i + 1].ageAtCommit,
      premiumEGP: lines[i + 1].premiumEGP,
    })),
  ];

  await prisma.medicalCommitment.create({
    data: {
      userId,
      planYearId: planYear.id,
      premium,
      committedById: actorId,
      committedAt: approvalDate,
      coveredPeople: { create: coveredPeople },
    },
  });

  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");

  const parts = [
    `Committed EGP ${premium.toLocaleString()} for ${people.length} covered ${people.length === 1 ? "person" : "people"}, dated ${dateRaw}.`,
  ];
  if (eligibility.status === "PRORATED") parts.push(`Prorated ${eligibility.remainingWholeMonths}/12.`);
  if (premium < proratedPremium) parts.push("Capped at the pool ceiling.");
  if (anyOverTop) parts.push("A covered person is over 75 (top band) — review.");
  if (skippedNoDob > 0) parts.push(`${skippedNoDob} dependant(s) without a DOB were skipped.`);
  return { ok: true, message: parts.join(" ") };
}
