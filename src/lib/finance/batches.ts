/**
 * What a submission totals, and what it may become (spec 041).
 *
 * Pure: no Prisma, no I/O. These rules decide who can mark company money as released, so they are
 * testable without a database and cannot quietly fork into a second copy.
 *
 * THE WORDS ARE THE CEO'S OWN (2026-08-24), and two earlier drafts got them wrong:
 *   • Finance CREATES the transaction in the bank — it does not "send" anything there.
 *   • He CONFIRMS it in the bank, then marks it COMPLETE here — he does not "approve" it.
 *   • The UI never says "batch". Screens say "3 transactions". `PaymentBatch` is internal
 *     shorthand for the transactions Finance created in one sitting.
 * Nothing in this module releases money. The bank does that, on two signatures.
 */

import { sumPiastres } from "@/lib/finance/money";

export type BatchStatus = "SUBMITTED" | "COMPLETE" | "RETURNED" | "WITHDRAWN";
export type BatchAction = "complete" | "returnToFinance" | "withdraw";

/**
 * The total of a submission, in piastres.
 *
 * Called ONCE, at submission, and the result is stored — the one figure in the Finance module
 * deliberately not derived on read. The confirmer acts on a number he was emailed, possibly hours
 * earlier; recomputing it later would let the emailed figure and the confirmed figure diverge at
 * exactly the moment that matters.
 */
export function batchTotal(items: { amountPiastres: number }[]): number {
  return sumPiastres(items.map((i) => i.amountPiastres));
}

export type Viewer = {
  id: string;
  /**
   * The business units this person is appointed to confirm for. NOT implied by any role — see
   * lib/finance/confirmers.ts. An empty list confirms nothing.
   */
  confirmableUnitIds: string[];
  /** Top-level access. The single exception to the submitter/confirmer split (CEO, 2026-08-24). */
  isSuperUser: boolean;
};

export type Decision = { ok: true } | { ok: false; reason: string };

/**
 * May this person decide these transactions?
 *
 * Two separate questions, deliberately kept apart:
 *   1. Are they still open to a decision at all?
 *   2. Is this person allowed to be the one who makes it?
 *
 * The second carries the rule nobody asked for and everybody needs: **whoever created the
 * transactions in the bank may not also confirm them**. Two signatures is the entire point, and a
 * single person holding both Finance and the confirmer appointment would otherwise release money
 * alone. The CEO ruled that top-level access is the sole exception — and when it is used, the
 * record shows the same person on both halves, so it is visible rather than silent.
 *
 * And since 2026-08-25 the appointment is per BUSINESS UNIT, so "are they allowed" is asked about
 * this transaction's unit and not about the company. Being appointed for Marketing does not let
 * you confirm money leaving another unit's account — that is the whole of what the CEO asked for,
 * and it is enforced here rather than only in the query that builds the queue, because a screen
 * that merely omits something is not a control.
 */
export function canDecide(
  batch: { status: BatchStatus; submittedById: string | null; businessUnitId: string },
  viewer: Viewer,
): Decision {
  if (batch.status !== "SUBMITTED") {
    return { ok: false, reason: "That has already been dealt with." };
  }
  if (!viewer.confirmableUnitIds.includes(batch.businessUnitId) && !viewer.isSuperUser) {
    return { ok: false, reason: "You aren't appointed to confirm this business unit's transactions." };
  }
  if (batch.submittedById === viewer.id && !viewer.isSuperUser) {
    return { ok: false, reason: "You created these in the bank, so somebody else has to confirm them." };
  }
  return { ok: true };
}

/** The state machine, in one place. Returns null when the move isn't allowed. */
export function nextStatus(current: BatchStatus, action: BatchAction): BatchStatus | null {
  if (current !== "SUBMITTED") return null;
  switch (action) {
    case "complete":
      return "COMPLETE";
    case "returnToFinance":
      return "RETURNED";
    case "withdraw":
      return "WITHDRAWN";
  }
}

/**
 * Whether the payables are still attached.
 *
 * Returning to Finance or withdrawing RELEASES them — the items are deleted, so each payable
 * becomes selectable again and each payback request goes back to awaiting payment. Completing
 * keeps them, because a completed record is the history of what actually moved.
 */
export function releasesItems(status: BatchStatus): boolean {
  return status === "RETURNED" || status === "WITHDRAWN";
}

/**
 * The one-line summary used on screen and in the email subject. Built here so the wording cannot
 * drift between the two — and deliberately free of payee names, because it is used in email.
 */
export function describeBatch(
  batch: {
    type: "EXPENSES" | "SALARY";
    itemCount: number;
    salaryMonth?: Date | null;
    /** Salary runs count people, not transactions — the two are different numbers. */
    headcount?: number | null;
  },
  formattedTotal: string,
): string {
  if (batch.type === "SALARY") {
    const month = batch.salaryMonth
      ? batch.salaryMonth.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : "a month";
    const n = batch.headcount ?? 0;
    const people = n === 1 ? "1 person" : `${n} people`;
    return `Salaries for ${month} — ${formattedTotal} covering ${people}`;
  }
  const n = batch.itemCount;
  // "3 transactions", never "batch" — the CEO's wording (2026-08-24): the group has no collective
  // noun on screen, it is simply how many transactions there are.
  return `${n} ${n === 1 ? "transaction" : "transactions"} totalling ${formattedTotal}`;
}

/**
 * Whether a set of payables may go into ONE submission (2026-08-25).
 *
 * A submission is one transaction in one bank account, so everything in it must belong to the same
 * business unit — and to a unit at all. The screen already makes mixing impossible by never
 * putting two units in one list; this is the server's own check, because a form can be posted by
 * hand and "the UI doesn't offer it" has never been a control.
 */
export function sameBusinessUnit(
  items: { businessUnitId: string | null }[],
  expected: string,
): Decision {
  if (items.length === 0) return { ok: false, reason: "Nothing selected." };
  for (const item of items) {
    if (item.businessUnitId === null) {
      return {
        ok: false,
        reason: "Somebody in that list has no business unit set, so there is no account to pay them from.",
      };
    }
    if (item.businessUnitId !== expected) {
      return {
        ok: false,
        reason: "Those belong to more than one business unit. Each unit is sent separately, because each has its own account.",
      };
    }
  }
  return { ok: true };
}

/** A reference like "AUG-26-01" — readable in a bank statement and in a sentence. */
export function nextBatchReference(when: Date, sequenceThisMonth: number): string {
  const month = when.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
  const year = String(when.getFullYear()).slice(2);
  return `${month}-${year}-${String(sequenceThisMonth).padStart(2, "0")}`;
}
