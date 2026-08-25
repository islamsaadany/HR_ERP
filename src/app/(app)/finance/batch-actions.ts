"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canSubmitTransactions } from "@/lib/finance/access";
import { confirmersForUnit } from "@/lib/finance/confirmers";
import { batchTotal, nextBatchReference, describeBatch, sameBusinessUnit } from "@/lib/finance/batches";
import { parseAmountInput, fromPiastres } from "@/lib/finance/money";
import { availablePayables, itemParentFor, type PayableKind } from "@/lib/finance/payables";
import { refuse, isRefusal } from "@/lib/finance/refusal";
import { storeEvidenceFiles, evidenceFilesFrom } from "@/lib/finance/evidence";
import { formatEGP2, formatDate } from "@/lib/labels";
import { sendEmail } from "@/lib/email/client";
import { transactionsAwaitingConfirmation } from "@/lib/email/templates";

/**
 * Finance's side of the confirmation flow (spec 041).
 *
 * Finance CREATES the transactions in the bank and then records them here — nothing in this file
 * moves money or asks anyone's permission to. Submitting freezes the total and locks the payables,
 * so what the CEO is emailed is exactly what he confirms.
 */

const q = (s: string) => encodeURIComponent(s);
const BACK = "/finance";

function fail(msg: string): never {
  redirect(`${BACK}?error=${q(msg)}`);
}

/**
 * The salary screen's own refusal. A separate function DECLARATION rather than an arrow inside
 * the action: only a declaration takes part in TypeScript's control-flow analysis, so the checks
 * that follow actually narrow (the same lesson spec 040 recorded, re-learned here).
 */
function failSalary(msg: string): never {
  redirect(`/finance/salary?error=${q(msg)}`);
}

async function requireSubmitter(): Promise<{ id: string; name: string | null }> {
  const user = await requireUser();
  if (!canSubmitTransactions(user.role)) redirect("/dashboard");
  return { id: user.id, name: user.name ?? null };
}

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = ((raw as string | null) ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Tell the people appointed for THIS unit. After the write, never inside it, and never blocking.
 *
 * Per unit since 2026-08-25: somebody appointed for one unit is not told about another's money,
 * which is most of what "by business unit" means in practice — the email is the thing that
 * actually reaches a person.
 */
async function notifyConfirmers(batch: {
  reference: string;
  type: "EXPENSES" | "SALARY";
  itemCount: number;
  totalPiastres: number;
  valueDate: Date;
  salaryMonth?: Date | null;
  headcount?: number | null;
  submittedBy: string;
  businessUnitId: string;
  businessUnitName: string;
}) {
  const confirmers = await confirmersForUnit(batch.businessUnitId);
  if (confirmers.length === 0) return;

  const total = formatEGP2(fromPiastres(batch.totalPiastres));
  const summary = describeBatch(
    {
      type: batch.type,
      itemCount: batch.itemCount,
      salaryMonth: batch.salaryMonth,
      headcount: batch.headcount,
    },
    total,
  );

  for (const c of confirmers) {
    await sendEmail({
      to: c.email,
      ...transactionsAwaitingConfirmation({
        summary,
        reference: batch.reference,
        count: batch.itemCount,
        total,
        submittedBy: batch.submittedBy,
        valueDate: formatDate(batch.valueDate),
        businessUnit: batch.businessUnitName,
      }),
    });
  }
}

/** "AUG-26-03" — the next free sequence this month. */
async function makeReference(when: Date): Promise<string> {
  const monthStart = new Date(when.getFullYear(), when.getMonth(), 1);
  const nextMonth = new Date(when.getFullYear(), when.getMonth() + 1, 1);
  const used = await prisma.paymentBatch.count({
    where: { submittedAt: { gte: monthStart, lt: nextMonth } },
  });
  return nextBatchReference(when, used + 1);
}

// ─── Submitting what Finance created in the bank ───────────────────────────

export async function submitTransactions(formData: FormData): Promise<void> {
  const actor = await requireSubmitter();

  // Each selection arrives as "KIND:id" so one checkbox list can carry three kinds of payable.
  const picked = formData
    .getAll("payables")
    .map((v) => String(v))
    .map((v) => {
      const [kind, id] = v.split(":");
      return { kind: kind as PayableKind, id };
    })
    .filter((p) => p.id);

  if (picked.length === 0) fail("Nothing selected.");

  // Which unit's account this was created in. The screen posts it with the group's own button, so
  // it is never a free choice — but it is re-checked below against every payable, because a form
  // can be posted by hand.
  const businessUnitId = ((formData.get("businessUnitId") as string | null) ?? "").trim();
  if (!businessUnitId) fail("Which business unit is this? Send from one unit's list.");

  const valueDate = parseDate(formData.get("valueDate"));
  if (!valueDate) fail("Enter the value date at the bank.");
  if (valueDate.getTime() > endOfToday().getTime()) fail("The value date can't be in the future.");

  const bankReference = ((formData.get("bankReference") as string | null) ?? "").trim().slice(0, 100) || null;
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  let created: { reference: string; itemCount: number; total: number } | null = null;

  try {
    created = await prisma.$transaction(async (tx) => {
      // Re-read what is actually available INSIDE the transaction. The page's list is a minute
      // old, and the unique indexes on the item table are the backstop, not the check.
      const available = await availablePayables();
      const byKey = new Map(available.map((p) => [`${p.kind}:${p.id}`, p]));

      const items = picked.map((p) => {
        const found = byKey.get(`${p.kind}:${p.id}`);
        if (!found) {
          refuse("Some of those are no longer available — they may already be waiting for confirmation.");
        }
        return found;
      });

      // One submission is one transaction in one account, so everything in it belongs to one unit.
      const sameUnit = sameBusinessUnit(items, businessUnitId);
      if (!sameUnit.ok) refuse(sameUnit.reason);

      // And that unit must actually have somebody to confirm it. The CEO's choice, of three
      // offered: refuse and say so, rather than fall back to anybody else.
      const confirmers = await confirmersForUnit(businessUnitId);
      if (confirmers.length === 0) {
        refuse("Nobody is appointed to confirm that business unit's transactions, so it can't be sent yet.");
      }

      const totalPiastres = batchTotal(items.map((i) => ({ amountPiastres: i.amountPiastres })));
      const reference = await makeReference(new Date());

      const batch = await tx.paymentBatch.create({
        data: {
          reference,
          type: "EXPENSES",
          businessUnitId,
          bankReference,
          valueDate,
          note,
          totalAmount: fromPiastres(totalPiastres),
          itemCount: items.length,
          submittedById: actor.id,
          items: {
            create: items.map((i) => ({
              ...itemParentFor(i.kind, i.id),
              amountAtSubmission: fromPiastres(i.amountPiastres),
              payeeName: i.payeeName,
              purpose: i.purpose,
            })),
          },
        },
      });

      // The payables move to "at the bank". Nobody is told anything yet — they have not been paid.
      const paybackIds = items.filter((i) => i.kind === "PAYBACK").map((i) => i.id);
      if (paybackIds.length) {
        await tx.paybackRequest.updateMany({
          where: { id: { in: paybackIds } },
          data: { status: "PAYMENT_SUBMITTED" },
        });
      }
      const claimIds = items.filter((i) => i.kind === "BENEFIT_CLAIM").map((i) => i.id);
      if (claimIds.length) {
        await tx.benefitClaim.updateMany({
          where: { id: { in: claimIds } },
          data: { status: "PAYMENT_SUBMITTED" },
        });
      }

      return { reference: batch.reference, itemCount: items.length, total: totalPiastres };
    });
  } catch (e) {
    if (isRefusal(e)) fail(e.reason);
    throw e;
  }

  const unit = await prisma.businessUnit.findUnique({
    where: { id: businessUnitId },
    select: { name: true },
  });

  await notifyConfirmers({
    reference: created.reference,
    type: "EXPENSES",
    itemCount: created.itemCount,
    totalPiastres: created.total,
    valueDate,
    submittedBy: actor.name ?? "Finance",
    businessUnitId,
    businessUnitName: unit?.name ?? "the business unit",
  });

  revalidatePath(BACK);
  revalidatePath("/confirmations");
  revalidatePath("/benefits");
  revalidatePath("/payback");
  redirect(`${BACK}?ok=${q(`${created.reference} submitted for confirmation.`)}`);
}

// ─── The monthly salary run ────────────────────────────────────────────────

export async function submitSalaryRun(formData: FormData): Promise<void> {
  const actor = await requireSubmitter();
  const back = "/finance/salary";

  // One run per unit per month (2026-08-25): each unit's payroll leaves its own account and is
  // confirmed by its own person, so a month is only covered when every unit has been sent.
  const businessUnitId = ((formData.get("businessUnitId") as string | null) ?? "").trim();
  if (!businessUnitId) failSalary("Choose which business unit's payroll this is.");

  const monthRaw = ((formData.get("salaryMonth") as string | null) ?? "").trim();
  if (!monthRaw) failSalary("Choose the month this run covers.");
  // <input type="month"> gives "2026-08"; anchor it to the first of the month.
  const salaryMonth = new Date(`${monthRaw}-01T00:00:00Z`);
  if (Number.isNaN(salaryMonth.getTime())) failSalary("That month isn't valid.");
  if (salaryMonth.getTime() > endOfToday().getTime()) failSalary("That month is in the future.");

  const parsed = parseAmountInput(formData.get("totalAmount"));
  if (!parsed.ok) failSalary(parsed.error);

  const headcount = parseInt(((formData.get("headcount") as string | null) ?? "").replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(headcount) || headcount <= 0) failSalary("Enter how many people this run covers.");

  const isExtraRun = formData.get("isExtraRun") === "yes";
  const extraRunReason = ((formData.get("extraRunReason") as string | null) ?? "").trim() || null;
  if (isExtraRun && !extraRunReason) failSalary("Say why this is a second run for that month.");

  const valueDate = parseDate(formData.get("valueDate")) ?? new Date();
  const bankReference = ((formData.get("bankReference") as string | null) ?? "").trim().slice(0, 100) || null;
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;

  // The bank's file, if they have one. Same limits as every other attachment in the module.
  const files = evidenceFilesFrom(formData, "attachment");
  let attachmentUrl: string | null = null;
  let attachmentName: string | null = null;
  if (files.length) {
    const stored = await storeEvidenceFiles(files.slice(0, 1), { pathPrefix: `salary/${monthRaw}` });
    if (!stored.ok) failSalary(stored.error);
    attachmentUrl = stored.files[0].blobUrl;
    attachmentName = stored.files[0].fileName;
  }

  const unit = await prisma.businessUnit.findUnique({
    where: { id: businessUnitId },
    select: { name: true },
  });
  if (!unit) failSalary("That business unit no longer exists.");

  const confirmers = await confirmersForUnit(businessUnitId);
  if (confirmers.length === 0) {
    failSalary(
      `Nobody is appointed to confirm ${unit.name}'s transactions, so its payroll can't be sent yet.`,
    );
  }

  if (!isExtraRun) {
    // The clash is per (unit, month) now — two units both running August is normal, one unit
    // running August twice is what needs saying out loud.
    const clash = await prisma.paymentBatch.findFirst({
      where: {
        type: "SALARY",
        businessUnitId,
        salaryMonth,
        isExtraRun: false,
        status: { not: "WITHDRAWN" },
      },
      select: { reference: true },
    });
    if (clash) {
      failSalary(
        `${unit.name} already has a salary run for that month (${clash.reference}). Tick “extra run” and say why if this is a second transfer.`,
      );
    }
  }

  const reference = await makeReference(new Date());
  await prisma.paymentBatch.create({
    data: {
      reference,
      type: "SALARY",
      businessUnitId,
      valueDate,
      bankReference,
      note,
      // A salary run carries no items: there is no per-person data in this feature, by design.
      totalAmount: fromPiastres(parsed.piastres),
      itemCount: 0,
      salaryMonth,
      headcount,
      isExtraRun,
      extraRunReason,
      attachmentUrl,
      attachmentName,
      submittedById: actor.id,
    },
  });

  await notifyConfirmers({
    reference,
    type: "SALARY",
    itemCount: 0,
    totalPiastres: parsed.piastres,
    valueDate,
    salaryMonth,
    headcount,
    submittedBy: actor.name ?? "Finance",
    businessUnitId,
    businessUnitName: unit.name,
  });

  revalidatePath(back);
  revalidatePath("/confirmations");
  redirect(`${back}?ok=${q(`${reference} submitted for confirmation.`)}`);
}

// ─── Withdrawing ───────────────────────────────────────────────────────────

/**
 * Pull a submission back before it is decided. The payables are released — which is what
 * "released" means: the items are deleted, so each becomes selectable again.
 */
export async function withdrawSubmission(formData: FormData): Promise<void> {
  await requireSubmitter();
  const id = ((formData.get("id") as string | null) ?? "").trim();
  const reason = ((formData.get("reason") as string | null) ?? "").trim();
  if (!reason) fail("Say why it's being withdrawn — it changes what the CEO was told.");

  try {
    await prisma.$transaction(async (tx) => {
      const batch = await tx.paymentBatch.findUnique({
        where: { id },
        select: { status: true, items: { select: { paybackRequestId: true, benefitClaimId: true } } },
      });
      if (!batch) refuse("That no longer exists.");
      if (batch.status !== "SUBMITTED") refuse("That has already been dealt with.");

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
        data: { status: "WITHDRAWN", decidedAt: new Date(), decisionNote: reason },
      });
    });
  } catch (e) {
    if (isRefusal(e)) fail(e.reason);
    throw e;
  }

  revalidatePath(BACK);
  revalidatePath("/confirmations");
  redirect(`${BACK}?ok=${q("Withdrawn. Those payments are waiting again.")}`);
}
