// Public-holiday reads (spec 035). Server-only (prisma); the pure counting math lives
// in lib/workdays.ts so the client form preview can share it without touching the DB.

import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/workdays";

/**
 * The listed holiday dates as yyyy-mm-dd keys — the shape `countWorkingDays` consumes.
 * Guarded so a pre-migration DB (no PublicHoliday table yet) degrades to "no holidays"
 * instead of breaking every time-off surface — the same posture the shell takes for
 * campaign tables.
 */
export async function getHolidaySet(): Promise<Set<string>> {
  try {
    const rows = await prisma.publicHoliday.findMany({ select: { date: true } });
    return new Set(rows.map((r) => dayKey(r.date)));
  } catch {
    return new Set();
  }
}

/** All holidays for the admin screen, soonest first. */
export async function listHolidays() {
  try {
    return await prisma.publicHoliday.findMany({ orderBy: { date: "asc" } });
  } catch {
    return [];
  }
}
