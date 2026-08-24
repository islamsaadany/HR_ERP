"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { canSeePettyCashAccount, canWritePettyCashLine, canManagePettyCash } from "@/lib/finance/access";
import { parseAmountInput, fromPiastres } from "@/lib/finance/money";
import { withAccountLock } from "@/lib/finance/queries";
import { refuse, isRefusal } from "@/lib/finance/refusal";
import { storeEvidenceFiles, evidenceFilesFrom } from "@/lib/finance/evidence";

/**
 * Spend lines and evidence — what the custodian does, and what Finance can do alongside them
 * (spec 039). The period lifecycle and funding live in `finance-actions.ts`.
 */

const q = (s: string) => encodeURIComponent(s);

/**
 * Refuse, and say why on the account page the person came from.
 *
 * A function DECLARATION with an explicit `never` return type: only this form takes part in
 * TypeScript's control-flow analysis, so `if (!x) fail(back, ...)` genuinely narrows `x` afterwards
 * instead of leaving a trail of non-null assertions through the validation.
 */
function fail(back: string, msg: string): never {
  redirect(`${back}?error=${q(msg)}`);
}

function parseDate(raw: FormDataEntryValue | null): Date | null {
  const s = ((raw as string | null) ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Load the period with everything the write rules need, and check that this person may see it
 * at all. Access is decided here — at the door — rather than trusted from the page that
 * rendered the form.
 */
async function loadContext(periodId: string) {
  const user = await requireUser();
  const period = await prisma.pettyCashPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      status: true,
      accountId: true,
      account: {
        select: {
          id: true,
          custodianId: true,
          status: true,
          custodian: { select: { status: true, name: true } },
        },
      },
    },
  });
  if (!period) redirect("/petty-cash");
  if (!canSeePettyCashAccount(user, period.account)) redirect("/dashboard");
  return { user, period, back: `/petty-cash/${period.accountId}` };
}

// ─── Lines ─────────────────────────────────────────────────────────────────

export async function addLine(formData: FormData): Promise<void> {
  const periodId = ((formData.get("periodId") as string | null) ?? "").trim();
  const { user, period, back } = await loadContext(periodId);

  if (!canWritePettyCashLine(user, period.account, period)) {
    fail(
      back,
      period.status === "CLOSED"
        ? "That period is closed — Finance can reopen it if a line still needs to go in."
        : "That period has been submitted to Finance — only Finance can change it now.",
    );
  }
  // A float whose holder has left is frozen: there is nobody to reconcile with.
  if (period.account.custodian.status !== "ACTIVE") {
    fail(back, "This account has no active custodian — Finance must name one before lines can be added.");
  }

  const parsed = parseAmountInput(formData.get("amount"));
  if (!parsed.ok) fail(back, parsed.error);

  const datePaid = parseDate(formData.get("datePaid"));
  if (!datePaid) fail(back, "Enter the date you paid.");

  const sectionId = ((formData.get("sectionId") as string | null) ?? "").trim();
  if (!sectionId) fail(back, "Choose a section.");
  const section = await prisma.expenseSection.findUnique({
    where: { id: sectionId },
  });
  if (!section || section.archivedAt) fail(back, "That section is no longer available — pick another.");

  const categoryId = ((formData.get("categoryId") as string | null) ?? "").trim() || null;
  if (categoryId) {
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category || category.archivedAt)
      fail(back, "That category is no longer available — pick another.");
  }

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) fail(back, "Say what the money was spent on.");
  if (description.length > 500) fail(back, "That description is too long — 500 characters at most.");

  const method =
    (formData.get("method") as string | null) === "COMPANY_TRANSFER" ? "COMPANY_TRANSFER" : "FLOAT";
  const paymentDetails =
    ((formData.get("paymentDetails") as string | null) ?? "").trim().slice(0, 200) || null;
  const payee = ((formData.get("payee") as string | null) ?? "").trim().slice(0, 200) || null;

  // Files are validated and stored BEFORE the transaction: a rejected batch must never leave
  // half its files in the blob store, and the upload is slow enough that it has no business
  // inside a row lock.
  const stored = await storeEvidenceFiles(evidenceFilesFrom(formData), {
    pathPrefix: `petty-cash/${period.accountId}`,
  });
  if (!stored.ok) fail(back, stored.error);

  try {
    await withAccountLock(period.accountId, async (tx) => {
      // Re-read the status under the lock. This is the race the lock exists for: a line must
      // never land in a period that Finance is closing at this moment.
      const fresh = await tx.pettyCashPeriod.findUnique({
        where: { id: periodId },
        select: { status: true },
      });
      if (!fresh || fresh.status === "CLOSED") {
        refuse("That period was closed while you were writing — Finance can reopen it.");
      }

      await tx.pettyCashLine.create({
        data: {
          periodId,
          datePaid,
          sectionId,
          categoryId,
          description,
          method,
          paymentDetails,
          payee,
          amount: fromPiastres(parsed.piastres),
          createdById: user.id,
          evidence: stored.files.length
            ? {
                create: stored.files.map((f) => ({
                  ...f,
                  uploadedById: user.id,
                })),
              }
            : undefined,
        },
      });
    });
  } catch (e) {
    if (isRefusal(e)) fail(back, e.reason);
    throw e;
  }

  revalidatePath(back);
  revalidatePath("/petty-cash");
  redirect(`${back}?ok=${q("Spend logged.")}`);
}

export async function editLine(formData: FormData): Promise<void> {
  const lineId = ((formData.get("lineId") as string | null) ?? "").trim();
  const line = await prisma.pettyCashLine.findUnique({
    where: { id: lineId },
    select: { periodId: true },
  });
  if (!line) redirect("/petty-cash");

  const { user, period, back } = await loadContext(line.periodId);

  if (!canWritePettyCashLine(user, period.account, period)) {
    fail(
      back,
      period.status === "CLOSED"
        ? "That period is closed — its amounts can't change. Finance can reopen it."
        : "That period has been submitted to Finance — only Finance can change it now.",
    );
  }

  const parsed = parseAmountInput(formData.get("amount"));
  if (!parsed.ok) fail(back, parsed.error);

  const datePaid = parseDate(formData.get("datePaid"));
  if (!datePaid) fail(back, "Enter the date you paid.");

  const description = ((formData.get("description") as string | null) ?? "").trim();
  if (!description) fail(back, "Say what the money was spent on.");

  const sectionId = ((formData.get("sectionId") as string | null) ?? "").trim();
  if (!sectionId) fail(back, "Choose a section.");

  const categoryId = ((formData.get("categoryId") as string | null) ?? "").trim() || null;
  const method =
    (formData.get("method") as string | null) === "COMPANY_TRANSFER" ? "COMPANY_TRANSFER" : "FLOAT";

  try {
    await withAccountLock(period.accountId, async (tx) => {
      const fresh = await tx.pettyCashPeriod.findUnique({
        where: { id: line.periodId },
        select: { status: true },
      });
      if (!fresh || fresh.status === "CLOSED") {
        refuse("That period was closed while you were editing — Finance can reopen it.");
      }
      await tx.pettyCashLine.update({
        where: { id: lineId },
        data: {
          datePaid,
          sectionId,
          categoryId,
          description,
          method,
          paymentDetails:
            ((formData.get("paymentDetails") as string | null) ?? "").trim().slice(0, 200) || null,
          payee: ((formData.get("payee") as string | null) ?? "").trim().slice(0, 200) || null,
          amount: fromPiastres(parsed.piastres),
        },
      });
    });
  } catch (e) {
    if (isRefusal(e)) fail(back, e.reason);
    throw e;
  }

  revalidatePath(back);
  redirect(`${back}?ok=${q("Line updated.")}`);
}

/**
 * Delete a line — recording what it said. A ledger where a row can simply vanish is not a
 * ledger, and "who deleted the 9,200 Eid giveaways line" is exactly the question that gets
 * asked six months later.
 */
export async function deleteLine(formData: FormData): Promise<void> {
  const lineId = ((formData.get("lineId") as string | null) ?? "").trim();
  const line = await prisma.pettyCashLine.findUnique({
    where: { id: lineId },
    select: {
      id: true,
      periodId: true,
      datePaid: true,
      description: true,
      amount: true,
      method: true,
      payee: true,
      paymentDetails: true,
      section: { select: { name: true } },
      category: { select: { name: true } },
      evidence: { select: { fileName: true } },
    },
  });
  if (!line) redirect("/petty-cash");

  const { user, period, back } = await loadContext(line.periodId);

  if (!canWritePettyCashLine(user, period.account, period)) {
    fail(back, "That period can no longer be changed.");
  }

  try {
    await withAccountLock(period.accountId, async (tx) => {
      const fresh = await tx.pettyCashPeriod.findUnique({
        where: { id: line.periodId },
        select: { status: true },
      });
      if (!fresh || fresh.status === "CLOSED") refuse("That period was closed while you were working.");

      await tx.pettyCashLineDeletion.create({
        data: {
          periodId: line.periodId,
          deletedById: user.id,
          snapshot: {
            datePaid: line.datePaid.toISOString(),
            description: line.description,
            amount: line.amount.toString(),
            method: line.method,
            section: line.section.name,
            category: line.category?.name ?? null,
            payee: line.payee,
            paymentDetails: line.paymentDetails,
            evidence: line.evidence.map((e) => e.fileName),
          },
        },
      });
      // Evidence rows cascade with the line.
      await tx.pettyCashLine.delete({ where: { id: lineId } });
    });
  } catch (e) {
    if (isRefusal(e)) fail(back, e.reason);
    throw e;
  }

  revalidatePath(back);
  redirect(`${back}?ok=${q("Line removed. What it said has been kept in the record.")}`);
}

// ─── Evidence ──────────────────────────────────────────────────────────────

/**
 * Attach a receipt. Deliberately allowed on a CLOSED period's line: a receipt that surfaces in
 * October for a September purchase changes no figure, and refusing it would mean the ledger
 * stays permanently short of the proof it exists to hold.
 */
export async function addEvidence(formData: FormData): Promise<void> {
  const lineId = ((formData.get("lineId") as string | null) ?? "").trim();
  const line = await prisma.pettyCashLine.findUnique({
    where: { id: lineId },
    select: { periodId: true, _count: { select: { evidence: true } } },
  });
  if (!line) redirect("/petty-cash");

  const { user, period, back } = await loadContext(line.periodId);

  const stored = await storeEvidenceFiles(evidenceFilesFrom(formData), {
    pathPrefix: `petty-cash/${period.accountId}`,
    required: true,
  });
  if (!stored.ok) fail(back, stored.error);

  await prisma.expenseEvidence.createMany({
    data: stored.files.map((f) => ({
      ...f,
      pettyCashLineId: lineId,
      uploadedById: user.id,
    })),
  });

  revalidatePath(back);
  redirect(`${back}?ok=${q("Receipt attached.")}`);
}

/** Remove a receipt — never from a closed period, where it is part of what was signed off. */
export async function removeEvidence(formData: FormData): Promise<void> {
  const evidenceId = ((formData.get("evidenceId") as string | null) ?? "").trim();
  const evidence = await prisma.expenseEvidence.findUnique({
    where: { id: evidenceId },
    select: { pettyCashLine: { select: { periodId: true } } },
  });
  if (!evidence?.pettyCashLine) redirect("/petty-cash");

  const { user, period, back } = await loadContext(evidence.pettyCashLine.periodId);

  if (period.status === "CLOSED") {
    fail(back, "That period is closed — its receipts are part of what was signed off.");
  }
  if (!canWritePettyCashLine(user, period.account, period)) {
    fail(back, "That period has been submitted to Finance — only Finance can change it now.");
  }

  await prisma.expenseEvidence.delete({ where: { id: evidenceId } });
  revalidatePath(back);
  redirect(`${back}?ok=${q("Receipt removed.")}`);
}

// ─── Handing the period over ───────────────────────────────────────────────

/**
 * The custodian hands the period to Finance. After this they can still see everything but no
 * longer write — a period whose author can change it underneath the reviewer was never handed
 * over at all.
 */
export async function submitPeriod(formData: FormData): Promise<void> {
  const periodId = ((formData.get("periodId") as string | null) ?? "").trim();
  const { user, period, back } = await loadContext(periodId);

  const isCustodian = period.account.custodianId === user.id;
  if (!isCustodian && !canManagePettyCash(user.role)) redirect("/dashboard");
  if (period.status !== "OPEN") fail(back, "That period isn't open.");

  await prisma.pettyCashPeriod.update({
    where: { id: periodId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedById: user.id,
    },
  });

  revalidatePath(back);
  revalidatePath("/petty-cash");
  redirect(`${back}?ok=${q("Sent to Finance for review.")}`);
}
