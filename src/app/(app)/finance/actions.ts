"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFinance } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { claimReimbursedToEmployee } from "@/lib/email/templates";

const q = (s: string) => encodeURIComponent(s);

/*
 * `confirmPayment` USED TO LIVE HERE, and is deliberately gone (spec 040, 2026-08-24).
 *
 * It set a claim to REIMBURSED and emailed the employee "you have been reimbursed" the moment
 * Finance recorded a transfer — but the money moves when the CEO confirms it at the bank, which
 * could be hours or days later. Anyone emailed in between was told something untrue and then asked
 * Finance where their money was. That is the confusion the CEO named.
 *
 * A claim is now ticked into a submission on Finance's "Awaiting confirmation" tab
 * (`batch-actions.ts`), and reaches REIMBURSED — with the employee told — in
 * `app/(app)/confirmations/actions.ts`, at the moment the transaction is marked complete.
 *
 * Left as a comment rather than deleted silently: the next person to look for the confirm button
 * should find out where it went, not conclude it was never there.
 */

/**
 * Finance corrects an already-REIMBURSED record — the transferred amount and/or the
 * reimbursement date (e.g. a mistyped date). Same validation as confirming, but it does
 * NOT change status, NOT touch who/when it was confirmed (`paidById`/`paidAt`), and
 * deliberately sends NO email — the employee was already notified at reimbursement, this
 * is a bookkeeping fix. Guarded to Finance/Super User.
 */
export async function editPayment(formData: FormData): Promise<void> {
  await requireFinance();
  const id = formData.get("id") as string;
  if (!id) return;

  const amount = parseInt(((formData.get("amountTransferred") as string | null) ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    redirect("/finance?error=" + q("Enter a valid transferred amount."));
  }
  const dateStr = ((formData.get("transferDate") as string | null) ?? "").trim();
  const transferDate = dateStr ? new Date(dateStr) : null;
  if (!transferDate || Number.isNaN(transferDate.getTime())) {
    redirect("/finance?error=" + q("Enter a valid reimbursement date."));
  }
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (transferDate.getTime() > endOfToday.getTime()) {
    redirect("/finance?error=" + q("The reimbursement date can't be in the future."));
  }

  const claim = await prisma.benefitClaim.findUnique({
    where: { id },
    include: { user: { select: { name: true } } },
  });
  if (!claim || claim.status !== "REIMBURSED") {
    redirect("/finance?error=" + q("That record isn't a reimbursed payment."));
  }

  await prisma.benefitClaim.update({
    where: { id },
    data: { transferDate, amountTransferred: amount },
  });

  revalidatePath("/finance");
  revalidatePath("/benefits");
  revalidatePath("/admin/benefits");
  redirect("/finance?edited=" + q(claim.user.name ?? "the employee"));
}
