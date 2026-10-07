import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/client";
import { congratulationsWaiting } from "@/lib/email/templates";
import { getCommsSettings } from "@/lib/comms/settings";
import { pendingCountFor, prepareOccasions } from "@/lib/comms/drafts";

export const dynamic = "force-dynamic";

/**
 * The daily communications job (spec 039 US2) — this app's SECOND scheduled job, wired in
 * `vercel.json`.
 *
 * IT HAS EXACTLY TWO POWERS, and neither of them reaches an employee:
 *   1. write congratulation DRAFTS for birthdays and joining anniversaries coming up;
 *   2. nudge the person each draft is waiting on, as an operator.
 *
 * IT NEVER EMAILS AN EMPLOYEE. Every message that reaches somebody is the result of a human
 * reading the words and pressing send. That is the line spec 037 drew for the holidays job and it
 * is not crossed here — it is also asserted directly in `scripts/verify-communications.mts`,
 * rather than left as an intention.
 *
 * A SEPARATE ROUTE from the holidays cron, deliberately: two unrelated jobs should fail
 * independently. A holiday API outage must not stop birthdays being prepared.
 *
 * Work is chosen BY DATE, not by "did yesterday's run happen": a day the platform was unreachable
 * is caught by the next run rather than skipped. Idempotence is the database's, not this
 * function's — `Occasion` is unique on (userId, kind, occasionYear).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  // Refuse when unconfigured too: an open endpoint that writes drafts and emails managers is not
  // a safe default.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await getCommsSettings();
  const today = new Date();

  const summary = await prepareOccasions(today, settings.congratsLeadDays);

  // One nudge per assignee, listing what is waiting — not one per draft. A manager with three
  // birthdays this week gets one email, because three would train them to ignore all of them.
  const assignees = await prisma.message.findMany({
    where: { state: "DRAFT", kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
    distinct: ["assignedToId"],
    select: { assignedTo: { select: { id: true, name: true, email: true } } },
  });

  let nudged = 0;
  for (const row of assignees) {
    const person = row.assignedTo;
    if (!person?.email) continue;
    const waiting = await pendingCountFor(person.id);
    if (waiting === 0) continue;

    // Fire-and-forget, like every other operator notification here: a mail failure must never stop
    // the rest of the run. The in-app count is the guaranteed channel; this is the courtesy.
    await sendEmail({
      kind: "comms.nudge",
      to: person.email,
      ...congratulationsWaiting({ waiting }),
    });
    nudged += 1;
  }

  return NextResponse.json({
    ok: true,
    leadDays: settings.congratsLeadDays,
    ...summary,
    nudged,
    // Stated in the response so anybody reading the function log can see it, not just infer it.
    employeesEmailed: 0,
  });
}
