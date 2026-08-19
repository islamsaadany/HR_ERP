import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { holidayVerificationReminder } from "@/lib/email/templates";
import { todayUtc } from "@/lib/holidays";
import { addDays } from "@/lib/timeoff/breaks";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

/**
 * The daily holidays check (spec 037, FR-006) — this app's first scheduled job, wired in
 * `vercel.json` to run once a day.
 *
 * It has exactly one power: nudge HR to confirm a tentative holiday's date before it
 * arrives. It NEVER emails employees — every team announcement is reviewed and sent by a
 * human, so nothing here can reach the company.
 *
 * The work is chosen by DATE, not by "did yesterday's run happen": a day the platform was
 * unreachable is caught by the next run rather than skipped. `reminderSentAt` is what keeps
 * it to one reminder per holiday, and it is stamped whether or not email is configured —
 * the in-app flag on the admin screen is the guaranteed channel, email is the courtesy.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // Refuse when unconfigured too: an open endpoint that emails HR is not a safe default.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getNotificationSettings();
  const today = todayUtc();
  const windowEnd = addDays(today, settings.verificationLeadDays);

  let due: {
    id: string;
    name: string;
    originalStart: Date;
    originalEnd: Date;
    actualStart: Date;
    actualEnd: Date;
  }[] = [];
  try {
    due = await prisma.publicHoliday.findMany({
      where: {
        status: "TENTATIVE",
        reminderSentAt: null,
        // Inside the window, and not already in the past.
        actualStart: { lte: windowEnd },
        actualEnd: { gte: today },
      },
      orderBy: { actualStart: "asc" },
      select: {
        id: true,
        name: true,
        originalStart: true,
        originalEnd: true,
        actualStart: true,
        actualEnd: true,
      },
    });
  } catch {
    // Pre-migration database (no 057 yet) — nothing to do, and not an error worth alerting on.
    return NextResponse.json({ reminded: 0, skipped: "holidays table not migrated" });
  }

  const range = (s: Date, e: Date) =>
    s.getTime() === e.getTime() ? formatDate(s) : `${formatDate(s)} → ${formatDate(e)}`;

  let reminded = 0;
  for (const h of due) {
    const daysAway = Math.max(
      0,
      Math.round((h.actualStart.getTime() - today.getTime()) / 86_400_000)
    );
    // Stamp FIRST: if the send throws (it can't — sendEmail swallows — but if this route is
    // ever retried mid-loop), the reminder must not be able to go out twice.
    await prisma.publicHoliday.update({ where: { id: h.id }, data: { reminderSentAt: new Date() } });
    reminded += 1;
    await sendEmail({
      to: settings.hrInbox,
      ...holidayVerificationReminder({
        holidayName: h.name,
        announced: range(h.originalStart, h.originalEnd),
        observed: range(h.actualStart, h.actualEnd),
        daysAway,
      }),
    });
  }

  return NextResponse.json({ reminded });
}
