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
  REIMBURSED: "Reimbursed",
  REJECTED: "Rejected",
};

export const CLAIM_STATUS_CLASS: Record<ClaimStatus, string> = {
  SUBMITTED: "bg-gold-100 text-gold-800",
  APPROVED: "bg-navy-100 text-navy-800",
  REIMBURSED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-700",
};

export type ClaimLite = { amount: number; status: ClaimStatus };

/** Paid statuses. */
export const REIMBURSED_STATUSES: ClaimStatus[] = ["REIMBURSED"];
/** In-progress statuses that still consume allowance. */
export const IN_PROGRESS_STATUSES: ClaimStatus[] = ["SUBMITTED", "APPROVED"];

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
