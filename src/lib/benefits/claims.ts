import type { ClaimType, ClaimStatus } from "@prisma/client";

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  NONE: "Automatic",
  NOTE: "Request",
  PROOF: "Proof required",
};

// Spec 020 staged workflow labels/colors (navy/gold, signed off).
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  // Spec 040: Finance has created the transaction in the bank; it is waiting on the confirmation
  // there. Deliberately not "paid" — until the bank releases it, nobody has been.
  PAYMENT_SUBMITTED: "At the bank",
  REIMBURSED: "Reimbursed",
  REJECTED: "Rejected",
};

export const CLAIM_STATUS_CLASS: Record<ClaimStatus, string> = {
  SUBMITTED: "bg-gold-100 text-gold-800",
  APPROVED: "bg-navy-100 text-navy-800",
  // Gold: somebody still has to act. Green is reserved for done, and this is not done.
  PAYMENT_SUBMITTED: "bg-gold-100 text-gold-800",
  REIMBURSED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
};

export type ClaimLite = { amount: number; status: ClaimStatus };

/** Paid statuses. */
export const REIMBURSED_STATUSES: ClaimStatus[] = ["REIMBURSED"];
/**
 * In-progress statuses that still consume allowance.
 *
 * `PAYMENT_SUBMITTED` (spec 041) belongs here, and getting it wrong would have been expensive:
 * a claim sitting at the bank is committed money, and leaving it out of both this list and
 * `REIMBURSED_STATUSES` would have shown the employee allowance they had already spent. The
 * server-side pool rules ask for `status: { not: "REJECTED" }` and so were never at risk — this
 * per-benefit tracker enumerates, which is exactly why the enumeration has to be maintained.
 */
export const IN_PROGRESS_STATUSES: ClaimStatus[] = ["SUBMITTED", "APPROVED", "PAYMENT_SUBMITTED"];

/**
 * Reimbursement tracker for one benefit. Every non-rejected claim consumes the
 * allocation: paid (reimbursed) + in-progress (submitted/approved). Rejected claims
 * free their allowance.
 */
export function tracker(allocated: number | null, claims: ClaimLite[]) {
  const reimbursed = claims
    .filter((c) => REIMBURSED_STATUSES.includes(c.status))
    .reduce((s, c) => s + c.amount, 0);
  const pending = claims
    .filter((c) => IN_PROGRESS_STATUSES.includes(c.status))
    .reduce((s, c) => s + c.amount, 0);
  const claimed = reimbursed + pending; // counts against the allocation (all non-rejected)
  const remaining = allocated == null ? null : Math.max(0, allocated - claimed);
  return { reimbursed, pending, claimed, remaining };
}
