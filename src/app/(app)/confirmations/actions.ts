"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, isSuperUser } from "@/lib/roles";
import { canConfirmBatches } from "@/lib/finance/confirmers";
import { canDecide } from "@/lib/finance/batches";
import { fromPiastres, toPiastres } from "@/lib/finance/money";
import { refuse, isRefusal } from "@/lib/finance/refusal";
import { formatEGP2, formatDate } from "@/lib/labels";
import { sendEmail } from "@/lib/email/client";
import { paybackPaidToEmployee, claimReimbursedToEmployee } from "@/lib/email/templates";

/**
 * What the confirmer does (spec 040).
 *
 * He has already confirmed the transactions at the bank. Pressing "Transaction complete" records
 * that here — and it is the ONLY moment anybody is told they have been paid, because it is the
 * only moment at which that is true. This is the CEO's correction of 2026-08-24, and the reason
 * the two "money reached you" emails in the whole application fire from this file and nowhere else.
 */

const q = (s: string) => encodeURIComponent(s);
const BACK = "/confirmations";

function fail(msg: string): never {
  redirect(`${BACK}?error=${q(msg)}`);
}

async function requireConfirmer() {
  const user = await requireUser();
  const isConfirmer = await canConfirmBatches(user.id);
  // No role fallback: holding top-level access lets you APPOINT a confirmer, not be one.
  if (!isConfirmer && !isSuperUser(user.role)) redirect("/dashboard");
  return { id: user.id, isConfirmer, isSuperUser: isSuperUser(user.role) };
}

export async function markComplete(formData: FormData): Promise<void> {
  const viewer = await requireConfirmer();
  const id = ((formData.get("id") as string | null) ?? "").trim();

  let told: { paybacks: string[]; claims: string[] } = { paybacks: [], claims: [] };

  try {
    told = await prisma.$transaction(async (tx) => {
      const batch = await tx.paymentBatch.findUnique({
        where: { id },
        select: {
          status: true,
          submittedById: true,
          totalAmount: true,
          valueDate: true,
          items: { select: { paybackRequestId: true, benefitClaimId: true, amountAtSubmission: true } },
        },
      });
      if (!batch) refuse("That no longer exists.");

      const decision = canDecide(
        { status: batch.status, submittedById: batch.submittedById },
        { id: viewer.id, isConfirmer: viewer.isConfirmer, isSuperUser: viewer.isSuperUser },
      );
      if (!decision.ok) refuse(decision.reason);

      await tx.paymentBatch.update({
        where: { id },
        data: {
          status: "COMPLETE",
          decidedById: viewer.id,
          decidedAt: new Date(),
          // Stored so "what did he actually confirm?" is answerable without inference. Equal to
          // totalAmount by construction — the items were locked the moment it was submitted.
          confirmedTotal: batch.totalAmount,
        },
      });

      const paybackIds = batch.items.map((i) => i.paybackRequestId).filter((v): v is string => !!v);
      const claimIds = batch.items.map((i) => i.benefitClaimId).filter((v): v is string => !!v);

      for (const item of batch.items) {
        if (item.paybackRequestId) {
          await tx.paybackRequest.update({
            where: { id: item.paybackRequestId },
            data: {
              status: "PAID",
              paidById: viewer.id,
              paidAt: new Date(),
              transferDate: batch.valueDate,
              amountTransferred: item.amountAtSubmission,
            },
          });
        }
        if (item.benefitClaimId) {
          await tx.benefitClaim.update({
            where: { id: item.benefitClaimId },
            data: {
              status: "REIMBURSED",
              paidById: viewer.id,
              paidAt: new Date(),
              transferDate: batch.valueDate,
              // Benefits money is whole EGP; the item stores piastres-precise Decimal.
              amountTransferred: Math.round(fromPiastres(toPiastres(item.amountAtSubmission))),
            },
          });
        }
      }

      return { paybacks: paybackIds, claims: claimIds };
    });
  } catch (e) {
    if (isRefusal(e)) fail(e.reason);
    throw e;
  }

  // Only now, and outside the transaction: the money has moved, so the people in it are told.
  await tellEveryonePaid(told);

  revalidatePath(BACK);
  revalidatePath("/finance");
  revalidatePath("/benefits");
  revalidatePath("/payback");
  redirect(`${BACK}?ok=${q("Recorded as complete. Everyone in it has been told.")}`);
}

/** The two "your money has arrived" emails in the whole application. Fire-and-forget. */
async function tellEveryonePaid(told: { paybacks: string[]; claims: string[] }) {
  if (told.paybacks.length) {
    const rows = await prisma.paybackRequest.findMany({
      where: { id: { in: told.paybacks } },
      select: {
        description: true,
        transferDate: true,
        amountTransferred: true,
        user: { select: { email: true } },
      },
    });
    for (const r of rows) {
      await sendEmail({
        to: r.user.email,
        ...paybackPaidToEmployee({
          amount: formatEGP2(r.amountTransferred),
          transferDate: formatDate(r.transferDate),
          description: r.description,
        }),
      });
    }
  }

  if (told.claims.length) {
    const rows = await prisma.benefitClaim.findMany({
      where: { id: { in: told.claims } },
      select: {
        transferDate: true,
        amountTransferred: true,
        user: { select: { email: true } },
        guaranteedBenefit: { select: { name: true } },
        catalogItem: { select: { name: true } },
      },
    });
    for (const r of rows) {
      await sendEmail({
        to: r.user.email,
        ...claimReimbursedToEmployee({
          benefitName: r.guaranteedBenefit?.name ?? r.catalogItem?.name ?? "a benefit",
          amount: r.amountTransferred ?? 0,
          transferDate: formatDate(r.transferDate),
        }),
      });
    }
  }
}

/**
 * Hand it back to Finance with a note. The payables are released and go back to awaiting payment
 * — and crucially NOBODY is told they were paid, because they were not.
 */
export async function returnToFinance(formData: FormData): Promise<void> {
  const viewer = await requireConfirmer();
  const id = ((formData.get("id") as string | null) ?? "").trim();
  const note = ((formData.get("note") as string | null) ?? "").trim();
  if (!note) fail("Add a note so Finance knows what to fix.");

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.paymentBatch.findUnique({
        where: { id },
        select: {
          status: true,
          submittedById: true,
          items: { select: { paybackRequestId: true, benefitClaimId: true } },
        },
      });
      if (!batch) refuse("That no longer exists.");

      const decision = canDecide(
        { status: batch.status, submittedById: batch.submittedById },
        { id: viewer.id, isConfirmer: viewer.isConfirmer, isSuperUser: viewer.isSuperUser },
      );
      if (!decision.ok) refuse(decision.reason);

      const paybackIds = batch.items.map((i) => i.paybackRequestId).filter((v): v is string => !!v);
      const claimIds = batch.items.map((i) => i.benefitClaimId).filter((v): v is string => !!v);

      await tx.paymentBatchItem.deleteMany({ where: { batchId: id } });
      if (paybackIds.length) {
        await tx.paybackRequest.updateMany({ where: { id: { in: paybackIds } }, data: { status: "APPROVED" } });
      }
      if (claimIds.length) {
        await tx.benefitClaim.updateMany({ where: { id: { in: claimIds } }, data: { status: "APPROVED" } });
      }
      await tx.paymentBatch.update({
        where: { id },
        data: { status: "RETURNED", decidedById: viewer.id, decidedAt: new Date(), decisionNote: note },
      });
    });
  } catch (e) {
    if (isRefusal(e)) fail(e.reason);
    throw e;
  }

  revalidatePath(BACK);
  revalidatePath("/finance");
  redirect(`${BACK}?ok=${q("Sent back to Finance. Nobody has been told they were paid.")}`);
}
