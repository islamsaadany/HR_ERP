/**
 * What a batch totals, and what it may become (spec 040).
 *
 * Pure: no Prisma, no I/O. These are the rules that decide who can release company money, so they
 * are testable without a database and cannot quietly fork into a second copy.
 *
 * The framing matters and is the CEO's own: he does NOT approve payments here. The bank releases
 * money on two signatures — Finance enters a transfer, he confirms it there. This module governs
 * the record of that, not the money.
 */

import { sumPiastres } from "@/lib/finance/money";

export type BatchStatus = "SENT" | "CONFIRMED" | "SENT_BACK" | "WITHDRAWN";
export type BatchAction = "confirm" | "sendBack" | "withdraw";

/**
 * The total of a batch, in piastres.
 *
 * Called ONCE, when the batch is sent, and the result is stored — the one figure in the Finance
 * module that is deliberately not derived on read. The confirmer acts on a number he was emailed,
 * possibly hours earlier; recomputing it later would let the emailed figure and the confirmed
 * figure diverge at exactly the moment that matters.
 */
export function batchTotal(items: { amountPiastres: number }[]): number {
  return sumPiastres(items.map((i) => i.amountPiastres));
}

export type Viewer = {
  id: string;
  /** Holds the confirmer appointment. NOT implied by any role — see lib/finance/confirmers.ts. */
  isConfirmer: boolean;
  /** Top-level access. The single exception to the sender/confirmer split (CEO, 2026-08-24). */
  isSuperUser: boolean;
};

export type Decision = { ok: true } | { ok: false; reason: string };

/**
 * May this person decide this batch?
 *
 * Two separate questions, deliberately kept apart:
 *   1. Is the batch still open to a decision at all?
 *   2. Is this person allowed to be the one who makes it?
 *
 * The second carries the rule nobody asked for and everybody needs: **whoever sent a batch may not
 * confirm it**. Two signatures is the entire point, and a single person holding both Finance and
 * the confirmer appointment would otherwise release money alone. The CEO ruled that top-level
 * access is the sole exception — and when it is used, the batch records the same person on both
 * halves, so it is visible rather than silent.
 */
export function canDecide(
  batch: { status: BatchStatus; sentById: string | null },
  viewer: Viewer,
): Decision {
  if (batch.status !== "SENT") {
    return { ok: false, reason: "That batch has already been decided." };
  }
  if (!viewer.isConfirmer && !viewer.isSuperUser) {
    return { ok: false, reason: "You aren't appointed to confirm transfers." };
  }
  if (batch.sentById === viewer.id && !viewer.isSuperUser) {
    return { ok: false, reason: "You sent this batch, so somebody else has to confirm it." };
  }
  return { ok: true };
}

/** The state machine, in one place. Returns null when the move isn't allowed. */
export function nextStatus(current: BatchStatus, action: BatchAction): BatchStatus | null {
  if (current !== "SENT") return null;
  switch (action) {
    case "confirm":
      return "CONFIRMED";
    case "sendBack":
      return "SENT_BACK";
    case "withdraw":
      return "WITHDRAWN";
  }
}

/**
 * Whether a batch's items are still attached to it.
 *
 * Sending back or withdrawing RELEASES the payables — the items are deleted, so each payable
 * becomes selectable again and each payback request returns to awaiting payment. Confirming keeps
 * them, because a confirmed batch is the historical record of what went to the bank.
 */
export function releasesItems(status: BatchStatus): boolean {
  return status === "SENT_BACK" || status === "WITHDRAWN";
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
    /** Salary runs count people, not transfers — the two are different numbers. */
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
  return `${n} ${n === 1 ? "transfer" : "transfers"} totalling ${formattedTotal}`;
}

/** A reference like "AUG-26-01" — readable in a bank statement and in a sentence. */
export function nextBatchReference(when: Date, sequenceThisMonth: number): string {
  const month = when.toLocaleDateString("en-GB", { month: "short" }).toUpperCase();
  const year = String(when.getFullYear()).slice(2);
  return `${month}-${year}-${String(sequenceThisMonth).padStart(2, "0")}`;
}
