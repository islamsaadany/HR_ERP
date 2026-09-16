import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { getLearningSettings } from "@/lib/learning/settings";
import { overdueNow } from "@/lib/learning/overdue";
import { daysOverdue, isReminderDay, REMINDER_LAST_DAY } from "@/lib/learning/deadlines";
import { sendEmail, sendReportedEmail } from "@/lib/email/client";
import { learningOverdue, learningOverdueManager } from "@/lib/email/templates";
import { formatDate } from "@/lib/labels";
import { canManageLearning } from "@/lib/learning/managers";

/**
 * The daily learning nudge (spec 043) — the FOURTH cron, and the first scheduled job in this
 * platform that emails an EMPLOYEE.
 *
 * That reverses a clause the constitution marked NON-NEGOTIABLE, which it now permits under
 * conditions. Every one of those conditions is in this file, and none of them is a comment:
 *
 *   BOUNDED          `isReminderDay` — day 0, then weekly for four weeks. At most five.
 *   NOT CONFIGURABLE the schedule is a const in `deadlines.ts`. There is no column to widen.
 *   NEVER TWICE      `LearningReminderLog` unique on (user, course, day). A second run today
 *                    hits the constraint and sends nothing.
 *   FIRE-AND-FORGET  one failure is caught and the sweep continues; nothing is blocked.
 *   NEVER A FALSE    the log row is written only AFTER a successful send, so a failed send is
 *   SUCCESS          retried tomorrow rather than silently marked delivered.
 *   STOPS WHEN MET   completion removes the person from `overdueNow`. No event to miss.
 *   TWO SWITCHES     the platform master toggle AND Learning's own. Both must be on; Learning's
 *                    can only ever narrow.
 *
 * What it must NEVER become is a broadcast. It reminds ONE person about ONE obligation that is
 * THEIRS. A company-wide message is still written and sent by a human.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // BOTH switches. Learning's own may silence what the platform allows; it may never enable what
  // the platform has disabled, which is why this is an AND and not an OR.
  const [platform, learning] = await Promise.all([
    getNotificationSettings(),
    getLearningSettings(),
  ]);
  if (!platform.emailEnabled || !learning.deadlineRemindersEnabled) {
    return NextResponse.json({
      ok: true,
      skipped: !platform.emailEnabled ? "platform-email-off" : "learning-reminders-off",
    });
  }

  const now = new Date();
  const overdue = await overdueNow(now);
  if (overdue.length === 0) return NextResponse.json({ ok: true, overdue: 0, emailed: 0 });

  // Only the ones whose day is ON the schedule. A job that missed a day does NOT catch up: a
  // week's outage must not produce five emails in one morning.
  const dueToday = overdue.filter((row) => isReminderDay(daysOverdue(row.due, now)));
  if (dueToday.length === 0) {
    return NextResponse.json({ ok: true, overdue: overdue.length, emailed: 0 });
  }

  const managerIds = [...new Set(dueToday.map((r) => r.managerId).filter((id): id is string => !!id))];
  const managers = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: managerIds }, status: "ACTIVE" },
        select: { id: true, name: true, email: true },
      })
    ).map((m) => [m.id, m])
  );

  // Somebody with no manager is still chased; the notice meant for a manager goes to whoever runs
  // Learning instead, rather than to nobody (spec 043 edge cases).
  const fallback = await learningFallbackRecipients();

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let emailed = 0;
  let alreadySent = 0;

  for (const row of dueToday) {
    // Claim the day BEFORE sending: two concurrent runs cannot both get past this.
    try {
      await prisma.learningReminderLog.create({
        data: { userId: row.userId, courseId: row.courseId, sentOn: today },
      });
    } catch {
      alreadySent++;
      continue;
    }

    const late = daysOverdue(row.due, now);
    const message = learningOverdue({
      name: row.userName,
      courseTitle: row.courseTitle,
      trackName: row.trackName,
      due: formatDate(row.due),
      daysOverdue: late,
      finalReminder: late === REMINDER_LAST_DAY,
    });

    // REPORTED, not fire-and-forget, and this is the one place in the feature where that matters:
    // the log row means "this person was told today", so writing it after a send that did not
    // happen would silently cost them the reminder with nothing to show it. `sendEmail` swallows
    // failures by design — correct where a state change must not be blocked by mail, wrong where
    // the record's meaning depends on the send.
    const result = await sendReportedEmail({ to: row.userEmail, ...message });
    if (!result.ok) {
      // The claim must not stand for a send that did not happen: released, so tomorrow's run can
      // try again rather than treating today as done.
      await releaseClaim(row.userId, row.courseId, today);
      console.error("[cron/learning] reminder not sent (will retry):", result.error);
      continue;
    }
    emailed++;

    const manager = row.managerId ? managers.get(row.managerId) : undefined;
    const recipients = manager ? [{ name: manager.name, email: manager.email }] : fallback;
    for (const recipient of recipients) {
      try {
        await sendEmail({
          to: recipient.email,
          ...learningOverdueManager({
            managerName: recipient.name,
            learnerName: row.userName,
            courseTitle: row.courseTitle,
            trackName: row.trackName,
            due: formatDate(row.due),
            daysOverdue: late,
          }),
        });
      } catch {
        // Fire-and-forget: the learner has been told, which is the part that matters, and one
        // manager's mail failing must not stop the sweep.
      }
    }
  }

  return NextResponse.json({
    ok: true,
    overdue: overdue.length,
    dueToday: dueToday.length,
    emailed,
    alreadySent,
  });
}

async function releaseClaim(userId: string, courseId: string, sentOn: Date) {
  await prisma.learningReminderLog
    .deleteMany({ where: { userId, courseId, sentOn } })
    .catch(() => undefined);
}

/** Whoever runs Learning — the stand-in when somebody has no manager to tell. */
async function learningFallbackRecipients() {
  const candidates = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, email: true, role: true },
  });
  const out: { name: string; email: string }[] = [];
  for (const person of candidates) {
    if (await canManageLearning(person)) out.push({ name: person.name, email: person.email });
  }
  return out;
}
