"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireFinance } from "@/lib/roles";

export type RecoveryResult = { ok: true } | { ok: false; error: string };

function parseAmount(v: FormDataEntryValue | null): number | null {
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Record what the insurer actually returned, closing the recovery (spec 030).
 *
 * The shortfall is stored rather than derived, because it is the number the feature exists to
 * make visible: one partial refund is noise, but a column of them says the insurer is
 * systematically short-paying. Floored at zero — recovering MORE than expected (a fee reversal,
 * a full month credited) is a fine outcome, not a negative loss.
 */
export async function recordRecovery(formData: FormData): Promise<RecoveryResult> {
  const me = await requireFinance();
  const id = String(formData.get("id") ?? "").trim();
  const amount = parseAmount(formData.get("recoveredAmount"));
  const on = parseDate(formData.get("recoveredOn"));
  if (!id) return { ok: false, error: "Missing recovery." };
  if (amount == null) return { ok: false, error: "Enter the amount recovered." };
  if (!on) return { ok: false, error: "Enter the date it was received." };

  const rec = await prisma.medicalRecovery.findUnique({ where: { id }, select: { status: true, expectedAmount: true } });
  if (!rec) return { ok: false, error: "Recovery not found." };
  // A settled recovery is closed. Re-settling would overwrite a recorded outcome.
  if (rec.status !== "OPEN") return { ok: false, error: "That recovery is already settled." };

  await prisma.medicalRecovery.update({
    where: { id },
    data: {
      status: "RECOVERED",
      recoveredAmount: amount,
      recoveredOn: on,
      shortfall: Math.max(0, rec.expectedAmount - amount),
      settledById: me.id,
      settledAt: new Date(),
    },
  });
  revalidatePath("/finance");
  return { ok: true };
}

/**
 * Write a recovery off with a reason (spec 030). Nothing came back, so the WHOLE expected amount
 * becomes the recorded shortfall — a written-off recovery is a booked loss, not a blank.
 */
export async function writeOffRecovery(formData: FormData): Promise<RecoveryResult> {
  const me = await requireFinance();
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return { ok: false, error: "Missing recovery." };
  if (!reason) return { ok: false, error: "Give a reason for writing it off." };

  const rec = await prisma.medicalRecovery.findUnique({ where: { id }, select: { status: true, expectedAmount: true } });
  if (!rec) return { ok: false, error: "Recovery not found." };
  if (rec.status !== "OPEN") return { ok: false, error: "That recovery is already settled." };

  await prisma.medicalRecovery.update({
    where: { id },
    data: {
      status: "WRITTEN_OFF",
      recoveredAmount: 0,
      shortfall: rec.expectedAmount,
      reason,
      settledById: me.id,
      settledAt: new Date(),
    },
  });
  revalidatePath("/finance");
  return { ok: true };
}
