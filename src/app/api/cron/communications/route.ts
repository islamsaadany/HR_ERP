import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/client";
import { getCommsSettings } from "@/lib/comms/settings";
import { pendingCountFor, prepareOccasions } from "@/lib/comms/drafts";
import { appBaseUrl } from "@/lib/email/client";

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
      to: person.email,
      subject:
        waiting === 1
          ? "A message is waiting for you to send"
          : `${waiting} messages are waiting for you to send`,
      html:
        `<div style="font-family:Helvetica,Arial,sans-serif;color:#16202e;padding:24px;">` +
        `<h2 style="margin:0 0 8px;font-size:18px;">${waiting === 1 ? "A message is waiting" : `${waiting} messages are waiting`}</h2>` +
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;">` +
        `Someone on your team has a birthday or a joining anniversary coming up. The words are ` +
        `already written — read them, change anything you like, and send.</p>` +
        (appBaseUrl
          ? `<p style="margin:0;"><a href="${appBaseUrl}/messages" style="background:#0f2444;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:8px;display:inline-block;">Open your messages</a></p>`
          : "") +
        `<p style="margin:16px 0 0;font-size:12px;color:#5f6472;">Nothing is sent until you send it.</p>` +
        `</div>`,
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
