import type { LeaveStatus } from "@prisma/client";

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export const LEAVE_STATUS_CLASS: Record<LeaveStatus, string> = {
  PENDING: "bg-gold-100 text-gold-800",
  APPROVED: "bg-navy-50 text-navy-700",
  DECLINED: "bg-red-50 text-red-700",
  CANCELLED: "bg-gray-100 text-muted",
};

/** Inclusive full-day count between two dates. */
export function dayCount(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
}

/** Do two date ranges overlap (inclusive)? */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
