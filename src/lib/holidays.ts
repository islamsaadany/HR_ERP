// Public-holiday reads (spec 035, evolved by spec 037). Server-only (prisma); the pure
// counting math lives in lib/workdays.ts and the pure break math in lib/timeoff/breaks.ts,
// so the client form preview and the announcement drafter share them without touching the DB.

import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/workdays";
import { addDays } from "@/lib/timeoff/breaks";

/** Every yyyy-mm-dd day covered by a holiday's actual range (inclusive both ends). */
export function expandRange(start: Date, end: Date): string[] {
  const days: string[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  // Guard a reversed range rather than looping forever — the actions reject those, but a
  // hand-edited row must not be able to hang a page render.
  while (cursor.getTime() <= last && days.length < 400) {
    days.push(dayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * The listed holiday dates as yyyy-mm-dd keys — the shape `countWorkingDays` consumes.
 * Built from the ACTUAL range (where the holiday really lands), which is what makes a move
 * re-count every request immediately: nothing is cached, so the next render tells the truth.
 *
 * Guarded so a pre-migration DB (no 057 yet) degrades to "no holidays" instead of breaking
 * every time-off surface — the same posture the shell takes for campaign tables.
 */
export async function getHolidaySet(): Promise<Set<string>> {
  try {
    const rows = await prisma.publicHoliday.findMany({
      select: { actualStart: true, actualEnd: true },
    });
    const set = new Set<string>();
    for (const r of rows) for (const d of expandRange(r.actualStart, r.actualEnd)) set.add(d);
    return set;
  } catch {
    return new Set();
  }
}

/** All holidays for the admin screen, soonest first. */
export async function listHolidays() {
  try {
    return await prisma.publicHoliday.findMany({
      orderBy: { actualStart: "asc" },
      include: {
        announcements: { orderBy: { sentAt: "desc" }, take: 1 },
      },
    });
  } catch {
    return [];
  }
}

export type HolidayWithAnnouncement = Awaited<ReturnType<typeof listHolidays>>[number];

/** Today at UTC midnight — the comparison point for every "upcoming" question. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Is this holiday inside its verification window — still tentative, and near enough that HR
 * should confirm the date? Date-driven, so a day the cron missed is simply caught the next
 * run rather than skipped (spec 037 edge case).
 */
export function needsVerification(
  h: { status: string; actualStart: Date },
  leadDays: number,
  today = todayUtc()
): boolean {
  if (h.status !== "TENTATIVE") return false;
  return h.actualStart.getTime() <= addDays(today, leadDays).getTime();
}

/** Has this holiday's date changed since the last announcement went out (FR-018)? */
export function announcementOutdated(h: HolidayWithAnnouncement): boolean {
  const last = h.announcements[0];
  if (!last) return false;
  return (
    last.announcedStart.getTime() !== h.actualStart.getTime() ||
    last.announcedEnd.getTime() !== h.actualEnd.getTime()
  );
}

/** Announced at its CURRENT dates — the state that makes a re-send need confirming. */
export function alreadyAnnounced(h: HolidayWithAnnouncement): boolean {
  const last = h.announcements[0];
  return !!last && !announcementOutdated(h);
}

/** Date-confirmed holidays still to come — what may be announced. */
export function isUpcoming(h: { actualEnd: Date }, today = todayUtc()): boolean {
  return h.actualEnd.getTime() >= today.getTime();
}

export function isDateConfirmed(h: { status: string }): boolean {
  return h.status === "VERIFIED" || h.status === "MOVED";
}

/**
 * The next upcoming holiday that has actually been announced — what the dashboard banner
 * shows. Read live on every render, so someone who joined after the email still sees it and
 * it disappears by itself once the holiday passes (spec 037 FR-012).
 */
export async function nextAnnouncedHoliday() {
  try {
    const rows = await prisma.publicHoliday.findMany({
      where: { actualEnd: { gte: todayUtc() }, announcements: { some: {} } },
      orderBy: { actualStart: "asc" },
      take: 1,
      include: { announcements: { orderBy: { sentAt: "desc" }, take: 1 } },
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
