"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ClaimType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { getMedicalRateBands } from "@/lib/benefits/config";
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
  await prisma.planYear.create({ data: { name, status: "OPEN", startDate, endDate } });
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
    include: {
      user: {
        select: {
          name: true,
          dateOfBirth: true,
          employmentType: true,
          tenureBand: true,
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

  const [bands, ceilingRow] = await Promise.all([
    getMedicalRateBands(),
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
  if (bands.length === 0 || !ceilingRow) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Benefits aren't fully configured for that employee."));
  }

  // Re-price by age at the edit date; cap at the full pool ceiling (HR override — unchanged behavior).
  const refDate = new Date();
  const people: PricedPerson[] = [{ dob: commitment.user.dateOfBirth }, ...covered.map((d) => ({ dob: d.dateOfBirth }))];
  const { annualEGP, lines } = sumMedicalPremium(people, bands, refDate);
  const premium = Math.min(annualEGP, ceilingRow.amount);

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
