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

// Day counting moved to lib/workdays.ts (spec 035): every shown/stored count is WORKING
// days (Fri/Sat + public holidays excluded). The old calendar-day `dayCount` was removed
// so nothing can accidentally count a weekend again.

/** Do two date ranges overlap (inclusive)? */
export function overlaps(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
