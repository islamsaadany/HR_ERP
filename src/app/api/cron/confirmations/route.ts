import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { confirmersForUnit } from "@/lib/finance/confirmers";
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
    select: {
      id: true,
      totalAmount: true,
      submittedAt: true,
      businessUnitId: true,
      businessUnit: { select: { name: true } },
    },
  });
  if (waiting.length === 0) {
    return NextResponse.json({ ok: true, waiting: 0, emailed: 0 });
  }

  // Per business unit (2026-08-25). A person appointed for one unit must not be nudged about
  // another's money — the nudge is the only thing here that speaks unasked, so it is the last
  // place a unit boundary should leak.
  const byUnit = new Map<string, typeof waiting>();
  for (const batch of waiting) {
    const list = byUnit.get(batch.businessUnitId);
    if (list) list.push(batch);
    else byUnit.set(batch.businessUnitId, [batch]);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Somebody who holds two units gets ONE email naming both, not two emails — the job is "look at
  // your queue", and it is the same queue.
  type Pending = { email: string; units: Set<string>; batches: typeof waiting };
  const perPerson = new Map<string, Pending>();

  for (const [unitId, batches] of byUnit) {
    const confirmers = await confirmersForUnit(unitId);
    const unitName = batches[0].businessUnit?.name ?? "a business unit";
    for (const person of confirmers) {
      const existing = perPerson.get(person.id);
      if (existing) {
        existing.units.add(unitName);
        existing.batches.push(...batches);
      } else {
        perPerson.set(person.id, {
          email: person.email,
          units: new Set([unitName]),
          batches: [...batches],
        });
      }
    }
  }

  if (perPerson.size === 0) {
    return NextResponse.json({ ok: true, waiting: waiting.length, emailed: 0, note: "nobody appointed" });
  }

  let emailed = 0;
  for (const [userId, pending] of perPerson) {
    // One row per (batch, person, day): if this runs twice, the second run writes nothing and
    // sends nothing.
    const marker = pending.batches[0].id;
    const already = await prisma.confirmationReminderLog.findFirst({
      where: { batchId: marker, userId, sentOn: today },
      select: { id: true },
    });
    if (already) continue;

    const total = formatEGP2(
      fromPiastres(sumPiastres(pending.batches.map((b) => toPiastres(b.totalAmount)))),
    );
    const oldest = Math.max(
      ...pending.batches.map((b) => Math.floor((Date.now() - b.submittedAt.getTime()) / 86_400_000)),
    );

    await prisma.confirmationReminderLog.create({
      data: { batchId: marker, userId, sentOn: today },
    });
    await sendEmail({
      to: pending.email,
      ...confirmationReminder({
        count: pending.batches.length,
        total,
        oldestDays: oldest,
        businessUnits: [...pending.units].sort(),
      }),
    });
    emailed += 1;
  }

  return NextResponse.json({ ok: true, waiting: waiting.length, emailed });
}
