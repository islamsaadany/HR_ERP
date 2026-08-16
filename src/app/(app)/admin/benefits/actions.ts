"use server";

import { revalidatePath } from "next/cache";
import { reconcileMedicalCharges } from "@/lib/benefits/reconcile";
import { redirect } from "next/navigation";
import type { ClaimType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { getMedicalRateBands, poolCeilingFor } from "@/lib/benefits/config";
import { deriveTenureBand } from "@/lib/tenure";
import { sumMedicalPremium, type PricedPerson } from "@/lib/benefits/rates";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { claimApprovedToFinance, claimRejectedToEmployee } from "@/lib/email/templates";

/** Parse a yyyy-mm-dd form value to a Date, or null if absent/invalid. */
function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = (raw as string | null)?.trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Apply the medical charges scheduled against a benefits cycle when that cycle opens (spec 027).
 *
 * A premium committed under a policy term that outlives its cycle leaves a SCHEDULED charge on the
 * next one; opening that cycle is what makes it draw. Nothing for HR to remember — forgetting would
 * silently give an employee a pool with no medical in it.
 *
 * An employee who is no longer ACTIVE has their charge CANCELLED rather than applied: the premium
 * paid in advance for cover after their leave date is recovered from the insurer, so nothing is
 * owed by anyone and charging a pool they no longer hold would be meaningless.
 */
async function applyScheduledMedicalCharges(planYearId: string): Promise<void> {
  const scheduled = await prisma.medicalCycleCharge.findMany({
    where: { planYearId, status: "SCHEDULED" },
    select: { id: true, commitment: { select: { user: { select: { status: true } } } } },
  });
  if (scheduled.length === 0) return;

  const toApply = scheduled.filter((c) => c.commitment.user.status === "ACTIVE").map((c) => c.id);
  const toCancel = scheduled.filter((c) => c.commitment.user.status !== "ACTIVE").map((c) => c.id);

  if (toApply.length > 0) {
    await prisma.medicalCycleCharge.updateMany({
      where: { id: { in: toApply } },
      data: { status: "APPLIED", appliedAt: new Date() },
    });
  }
  if (toCancel.length > 0) {
    await prisma.medicalCycleCharge.updateMany({
      where: { id: { in: toCancel } },
      data: { status: "CANCELLED" },
    });
  }
}

export async function createPlanYear(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = (formData.get("name") as string | null)?.trim();
  if (!name) return;
  // Proration window (spec 019): both optional, but if both given, end must be after start.
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Plan-year end date must be after the start date."));
  }
  // Close any currently open years, then open the new one.
  await prisma.planYear.updateMany({
    where: { status: "OPEN" },
    data: { status: "CLOSED" },
  });
  const created = await prisma.planYear.create({ data: { name, status: "OPEN", startDate, endDate } });
  // Spec 032: work out what this new cycle owes BEFORE applying, so a share that could never be
  // written at commit time (this cycle didn't exist) is created here and then drawn.
  await reconcileMedicalCharges(created.id);
  await applyScheduledMedicalCharges(created.id);
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/**
 * Set/adjust an existing plan year's proration window (spec 019). HR/Admin only.
 * Both dates required together; end must be after start. Clearing them (blank)
 * turns proration off for that year (treated as "no window").
 */
export async function editPlanYearWindow(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Plan-year end date must be after the start date."));
  }
  await prisma.planYear.update({ where: { id }, data: { startDate, endDate } });
  // Spec 032: the months a term spends in this cycle just changed, so its charges did too.
  await reconcileMedicalCharges();
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/**
 * Turn the 50%-per-benefit cap on or off for ONE cycle (spec 031).
 *
 * The exception exists because the cap is right over twelve months and perverse over five: a
 * ceiling prorated to a short cycle leaves half of it a trivial amount, and the rule meant to
 * encourage variety stops the employee using the pool at all.
 *
 * Only while the cycle is OPEN — it is a reaction to a cycle that turned out short, and a closed
 * cycle must keep the rule its claims were judged under. Changing it re-evaluates nothing: a
 * benefit already past a re-enabled cap simply has zero remaining, never a negative amount and
 * never a clawback.
 */
export async function setFlexCapEnabled(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = (formData.get("id") as string | null)?.trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!id) return;

  const planYear = await prisma.planYear.findUnique({ where: { id }, select: { status: true } });
  if (!planYear) return;
  if (planYear.status !== "OPEN") {
    redirect(
      "/admin/benefits?error=" +
        encodeURIComponent("The 50% limit can only be changed while the cycle is open.")
    );
  }

  await prisma.planYear.update({
    where: { id },
    data: { flexCapEnabled: enabled, flexCapChangedById: admin.id, flexCapChangedAt: new Date() },
  });
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
  // Re-opening a cycle must pick up anything scheduled against it, exactly as creating one does.
  if (status === "OPEN") {
    await reconcileMedicalCharges(id);
    await applyScheduledMedicalCharges(id);
  }
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
  const id = (formData.get("id") as string | null)?.trim();
  if (!id) return;

  // HR ticks which dependants are covered (age-band pricing, spec 023) — one checkbox per dependant.
  const selectedIds = Array.from(new Set(formData.getAll("dependantIds").map(String)));
  const result = await repriceCommitment(id, selectedIds, admin.id);
  if (!result.ok) {
    redirect("/admin/benefits?error=" + encodeURIComponent(`Couldn't re-price: ${result.reason}.`));
  }
  // A changed premium must be re-split, or the charges stop summing to it (FR-014, FR-006).
  // Spec 032: reconcile rather than resplit — resplit could only adjust rows that already existed,
  // so a premium reaching into a cycle created later stayed permanently under-charged.
  await reconcileMedicalCharges();
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/**
 * Price one commitment from the people it currently covers, and write the snapshot.
 *
 * Shared by the per-row Re-price and Re-price all (spec 023/032). Extracted rather than copied:
 * two implementations of a money calculation drift, and the one that drifts is always the one
 * nobody is looking at.
 *
 * Returns a short reason when it can't price, so the bulk caller can report who was skipped
 * instead of failing the whole run on one bad record.
 */
async function repriceCommitment(
  commitmentId: string,
  coveredDependantIds: string[],
  adminId: string
): Promise<{ ok: true; premium: number } | { ok: false; reason: string }> {
  const commitment = await prisma.medicalCommitment.findUnique({
    where: { id: commitmentId },
    include: {
      user: {
        select: {
          name: true,
          dateOfBirth: true,
          employmentType: true,
          startDate: true,
          dependants: { select: { id: true, name: true, dateOfBirth: true, kind: true } },
        },
      },
    },
  });
  if (!commitment) return { ok: false, reason: "no longer exists" };
  if (!commitment.user.dateOfBirth) return { ok: false, reason: "no date of birth" };
  if (!commitment.user.employmentType) return { ok: false, reason: "no employment type" };

  const covered = commitment.user.dependants.filter((d) => coveredDependantIds.includes(d.id));
  const [bands, ceilingAmount] = await Promise.all([
    getMedicalRateBands(),
    poolCeilingFor(commitment.user.employmentType, deriveTenureBand(commitment.user.startDate).band),
  ]);
  if (bands.length === 0) return { ok: false, reason: "no medical rate card" };
  if (ceilingAmount == null) return { ok: false, reason: "no pool ceiling for their type and tenure" };

  const people: PricedPerson[] = [{ dob: commitment.user.dateOfBirth }, ...covered.map((d) => ({ dob: d.dateOfBirth }))];
  const { annualEGP, lines } = sumMedicalPremium(people, bands, new Date());
  const premium = Math.min(annualEGP, ceilingAmount);

  const coveredPeople = [
    { dependantId: null as string | null, label: commitment.user.name ?? "Employee", ageAtCommit: lines[0].ageAtCommit, premiumEGP: lines[0].premiumEGP },
    ...covered.map((d, i) => ({
      dependantId: d.id,
      label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}${lines[i + 1].overTop ? " (over 75 — top band)" : ""}`,
      ageAtCommit: lines[i + 1].ageAtCommit,
      premiumEGP: lines[i + 1].premiumEGP,
    })),
  ];

  await prisma.$transaction([
    prisma.medicalCoveredPerson.deleteMany({ where: { commitmentId } }),
    prisma.medicalCommitment.update({
      where: { id: commitmentId },
      data: { premium, committedById: adminId, coveredPeople: { create: coveredPeople } },
    }),
  ]);
  return { ok: true, premium };
}

/**
 * Re-price every commitment in the open cycle, keeping each person's existing cover (spec 032).
 *
 * HR asked for this after correcting the policy term: doing it row by row across a whole company
 * is the kind of chore that gets half-finished, and a half-repriced list is worse than an
 * unrepriced one because nothing tells you where you stopped.
 *
 * Cover is NOT changed — only the price of the cover already chosen is recalculated, and then the
 * charges are redistributed across the cycles the term touches.
 */
export async function repriceAllCommitments(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const planYearId = (formData.get("planYearId") as string | null)?.trim();
  if (!planYearId) return;

  const commitments = await prisma.medicalCommitment.findMany({
    where: { planYearId },
    select: { id: true, user: { select: { name: true } }, coveredPeople: { select: { dependantId: true } } },
  });

  const skipped: string[] = [];
  for (const c of commitments) {
    const ids = c.coveredPeople.map((p) => p.dependantId).filter((x): x is string => !!x);
    const result = await repriceCommitment(c.id, ids, admin.id);
    if (!result.ok) skipped.push(`${c.user.name} (${result.reason})`);
  }
  await reconcileMedicalCharges();

  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
  // Named, not counted: "3 skipped" sends HR hunting through the list for which three.
  if (skipped.length > 0) {
    redirect(
      "/admin/benefits?error=" +
        encodeURIComponent(
          `Re-priced ${commitments.length - skipped.length} of ${commitments.length}. Not priced: ${skipped.join("; ")}.`
        )
    );
  }
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

/**
 * Edit one age band's annual premium on the medical rate card (spec 023). HR/Admin only. The amount is
 * the operator's figure with up to two decimals (≥ 0); it is stored precisely — employee-facing figures
 * drop the cents at pricing time.
 */
export async function updateMedicalRateBand(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = (formData.get("id") as string | null)?.trim();
  const raw = (formData.get("annualPremium") as string | null)?.trim();
  if (!id || raw == null) return;
  const amount = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Enter a valid premium (0 or more)."));
  }
  // Keep two decimals (money); Prisma accepts a number for a Decimal column.
  await prisma.medicalRateBand.update({
    where: { id },
    data: { annualPremium: Math.round(amount * 100) / 100 },
  });
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

// ── Claim review (approve → Finance / reject → employee) — spec 020 ──
const CLAIM_WITH_PARTIES = {
  user: { select: { name: true, email: true } },
  guaranteedBenefit: { select: { name: true } },
  catalogItem: { select: { name: true } },
} as const;

const benefitNameOf = (c: {
  guaranteedBenefit: { name: string } | null;
  catalogItem: { name: string } | null;
}) => c.guaranteedBenefit?.name ?? c.catalogItem?.name ?? "a benefit";

/**
 * Approve exactly one claim. Extracted so the single-row button and the bulk bar cannot
 * drift: one implementation means a claim approved from the queue's checkbox is treated
 * identically to one approved on its own, emails included.
 *
 * Silently no-ops on a claim that is no longer SUBMITTED — with two people working the
 * queue, a claim decided a second ago is a race, not an error.
 */
async function approveOne(id: string, adminId: string): Promise<boolean> {
  const claim = await prisma.benefitClaim.findUnique({ where: { id }, include: CLAIM_WITH_PARTIES });
  if (!claim || claim.status !== "SUBMITTED") return false;
  await prisma.benefitClaim.update({
    where: { id },
    data: { status: "APPROVED", reviewedById: adminId, decidedAt: new Date() },
  });
  const settings = await getNotificationSettings();
  await sendEmail({
    to: settings.financeInbox,
    ...claimApprovedToFinance({
      employeeName: claim.user.name ?? claim.user.email,
      benefitName: benefitNameOf(claim),
      coveredAmount: claim.amount,
    }),
  });
  return true;
}

/** HR approves a claim → Approved (awaiting Finance payment); the Finance inbox is emailed. */
export async function approveClaim(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await approveOne(id, admin.id);
  revalidatePath("/admin/benefits");
  revalidatePath("/finance");
  revalidatePath("/benefits");
}

/**
 * Approve several claims at once from the review queue's selection.
 *
 * Every claim goes through `approveOne`, so the bulk bar saves the clicks and never the
 * checks — each one is re-read, tested for SUBMITTED, and emailed to Finance on its own.
 * A claim someone else has already decided is skipped rather than failing the batch.
 */
export async function approveClaims(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const ids = Array.from(new Set(formData.getAll("ids").map(String).filter(Boolean)));
  if (ids.length === 0) return;

  let approved = 0;
  for (const id of ids) {
    if (await approveOne(id, admin.id)) approved += 1;
  }

  revalidatePath("/admin/benefits");
  revalidatePath("/finance");
  revalidatePath("/benefits");

  // Say so when the batch didn't do what was asked — a silent partial approval leaves HR
  // believing the queue is clear when part of it isn't.
  if (approved < ids.length) {
    redirect(
      "/admin/benefits?error=" +
        encodeURIComponent(
          `Approved ${approved} of ${ids.length}. The rest had already been decided by someone else.`
        )
    );
  }
}

/** HR rejects a claim → Rejected; the employee is emailed the reason (if given). */
export async function rejectClaim(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id") as string;
  const reason = (formData.get("reason") as string | null)?.trim() || null;
  if (!id) return;
  const claim = await prisma.benefitClaim.findUnique({ where: { id }, include: CLAIM_WITH_PARTIES });
  if (!claim || claim.status !== "SUBMITTED") return;
  await prisma.benefitClaim.update({
    where: { id },
    data: { status: "REJECTED", decisionNote: reason, reviewedById: admin.id, decidedAt: new Date() },
  });
  await sendEmail({
    to: claim.user.email,
    ...claimRejectedToEmployee({ benefitName: benefitNameOf(claim), reason }),
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}
