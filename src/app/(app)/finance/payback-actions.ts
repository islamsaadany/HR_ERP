"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canReviewPayback } from "@/lib/finance/access";
import { parseAmountInput, fromPiastres } from "@/lib/finance/money";
import { formatEGP2, formatDate } from "@/lib/labels";
import { sendEmail } from "@/lib/email/client";
import { paybackRejectedToEmployee, paybackPaidToEmployee } from "@/lib/email/templates";

/**
 * Finance's side of a payback request (spec 039): approve, decline, pay, correct.
 *
 * Approve and pay are deliberately two steps. That is what leaves room for spec 040, where the
 * CEO's approval of the payment run — not Finance recording the transfer — is what makes a
 * request PAID and tells the requester.
 */

const q = (s: string) => encodeURIComponent(s);

function fail(msg: string): never {
  redirect(`/finance?error=${q(msg)}`);
}

async function requireReviewer(): Promise<string> {
  const user = await requireUser();
  if (!canReviewPayback(user.role)) redirect("/dashboard");
  return user.id;
}

/** End of today, so a same-day transfer passes but tomorrow does not. */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function approveRequest(formData: FormData): Promise<void> {
  const actorId = await requireReviewer();
  const id = ((formData.get("id") as string | null) ?? "").trim();

  const request = await prisma.paybackRequest.findUnique({
    where: { id },
    select: { status: true, user: { select: { name: true } } },
  });
  if (!request) fail("That request no longer exists.");
  if (request.status !== "SUBMITTED") fail("That request has already been decided.");

  await prisma.paybackRequest.update({
    where: { id },
    data: { status: "APPROVED", decidedById: actorId, decidedAt: new Date() },
  });

  // No email on approval: the requester learns when the money actually moves, not when a step
  // in our process completes. Telling them "approved" invites "so where is it?".
  revalidatePath("/finance");
  revalidatePath("/payback");
  redirect(`/finance?ok=${q(`Approved — ${request.user.name ?? "they"} will be paid.`)}`);
}

export async function rejectRequest(formData: FormData): Promise<void> {
  const actorId = await requireReviewer();
  const id = ((formData.get("id") as string | null) ?? "").trim();
  const reason = ((formData.get("reason") as string | null) ?? "").trim();
  if (!reason) fail("Give a reason — the person is told why, and “declined” on its own isn't an answer.");

  const request = await prisma.paybackRequest.findUnique({
    where: { id },
    select: { status: true, amount: true, description: true, user: { select: { name: true, email: true } } },
  });
  if (!request) fail("That request no longer exists.");
  if (request.status !== "SUBMITTED") fail("That request has already been decided.");

  await prisma.paybackRequest.update({
    where: { id },
    data: { status: "REJECTED", decidedById: actorId, decidedAt: new Date(), decisionReason: reason },
  });

  await sendEmail({
    to: request.user.email,
    ...paybackRejectedToEmployee({
      amount: formatEGP2(request.amount),
      description: request.description,
      reason,
    }),
  });

  revalidatePath("/finance");
  revalidatePath("/payback");
  redirect(`/finance?ok=${q("Declined, and the person has been told why.")}`);
}

/*
 * `recordPayment` USED TO LIVE HERE, and is deliberately gone (spec 040, 2026-08-24).
 *
 * Same reason as the benefit-claim confirm it sat beside: it marked a request PAID and emailed the
 * requester when Finance recorded a transfer, before the bank had released anything. Finance now
 * ticks approved requests into a submission, and they reach PAID — with the requester told — when
 * the CEO marks that submission complete.
 *
 * `correctPayment` below stays: fixing a mistyped amount on something already paid is bookkeeping,
 * and it still sends no email.
 */

/**
 * Fix a mistyped amount or date on an already-paid request. Does NOT change the status, does
 * NOT touch who recorded it or when, and deliberately sends NO email — the person was told at
 * payment; this is bookkeeping. (Same shape as `editPayment` for benefit claims.)
 */
export async function correctPayment(formData: FormData): Promise<void> {
  await requireReviewer();
  const id = ((formData.get("id") as string | null) ?? "").trim();

  const parsed = parseAmountInput(formData.get("amountTransferred"));
  if (!parsed.ok) fail(parsed.error);

  const dateStr = ((formData.get("transferDate") as string | null) ?? "").trim();
  const transferDate = dateStr ? new Date(dateStr) : null;
  if (!transferDate || Number.isNaN(transferDate.getTime())) fail("Enter the date of the transfer.");
  if (transferDate.getTime() > endOfToday().getTime()) fail("The transfer date can't be in the future.");

  const request = await prisma.paybackRequest.findUnique({ where: { id }, select: { status: true } });
  if (!request) fail("That request no longer exists.");
  if (request.status !== "PAID") fail("That request hasn't been paid, so there is nothing to correct.");

  await prisma.paybackRequest.update({
    where: { id },
    data: { transferDate, amountTransferred: fromPiastres(parsed.piastres) },
  });

  revalidatePath("/finance");
  revalidatePath("/payback");
  redirect(`/finance?ok=${q("Record corrected. No email sent — this is a bookkeeping fix.")}`);
}
