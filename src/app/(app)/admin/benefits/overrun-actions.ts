"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { formatEGP } from "@/lib/labels";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { poolStateFor, withPoolLock } from "@/lib/benefits/pool";

/**
 * Resolving an over-drawn pool (mockup approved 2026-08-20).
 *
 * The ceiling is now enforced on every write path, so a NEW overrun cannot be created. What
 * remains possible by design is the ceiling SHRINKING under money already spent — HR lowers a
 * configured amount, corrects an employment type or start date, or re-dates a cycle. Those must
 * stay possible, so the overrun is surfaced on the report and resolved here.
 *
 * Four routes. Two live in this file; the other two already existed and are reached from the same
 * panel: remove or re-price the medical commitment (`removeMedicalCommitment` /
 * `editMedicalCommitment` in ./actions.ts).
 */

export type ResolveResult = { ok: true; message: string } | { ok: false; error: string };

/** Every route records WHY — the point of resolving in-app rather than in the database is the record. */
function readReason(formData: FormData): string | null {
  const reason = String(formData.get("reason") ?? "").trim();
  return reason.length === 0 ? null : reason.slice(0, 500);
}

async function planYearOf(planYearId: string) {
  return prisma.planYear.findUnique({
    where: { id: planYearId },
    select: { id: true, startDate: true, endDate: true, status: true, name: true },
  });
}

/**
 * ROUTE 1 — reduce a flexible claim so the pool balances. HR Admin.
 *
 * Reduce ONLY. Nothing else in the app edits a claim's amount after creation (every other update
 * is a status transition), and allowing an increase here would be a way to spend past the ceiling
 * through the very screen built to stop that.
 */
export async function reduceFlexibleClaim(formData: FormData): Promise<ResolveResult> {
  await requireAdmin();
  const claimId = String(formData.get("claimId") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").replace(/[^0-9]/g, "");
  const reason = readReason(formData);
  if (!claimId) return { ok: false, error: "Missing claim." };
  if (!reason) return { ok: false, error: "Give a reason — it is recorded on the claim." };

  const amount = Number.parseInt(rawAmount, 10);
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: "Enter a valid amount." };

  const claim = await prisma.benefitClaim.findUnique({
    where: { id: claimId },
    include: { user: { select: { name: true } }, catalogItem: { select: { name: true } } },
  });
  if (!claim) return { ok: false, error: "That claim no longer exists." };
  if (!claim.catalogItemId) {
    return { ok: false, error: "Only flexible claims draw on the pool — a guaranteed benefit is paid from its own budget." };
  }
  if (amount >= claim.amount) {
    return {
      ok: false,
      error: `This can only reduce a claim. It is ${formatEGP(claim.amount)} now, so enter less than that.`,
    };
  }

  // A reimbursed claim has already been PAID. Reducing the record without recovering the
  // difference would quietly make the books disagree with the bank, so it is refused here and
  // sent to Finance, who own recoveries.
  if (claim.status === "REIMBURSED") {
    return {
      ok: false,
      error:
        `${formatEGP(claim.amount)} has already been reimbursed to ${claim.user.name ?? "this employee"}. ` +
        `Reducing it here would not recover the difference — raise it with Finance instead.`,
    };
  }

  await prisma.benefitClaim.update({
    where: { id: claimId },
    data: {
      amount,
      note: `${claim.note ? `${claim.note} · ` : ""}Reduced from ${formatEGP(claim.amount)} to ${formatEGP(amount)} to resolve a pool overrun — ${reason}`,
    },
  });

  revalidatePath("/admin/benefits/report");
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
  return {
    ok: true,
    message: `${claim.catalogItem?.name ?? "Claim"} reduced to ${formatEGP(amount)}.`,
  };
}

/**
 * ROUTE 2 — raise this person's ceiling for this cycle. SUPER USER ONLY.
 *
 * This authorises spend past a money rule rather than reversing it, so it sits with governance and
 * not with HR Admin (decided 2026-08-20). The typed amount becomes their ceiling for this cycle —
 * `poolCeiling` reads it, so every write path measures against the new figure from that moment on.
 */
export async function raisePoolCeiling(formData: FormData): Promise<ResolveResult> {
  const actor = await requireAdmin();
  if (!isSuperUser(actor.role)) {
    return { ok: false, error: "Only a Super User can raise someone's ceiling." };
  }

  const userId = String(formData.get("userId") ?? "").trim();
  const planYearId = String(formData.get("planYearId") ?? "").trim();
  const amount = Number.parseInt(String(formData.get("amount") ?? "").replace(/[^0-9]/g, ""), 10);
  const reason = readReason(formData);
  if (!userId || !planYearId) return { ok: false, error: "Missing employee or cycle." };
  if (!reason) return { ok: false, error: "Give a reason — it is recorded against the exception." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the new ceiling." };

  const planYear = await planYearOf(planYearId);
  if (!planYear) return { ok: false, error: "That cycle no longer exists." };

  // Take the same lock a claim takes, so a raise cannot interleave with a claim being evaluated
  // against the old ceiling.
  const result = await withPoolLock(userId, async () => {
    const pool = await poolStateFor(userId, planYear);
    if (pool.ceiling == null) {
      return { ok: false as const, error: `This employee has no pool this cycle — ${pool.reason ?? "not configured"}.` };
    }
    if (amount < pool.used) {
      return {
        ok: false as const,
        error: `They have already used ${formatEGP(pool.used)}, so a ceiling of ${formatEGP(amount)} would leave them over it. Raise it to at least ${formatEGP(pool.used)}.`,
      };
    }
    await prisma.poolCeilingException.upsert({
      where: { userId_planYearId: { userId, planYearId } },
      create: { userId, planYearId, kind: "RAISED", amount, reason, createdById: actor.id },
      update: { kind: "RAISED", amount, reason, createdById: actor.id },
    });
    return { ok: true as const, message: `Ceiling for this cycle raised to ${formatEGP(amount)}.` };
  });

  if (result.ok) {
    revalidatePath("/admin/benefits/report");
    revalidatePath("/benefits");
  }
  return result;
}

/**
 * ROUTE 4 — accept the overrun and record why. HR Admin.
 *
 * Changes no money at all: the pool really is overdrawn and the report keeps saying so in the
 * figures. What it changes is that the row stops asking to be actioned, and the decision is on the
 * record with a name against it.
 */
export async function acceptPoolOverrun(formData: FormData): Promise<ResolveResult> {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const planYearId = String(formData.get("planYearId") ?? "").trim();
  const reason = readReason(formData);
  if (!userId || !planYearId) return { ok: false, error: "Missing employee or cycle." };
  if (!reason) return { ok: false, error: "Give a reason — accepting an overrun without one leaves no record of the decision." };

  const planYear = await planYearOf(planYearId);
  if (!planYear) return { ok: false, error: "That cycle no longer exists." };

  const pool = await poolStateFor(userId, planYear);
  if (pool.remaining == null || pool.remaining >= 0) {
    return { ok: false, error: "This pool is not overdrawn, so there is nothing to accept." };
  }

  await prisma.poolCeilingException.upsert({
    where: { userId_planYearId: { userId, planYearId } },
    create: { userId, planYearId, kind: "ACCEPTED", amount: null, reason, createdById: actor.id },
    update: { kind: "ACCEPTED", amount: null, reason, createdById: actor.id },
  });

  revalidatePath("/admin/benefits/report");
  return { ok: true, message: `Overrun of ${formatEGP(Math.abs(pool.remaining))} accepted and recorded.` };
}

/** Undo a decision — the row goes back to being flagged, and a raised ceiling reverts. */
export async function clearPoolException(formData: FormData): Promise<ResolveResult> {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "").trim();
  const planYearId = String(formData.get("planYearId") ?? "").trim();
  if (!userId || !planYearId) return { ok: false, error: "Missing employee or cycle." };

  const existing = await prisma.poolCeilingException.findUnique({
    where: { userId_planYearId: { userId, planYearId } },
  });
  if (!existing) return { ok: false, error: "There is no decision to undo." };
  // Reverting a RAISED ceiling can put someone back over it, which is a governance action.
  if (existing.kind === "RAISED" && !isSuperUser(actor.role)) {
    return { ok: false, error: "Only a Super User can undo a raised ceiling." };
  }

  await prisma.poolCeilingException.delete({ where: { id: existing.id } });
  revalidatePath("/admin/benefits/report");
  revalidatePath("/benefits");
  return { ok: true, message: "Decision undone." };
}
