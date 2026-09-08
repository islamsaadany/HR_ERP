// Server-side leave queries and guards (spec 035). Kept out of the "use server" action
// file (queries taking a user id must not be callable endpoints) and out of lib/leave.ts
// (which stays pure/client-safe).

import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin, isSuperUser } from "@/lib/roles";
import { takenInYear } from "@/lib/workdays";

/**
 * PENDING requests the given user may decide, resolved against the CURRENT org chart
 * (spec 035, FR-007) — not the approver snapshot stored at submission:
 *  - their ACTIVE direct reports' requests, always;
 *  - for a Super User: requests from anyone with no active manager (the fallback pool —
 *    every Super User sees them, rather than one arbitrarily picked at submission).
 * Requests from people who have left are excluded everywhere (they get auto-closed).
 */
export function pendingApprovalWhere(me: { id: string; role?: Role }): Prisma.LeaveRequestWhereInput {
  const orphaned: Prisma.LeaveRequestWhereInput = {
    user: {
      status: "ACTIVE",
      OR: [{ reportsToId: null }, { reportsTo: { status: { not: "ACTIVE" } } }],
    },
  };
  return {
    status: "PENDING",
    OR: [
      { user: { status: "ACTIVE", reportsToId: me.id } },
      ...(isSuperUser(me.role) ? [orphaned] : []),
    ],
  };
}

/**
 * Who should be TOLD about a new request from this person — the inverse of
 * `pendingApprovalWhere` (2026-09-08): the people in whose queue the request appears the
 * moment it is written. Their active direct manager; failing that, every active Super User
 * (the fallback pool — all of them see it, so all of them hear about it), never the requester.
 *
 * Kept next to the queue rule on purpose: an email that reaches somebody whose queue is empty,
 * or misses the person whose queue just grew, is worse than no email. Change one, change both.
 */
export async function leaveApproversFor(
  requesterId: string
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  const select = { id: true, name: true, email: true } as const;
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { reportsTo: { select: { ...select, status: true } } },
  });
  const manager = requester?.reportsTo;
  if (manager?.status === "ACTIVE") {
    return [{ id: manager.id, name: manager.name, email: manager.email }];
  }
  return prisma.user.findMany({
    where: { role: "SUPER_USER", status: "ACTIVE", NOT: { id: requesterId } },
    select,
    orderBy: { name: "asc" },
  });
}

/**
 * May `me` decide this pending request? The CURRENT direct manager of the requester may;
 * HR Admin / Super User may as the fallback (spec 005 FR-013, unchanged). The approver
 * snapshot on the row is history, never authority.
 */
export async function canDecideLeave(
  me: { id: string; role?: Role },
  requesterId: string
): Promise<boolean> {
  if (isAdmin(me.role)) return true;
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { reportsToId: true, reportsTo: { select: { status: true } } },
  });
  return requester?.reportsToId === me.id && requester.reportsTo?.status === "ACTIVE";
}

/**
 * Close pending requests of people who have left (spec 035, FR-008). Idempotent sweep,
 * run on time-off page loads — the same reconcile-on-read pattern as medical recoveries,
 * so every write path that marks someone Left is covered without hooking them all.
 */
export async function closeLeaverPending(): Promise<void> {
  try {
    await prisma.leaveRequest.updateMany({
      where: { status: "PENDING", user: { status: { not: "ACTIVE" } } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
  } catch {
    // pre-migration DB (no cancelledAt) — leave the requests be until 055 lands
  }
}

/**
 * Approved working days taken per user for one calendar year, in bulk (admin table) —
 * derived live from approved requests + the current holiday list, never stored.
 */
export async function takenByUserForYear(
  year: number,
  holidays: ReadonlySet<string>
): Promise<Map<string, number>> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const approved = await prisma.leaveRequest.findMany({
    where: { status: "APPROVED", startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
    select: { userId: true, startDate: true, endDate: true },
  });
  const byUser = new Map<string, { startDate: Date; endDate: Date }[]>();
  for (const r of approved) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }
  const totals = new Map<string, number>();
  for (const [userId, list] of byUser) totals.set(userId, takenInYear(list, year, holidays));
  return totals;
}

/** The nav badge total for one user: unseen decisions + pending approvals awaiting them. */
export async function timeOffBadgeCount(me: { id: string; role?: Role }): Promise<number> {
  const [unseen, approvals] = await Promise.all([
    prisma.leaveRequest.count({
      where: { userId: me.id, status: { in: ["APPROVED", "DECLINED"] }, decisionSeenAt: null },
    }),
    prisma.leaveRequest.count({ where: pendingApprovalWhere(me) }),
  ]);
  return unseen + approvals;
}
