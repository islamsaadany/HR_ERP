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

/** One coverable person for the medical picker (employee + each dependant). */
export type Coverable = { id: string | null; label: string; age: number; premiumEGP: number; hasDob: boolean };

/** What the modal shows before recording — the auto-filled (editable) amount + medical picker data. */
export type SuggestResult =
  | { ok: true; kind: "medical"; coverable: Coverable[]; amount: number; note?: string }
  | { ok: true; kind: "flat"; amount: number; allocation: number; remaining: number }
  | { ok: false; error: string };

// ── Shared helpers ───────────────────────────────────────────────────────

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Parse a yyyy-mm-dd string to a local midnight Date; null if blank/invalid. */
function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

type MedicalCtx = Awaited<ReturnType<typeof loadMedicalContext>>;

/** Load everything needed to price medical for an employee, or an error string. */
async function loadMedicalContext(userId: string) {
  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false as const, error: "No open plan year to record against." };

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
  if (!user) return { ok: false as const, error: "Employee not found." };
  if (!user.employmentType) return { ok: false as const, error: "The employee has no employment type set." };
  if (!user.dateOfBirth) {
    return { ok: false as const, error: "The employee has no date of birth — medical can't be priced. Add a DOB first." };
  }

  const scope = await medicalScopeFor(user.employmentType);
  if (!scope.offered) return { ok: false as const, error: "Medical isn't available to this employee's employment type." };

  const eligibility = classifyEligibility(user.startDate, MEDICAL_THRESHOLD_MONTHS, planYearWindow(planYear));
  if (eligibility.status === "NOT_YET") {
    return { ok: false as const, error: "The employee isn't medical-eligible within this plan year (needs 3 months of service)." };
  }

  const [ceilingAmount, bands] = await Promise.all([
    poolCeilingFor(user.employmentType, deriveTenureBand(user.startDate).band),
    getMedicalRateBands(),
  ]);
  if (ceilingAmount == null || bands.length === 0) {
    return { ok: false as const, error: "Benefits aren't fully configured (pool ceiling / rate card)." };
  }

  return { ok: true as const, planYear, user, scope, eligibility, ceilingAmount, bands };
}

/** Family-eligible dependants that have a DOB (the only ones medical can price). */
function famDepsWithDob(ctx: Extract<MedicalCtx, { ok: true }>) {
  return ctx.scope.family ? ctx.user.dependants.filter((d) => d.dateOfBirth != null) : [];
}

/** The full picker list (employee + every dependant), each priced alone at `atDate`. */
function coverableList(ctx: Extract<MedicalCtx, { ok: true }>, atDate: Date): Coverable[] {
  const self = sumMedicalPremium([{ dob: ctx.user.dateOfBirth as Date }], ctx.bands, atDate).lines[0];
  const list: Coverable[] = [
    { id: null, label: `${ctx.user.name ?? "Employee"} (employee)`, age: self.ageAtCommit, premiumEGP: self.premiumEGP, hasDob: true },
  ];
  if (ctx.scope.family) {
    for (const d of ctx.user.dependants) {
      const has = d.dateOfBirth != null;
      const line = has ? sumMedicalPremium([{ dob: d.dateOfBirth as Date }], ctx.bands, atDate).lines[0] : null;
      list.push({
        id: d.id,
        label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}`,
        age: line?.ageAtCommit ?? 0,
        premiumEGP: line?.premiumEGP ?? 0,
        hasDob: has,
      });
    }
  }
  return list;
}

/**
 * Price medical for a chosen covered set (employee is always covered). `coveredIds` = the
 * dependant ids to cover; null = default (all family dependants with a DOB). Returns the
 * server-authoritative premium (prorated, ceiling-capped) plus the covered-person snapshot.
 */
function priceMedical(ctx: Extract<MedicalCtx, { ok: true }>, atDate: Date, coveredIds: string[] | null) {
  const fam = famDepsWithDob(ctx);
  const covered = coveredIds ? fam.filter((d) => coveredIds.includes(d.id)) : fam;

  const people: PricedPerson[] = [
    { dob: ctx.user.dateOfBirth as Date },
    ...covered.map((d) => ({ dob: d.dateOfBirth as Date })),
  ];
  const { annualEGP, lines, anyOverTop } = sumMedicalPremium(people, ctx.bands, atDate);

  const proratedCeiling = prorate(ctx.ceilingAmount, ctx.eligibility.fraction);
  const proratedPremium = proratedPremiumEGP(annualEGP, ctx.eligibility.fraction);
  const premium = Math.min(proratedPremium, proratedCeiling);

  const coveredPeople = [
    { dependantId: null as string | null, label: ctx.user.name ?? "Employee", ageAtCommit: lines[0].ageAtCommit, premiumEGP: lines[0].premiumEGP },
    ...covered.map((d, i) => ({
      dependantId: d.id,
      label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}${lines[i + 1].overTop ? " (over 75 — top band)" : ""}`,
      ageAtCommit: lines[i + 1].ageAtCommit,
      premiumEGP: lines[i + 1].premiumEGP,
    })),
  ];

  return { premium, proratedPremium, proratedCeiling, coveredPeople, anyOverTop, coveredCount: people.length };
}

/** Compute a non-medical benefit's allocation + how much is left to claim (covered terms). */
async function flatAllocation(
  userId: string,
  benefitRef: string,
  actorRole: Parameters<typeof isSuperUser>[0],
): Promise<{ ok: true; allocation: number; remaining: number; claimWhere: { guaranteedBenefitId?: string; catalogItemId?: string } } | { ok: false; error: string }> {
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
    if (!user.employmentType) return { ok: false, error: "The employee has no employment type set." };
    if (!isEligibleFor(user.employmentType, gb)) {
      return { ok: false, error: "That guaranteed benefit doesn't apply to this employee's employment type." };
    }
    if (isSalaryDriven(gb)) {
      if (!isSuperUser(actorRole)) return { ok: false, error: "Only a Super User can record a salary-based benefit (e.g. Loans)." };
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
    const item = await prisma.benefitCatalogItem.findUnique({ where: { id }, select: { isMedical: true } });
    if (!item) return { ok: false, error: "Catalog benefit not found." };
    if (item.isMedical) return { ok: false, error: "Medical is automatic cover — it isn't claimed." };
    if (!user.employmentType || !user.tenureBand) {
      return { ok: false, error: "The employee has no employment type / tenure band set." };
    }
    const ceilingRow = await prisma.poolCeiling.findUnique({
      where: { employmentType_tenureBand: { employmentType: user.employmentType, tenureBand: user.tenureBand } },
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

  const existing = await prisma.benefitClaim.findMany({
    where: { userId: user.id, planYearId: planYear.id, status: { not: "REJECTED" }, ...claimWhere },
    select: { amount: true },
  });
  const claimed = existing.reduce((s, c) => s + c.amount, 0);
  return { ok: true, allocation, remaining: Math.max(0, allocation - claimed), claimWhere };
}

// ── Suggest (auto-fill) ──────────────────────────────────────────────────

/**
 * Compute the amount to pre-fill in the record modal (the value auto-fills; HR can still adjust it).
 * For medical, also returns the coverable people so the modal can render the dependant picker and
 * re-price as the covered set changes. Read-only — admin-gated.
 */
export async function suggestAmount(args: {
  userId: string;
  benefit: string;
  coveredIds: string[] | null;
  date: string | null;
}): Promise<SuggestResult> {
  const actor = await requireAdmin();
  if (!args.userId || !args.benefit) return { ok: false, error: "Pick an employee and a benefit." };

  const atDate = (args.date && parseDate(args.date)) || new Date();

  if (args.benefit === "medical") {
    const ctx = await loadMedicalContext(args.userId);
    if (!ctx.ok) return { ok: false, error: ctx.error };
    const existing = await prisma.medicalCommitment.findUnique({
      where: { userId_planYearId: { userId: args.userId, planYearId: ctx.planYear.id } },
      select: { id: true },
    });
    if (existing) return { ok: false, error: "This employee already has a medical commitment for the open plan year." };

    const coverable = coverableList(ctx, atDate);
    const priced = priceMedical(ctx, atDate, args.coveredIds);
    const notes: string[] = [];
    if (ctx.eligibility.status === "PRORATED") notes.push(`Prorated ${ctx.eligibility.remainingWholeMonths}/12.`);
    if (priced.premium < priced.proratedPremium) notes.push("Capped at the pool ceiling.");
    if (priced.anyOverTop) notes.push("A covered person is over 75 (top band).");
    return { ok: true, kind: "medical", coverable, amount: priced.premium, note: notes.join(" ") || undefined };
  }

  const alloc = await flatAllocation(args.userId, args.benefit, actor.role);
  if (!alloc.ok) return { ok: false, error: alloc.error };
  return { ok: true, kind: "flat", amount: alloc.remaining, allocation: alloc.allocation, remaining: alloc.remaining };
}

// ── Record ───────────────────────────────────────────────────────────────

/**
 * Record an already-approved claim/release (spec 016). HR/Super User back-fills a claim that happened
 * outside the app: stored as a REIMBURSED BenefitClaim with the entered approval date and the acting
 * admin, NOT queued for review. Server-authoritative: real allocation target, no future dates, never
 * over the allocation. `benefit` is "<kind>:<id>" (guaranteed | catalog), or "medical".
 */
export async function recordManualRelease(formData: FormData): Promise<ManualResult> {
  const actor = await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const benefitRef = String(formData.get("benefit") ?? "");
  const dateRaw = String(formData.get("approvalDate") ?? "").trim();

  if (!userId || !benefitRef) return { ok: false, error: "Choose an employee and a benefit." };
  if (!dateRaw) return { ok: false, error: "Enter the approval date." };

  const approvalDate = parseDate(dateRaw);
  if (!approvalDate) return { ok: false, error: "That approval date isn't valid." };
  if (approvalDate.getTime() > endOfToday().getTime()) {
    return { ok: false, error: "The approval date can't be in the future." };
  }

  // Medical — a back-dated commitment for the chosen covered set (amount auto-priced, HR-adjustable).
  if (benefitRef === "medical") {
    const coveredRaw = String(formData.get("coveredIds") ?? "").trim();
    const coveredIds = coveredRaw ? coveredRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const overrideRaw = formData.get("amount");
    const override = overrideRaw != null && String(overrideRaw).trim() !== "" ? Math.floor(Number(overrideRaw)) : null;
    return recordMedicalBackfill(actor.id, userId, approvalDate, dateRaw, coveredIds, override);
  }

  // Non-medical claims: HR enters the covered amount (pre-filled from the allocation).
  const amount = Math.floor(Number(formData.get("amount")));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a positive amount." };

  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, error: "No open plan year to record against." };

  const alloc = await flatAllocation(userId, benefitRef, actor.role);
  if (!alloc.ok) return { ok: false, error: alloc.error };
  if (amount > alloc.remaining) {
    return {
      ok: false,
      error: `That exceeds what's left to claim (${alloc.remaining.toLocaleString()} of ${alloc.allocation.toLocaleString()}).`,
    };
  }

  await prisma.benefitClaim.create({
    data: {
      userId,
      planYearId: planYear.id,
      ...alloc.claimWhere,
      amount,
      // Recorded as APPROVED so Finance confirms the payment in the Payments queue
      // (they enter the actual transfer date, which may be in the past) → REIMBURSED.
      // Keeps the HR-records / Finance-confirms separation of duties.
      status: "APPROVED",
      decidedAt: approvalDate,
      reviewedById: actor.id,
      note: "Recorded by HR (back-filled) — awaiting Finance payment",
    },
  });

  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
  revalidatePath("/finance");
  return { ok: true };
}

/**
 * Back-fill a medical commitment that already happened (spec 023 + 019). HR picks who's covered
 * (employee always) and the premium is priced from each covered person's age at the approval date
 * (age-banded rate card), prorated like a live commit, capped at the pool ceiling. HR may override
 * the amount; the override is clamped to the prorated ceiling (server-authoritative money) and noted.
 * Saved as a locked MedicalCommitment back-dated to the approval date, with a covered-person snapshot.
 */
async function recordMedicalBackfill(
  actorId: string,
  userId: string,
  approvalDate: Date,
  dateRaw: string,
  coveredIds: string[],
  override: number | null,
): Promise<ManualResult> {
  const ctx = await loadMedicalContext(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const existing = await prisma.medicalCommitment.findUnique({
    where: { userId_planYearId: { userId, planYearId: ctx.planYear.id } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "This employee already has a medical commitment for the open plan year — edit it from the submissions list instead." };
  }

  // coveredIds present → use exactly that set; empty → default to all family dependants with a DOB.
  const priced = priceMedical(ctx, approvalDate, coveredIds.length > 0 ? coveredIds : null);

  // HR override (optional) — never above the prorated ceiling.
  let premium = priced.premium;
  let adjusted = false;
  if (override != null && Number.isFinite(override) && override > 0 && override !== priced.premium) {
    premium = Math.min(override, priced.proratedCeiling);
    adjusted = true;
  }

  await prisma.medicalCommitment.create({
    data: {
      userId,
      planYearId: ctx.planYear.id,
      premium,
      committedById: actorId,
      committedAt: approvalDate,
      coveredPeople: { create: priced.coveredPeople },
    },
  });

  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");

  const parts = [
    `Committed EGP ${premium.toLocaleString()} for ${priced.coveredCount} covered ${priced.coveredCount === 1 ? "person" : "people"}, dated ${dateRaw}.`,
  ];
  if (ctx.eligibility.status === "PRORATED") parts.push(`Prorated ${ctx.eligibility.remainingWholeMonths}/12.`);
  if (adjusted) parts.push(`HR-adjusted from the computed EGP ${priced.premium.toLocaleString()}.`);
  else if (premium < priced.proratedPremium) parts.push("Capped at the pool ceiling.");
  if (priced.anyOverTop) parts.push("A covered person is over 75 (top band) — review.");
  return { ok: true, message: parts.join(" ") };
}
