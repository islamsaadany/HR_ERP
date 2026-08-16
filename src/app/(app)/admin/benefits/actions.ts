"use server";

import { revalidatePath } from "next/cache";
import { splitPremium } from "@/lib/benefits/policy-year";
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
  if (status === "OPEN") await applyScheduledMedicalCharges(id);
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
    include: {
      user: {
        select: {
          name: true,
          dateOfBirth: true,
          employmentType: true,
          tenureBand: true,
          startDate: true,
          dependants: { select: { id: true, name: true, dateOfBirth: true, kind: true } },
        },
      },
    },
  });
  if (!commitment) redirect("/admin/benefits?error=" + encodeURIComponent("That medical commitment no longer exists."));
  if (!commitment.user.dateOfBirth) {
    redirect("/admin/benefits?error=" + encodeURIComponent("That employee has no date of birth on file — set it before pricing medical."));
  }

  // HR ticks which dependants are covered (age-band pricing, spec 023) — one checkbox per dependant.
  const selectedIds = Array.from(new Set(formData.getAll("dependantIds").map(String)));
  const covered = commitment.user.dependants.filter((d) => selectedIds.includes(d.id));

  // The tenure band is DERIVED from the hire date, exactly as the employee's own commit and claim
  // paths do it — reading the stored `tenureBand` column here made Re-price the one surface that
  // refused an employee everything else priced happily, because the column is usually null and the
  // band comes from `startDate`. `poolCeilingFor` also carries the entry-tier fallback for someone
  // under six months, which the raw lookup skipped.
  const [bands, ceilingAmount] = await Promise.all([
    getMedicalRateBands(),
    commitment.user.employmentType
      ? poolCeilingFor(commitment.user.employmentType, deriveTenureBand(commitment.user.startDate).band)
      : Promise.resolve(null),
  ]);
  if (bands.length === 0 || ceilingAmount == null) {
    redirect(
      "/admin/benefits?error=" +
        encodeURIComponent(
          commitment.user.employmentType
            ? "Benefits aren't fully configured for that employee — no pool ceiling for their employment type and tenure."
            : "That employee has no employment type set — set it before pricing medical."
        )
    );
  }

  // Re-price by age at the edit date; cap at the full pool ceiling (HR override — unchanged behavior).
  const refDate = new Date();
  const people: PricedPerson[] = [{ dob: commitment.user.dateOfBirth }, ...covered.map((d) => ({ dob: d.dateOfBirth }))];
  const { annualEGP, lines } = sumMedicalPremium(people, bands, refDate);
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
    prisma.medicalCoveredPerson.deleteMany({ where: { commitmentId: id } }),
    prisma.medicalCommitment.update({
      where: { id },
      data: { premium, committedById: admin.id, coveredPeople: { create: coveredPeople } },
    }),
  ]);
  // A changed premium must be re-split, or the charges stop summing to it (FR-014, FR-006).
  await resplitCommitmentCharges(id);
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/**
 * Re-split a commitment's premium across its policy term's cycles after HR edits it (spec 027).
 *
 * Charges already APPLIED to a CLOSED cycle are left exactly as they are: that money has been
 * counted against a pool that is now shut, and silently restating it would rewrite history HR has
 * already reconciled against an insurer invoice. The remainder of the premium is spread across the
 * cycles still open, so the set as a whole sums back to the new premium.
 *
 * ONE CASE CANNOT RECONCILE: if HR drops the premium BELOW what closed cycles already absorbed,
 * the charges necessarily still total that larger frozen amount — you cannot un-charge a shut pool.
 * We do not fake it by writing a negative charge. The commitments list compares the total against
 * the premium and shows the mismatch in red, so HR sees the discrepancy and settles it with the
 * insurer rather than the platform quietly inventing a number.
 */
async function resplitCommitmentCharges(commitmentId: string): Promise<void> {
  const commitment = await prisma.medicalCommitment.findUnique({
    where: { id: commitmentId },
    include: { policyYear: true, cycleCharges: { include: { planYear: true } } },
  });
  if (!commitment?.policyYear || commitment.cycleCharges.length === 0) return;

  const frozen = commitment.cycleCharges.filter(
    (c) => c.status === "APPLIED" && c.planYear.status === "CLOSED"
  );
  const frozenTotal = frozen.reduce((n, c) => n + c.amount, 0);
  const reopenable = commitment.cycleCharges.filter((c) => !frozen.includes(c));
  if (reopenable.length === 0) return;

  const remaining = Math.max(0, commitment.premium - frozenTotal);
  const cycles = reopenable
    .filter((c) => c.planYear.startDate && c.planYear.endDate)
    .map((c) => ({ id: c.planYearId, start: c.planYear.startDate!, end: c.planYear.endDate! }));
  if (cycles.length === 0) return;

  const term = { start: commitment.policyYear.startDate, end: commitment.policyYear.endDate };
  const split = splitPremium(remaining, term, cycles);
  // Spread by overlap where we can; if the split can't attribute it (a term no longer overlapping
  // these cycles), put the remainder on the first one rather than losing it.
  const byCycle = new Map(split.shares.map((sh) => [sh.cycle.id, sh.amount]));
  if (split.unallocated > 0 && cycles.length > 0) {
    byCycle.set(cycles[0].id, (byCycle.get(cycles[0].id) ?? 0) + split.unallocated);
  }
  for (const charge of reopenable) {
    await prisma.medicalCycleCharge.update({
      where: { id: charge.id },
      data: { amount: byCycle.get(charge.planYearId) ?? 0 },
    });
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

/** HR approves a claim → Approved (awaiting Finance payment); the Finance inbox is emailed. */
export async function approveClaim(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  const claim = await prisma.benefitClaim.findUnique({ where: { id }, include: CLAIM_WITH_PARTIES });
  // Accept the new SUBMITTED status and the legacy PENDING.
  if (!claim || claim.status !== "SUBMITTED") return;
  await prisma.benefitClaim.update({
    where: { id },
    data: { status: "APPROVED", reviewedById: admin.id, decidedAt: new Date() },
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
  revalidatePath("/admin/benefits");
  revalidatePath("/finance");
  revalidatePath("/benefits");
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
