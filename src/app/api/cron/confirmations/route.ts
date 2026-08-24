import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eligibleConfirmers } from "@/lib/finance/confirmers";
import { getNotificationSettings } from "@/lib/notifications/settings";
import { sendEmail } from "@/lib/email/client";
import { confirmationReminder } from "@/lib/email/templates";
import { formatEGP2 } from "@/lib/labels";
import { toPiastres, fromPiastres, sumPiastres } from "@/lib/finance/money";

/**
 * The daily nudge (spec 041): anything still waiting for confirmation beyond the configured lead.
 *
 * Transactions sitting unconfirmed are money that has not moved and somebody who has not been
 * paid, with nobody watching. This is the only thing in the feature that speaks without being
 * asked.
 *
 * It may email APPOINTED CONFIRMERS and nobody else — never the people being paid, never staff at
 * large. That widens the constitution's scheduled-work audience by one named group, recorded with
 * the code, and leaves the hard part untouched.
 *
 * One row per reminder is logged, so a job that runs twice in a day cannot send twice.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const settings = await getNotificationSettings();
  const leadDays = settings.verificationLeadDays > 0 ? settings.verificationLeadDays : 14;
  // The confirmation nudge is a different rhythm from the holiday one: a transfer waiting two
  // weeks is a person waiting two weeks. Cap it low regardless of the holiday lead.
  const lead = Math.min(leadDays, 2);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lead);

  const waiting = await prisma.paymentBatch.findMany({
    where: { status: "SUBMITTED", submittedAt: { lte: cutoff } },
    select: { id: true, totalAmount: true, submittedAt: true },
  });
  if (waiting.length === 0) {
    return NextResponse.json({ ok: true, waiting: 0, emailed: 0 });
  }

  const confirmers = await eligibleConfirmers();
  if (confirmers.length === 0) {
    return NextResponse.json({ ok: true, waiting: waiting.length, emailed: 0, note: "nobody appointed" });
  }

  const total = formatEGP2(fromPiastres(sumPiastres(waiting.map((b) => toPiastres(b.totalAmount)))));
  const oldest = Math.max(
    ...waiting.map((b) => Math.floor((Date.now() - b.submittedAt.getTime()) / 86_400_000)),
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let emailed = 0;
  for (const person of confirmers) {
    // One row per (batch, person, day): if this runs twice, the second run writes nothing and
    // sends nothing.
    const already = await prisma.confirmationReminderLog.findFirst({
      where: { batchId: waiting[0].id, userId: person.id, sentOn: today },
      select: { id: true },
    });
    if (already) continue;

    await prisma.confirmationReminderLog.create({
      data: { batchId: waiting[0].id, userId: person.id, sentOn: today },
    });
    await sendEmail({
      to: person.email,
      ...confirmationReminder({ count: waiting.length, total, oldestDays: oldest }),
    });
    emailed += 1;
  }

  return NextResponse.json({ ok: true, waiting: waiting.length, emailed });
}
