import type { ClaimType, ClaimStatus } from "@prisma/client";

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  NONE: "Automatic",
  NOTE: "Request",
  PROOF: "Proof required",
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  PENDING: "Pending review",
  RELEASED: "Reimbursed",
  REJECTED: "Rejected",
};

export const CLAIM_STATUS_CLASS: Record<ClaimStatus, string> = {
  PENDING: "bg-gold-100 text-gold-800",
  RELEASED: "bg-navy-50 text-navy-700",
  REJECTED: "bg-red-50 text-red-700",
};

export type ClaimLite = { amount: number; status: ClaimStatus };

/** Reimbursement tracker for one benefit: reimbursed (released) + pending toward the allocation. */
export function tracker(allocated: number | null, claims: ClaimLite[]) {
  const reimbursed = claims.filter((c) => c.status === "RELEASED").reduce((s, c) => s + c.amount, 0);
  const pending = claims.filter((c) => c.status === "PENDING").reduce((s, c) => s + c.amount, 0);
  const claimed = reimbursed + pending; // counts against the allocation
  const remaining = allocated == null ? null : Math.max(0, allocated - claimed);
  return { reimbursed, pending, claimed, remaining };
}
