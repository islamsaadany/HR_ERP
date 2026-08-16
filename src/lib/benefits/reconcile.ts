/**
 * Medical charge reconciliation (spec 032).
 *
 * Spec 027 divided a premium across cycles ONCE, at commit time, and could only write a share for
 * a cycle that already existed. With a June→June term and a single calendar cycle, the next year's
 * half had nowhere to go: it was reported as `unallocated` and dropped. Opening the next cycle did
 * not recover it — the open path only flips existing rows, and re-pricing only adjusts them.
 *
 * The premium and the term are stored on the commitment, so each cycle's share is derivable at any
 * time. Deciding it in advance buys nothing and loses the money when a cycle is missing. So the
 * division moves to CYCLE TIME: whenever a cycle is created, opened, or re-dated, the shares are
 * worked out then and the missing rows are written.
 *
 * The one thing never touched is a charge already APPLIED to a CLOSED cycle. That money has been
 * counted against a pool that is shut and reconciled against a real insurer invoice; recomputing it
 * would rewrite settled history.
 */

import { prisma } from "@/lib/prisma";
import { splitPremium, overlapWholeMonths } from "@/lib/benefits/policy-year";

/**
 * Recalculate every commitment's cycle charges against the cycles and terms as they stand now.
 *
 * Idempotent: with nothing changed it writes nothing, so it is safe to call on every cycle event.
 * Scoped to the commitments touching `planYearId` when given — creating one cycle should not
 * rewrite charges for terms that have nothing to do with it.
 */
export async function reconcileMedicalCharges(planYearId?: string): Promise<void> {
  const cycles = await prisma.planYear.findMany({
    where: { startDate: { not: null }, endDate: { not: null } },
    orderBy: { startDate: "asc" },
    select: { id: true, status: true, startDate: true, endDate: true },
  });
  // A cycle with no window can't be overlapped, so it takes no share (FR-011). Absorbing the whole
  // premium into an undated cycle would be worse than charging nothing.
  const dated = cycles.map((c) => ({ id: c.id, start: c.startDate!, end: c.endDate! }));
  if (dated.length === 0) return;

  const target = planYearId ? dated.find((c) => c.id === planYearId) : null;

  const commitments = await prisma.medicalCommitment.findMany({
    // Only term-based commitments split. One with no policy term keeps today's single charge.
    where: { policyYearId: { not: null } },
    select: {
      id: true,
      premium: true,
      planYearId: true,
      policyYearId: true,
      policyYear: { select: { startDate: true, endDate: true } },
      user: { select: { status: true } },
      cycleCharges: {
        select: { id: true, planYearId: true, amount: true, status: true, overlapMonths: true },
      },
    },
  });

  const statusById = new Map(cycles.map((c) => [c.id, c.status]));

  for (const c of commitments) {
    if (!c.policyYear || !c.policyYearId) continue;
    const term = { start: c.policyYear.startDate, end: c.policyYear.endDate };

    // When reconciling for one cycle, skip commitments whose term doesn't reach it.
    if (target) {
      const touches = splitPremium(c.premium, term, [target]).shares.length > 0;
      if (!touches) continue;
    }

    // Frozen: applied to a cycle that is now closed. Left exactly as it is (FR-003).
    const frozen = c.cycleCharges.filter(
      (ch) => ch.status === "APPLIED" && statusById.get(ch.planYearId) === "CLOSED"
    );
    const frozenIds = new Set(frozen.map((f) => f.id));
    const frozenTotal = frozen.reduce((n, f) => n + f.amount, 0);
    const frozenCycleIds = new Set(frozen.map((f) => f.planYearId));

    // Only what isn't already settled gets distributed (FR-004), and never below zero: if HR has
    // dropped the premium under what closed cycles absorbed, we do not invent a negative charge —
    // the commitments list already shows that mismatch in red.
    const remaining = Math.max(0, c.premium - frozenTotal);
    const openCycles = dated.filter((d) => !frozenCycleIds.has(d.id));
    if (openCycles.length === 0) continue;

    // Distribute `remaining` over the months NOT already settled — the denominator is the term
    // minus the frozen months, NOT the whole term. Dividing by the whole term after freezing part
    // of it under-charges every remaining cycle: with 6 of 11 months frozen, the last cycle would
    // get 5/11 of what was left instead of all of it, and the premium would stop reconciling.
    const termMonths = overlapWholeMonths(term, term);
    const frozenMonths = frozen.reduce((n, f) => n + f.overlapMonths, 0);
    const unsettledMonths = Math.max(0, termMonths - frozenMonths);

    const candidates = openCycles
      .map((cy) => ({ cycle: cy, overlapMonths: overlapWholeMonths(term, cy) }))
      .filter((x) => x.overlapMonths > 0);
    const coveredMonths = candidates.reduce((n, x) => n + x.overlapMonths, 0);

    const shares = candidates.map((x) => ({
      ...x,
      amount: unsettledMonths > 0 ? Math.floor((remaining * x.overlapMonths) / unsettledMonths) : 0,
    }));
    // Only when the existing cycles cover everything still owed does the rounding remainder get
    // handed out — otherwise the shortfall is the share of a cycle that does not exist yet, and it
    // waits there rather than being charged to a cycle that never covered those months.
    if (shares.length > 0 && coveredMonths >= unsettledMonths && unsettledMonths > 0) {
      const allocated = shares.reduce((n, x) => n + x.amount, 0);
      shares[shares.length - 1].amount += remaining - allocated;
    }
    const wanted = new Map(shares.map((sh) => [sh.cycle.id, sh]));

    for (const share of shares) {
      const existing = c.cycleCharges.find((ch) => ch.planYearId === share.cycle.id);
      const cycleStatus = statusById.get(share.cycle.id);
      // An employee who has left never draws: the advance premium comes back from the insurer,
      // so charging a pool they no longer hold would be meaningless (matches the open path).
      const nextStatus =
        c.user.status !== "ACTIVE"
          ? ("CANCELLED" as const)
          : cycleStatus === "OPEN"
            ? ("APPLIED" as const)
            : ("SCHEDULED" as const);

      if (!existing) {
        // The row spec 027 could not write because this cycle didn't exist yet (FR-002).
        await prisma.medicalCycleCharge.create({
          data: {
            commitmentId: c.id,
            planYearId: share.cycle.id,
            policyYearId: c.policyYearId,
            amount: share.amount,
            overlapMonths: share.overlapMonths,
            status: nextStatus,
            appliedAt: nextStatus === "APPLIED" ? new Date() : null,
          },
        });
        continue;
      }
      if (frozenIds.has(existing.id)) continue;

      // Idempotence (FR-007): an unchanged row is not written, so calling this on every cycle
      // event is free and leaves no churn in `updatedAt`.
      const sameAmount = existing.amount === share.amount;
      const sameMonths = existing.overlapMonths === share.overlapMonths;
      const keepStatus = existing.status === "CANCELLED" ? existing.status : nextStatus;
      if (sameAmount && sameMonths && existing.status === keepStatus) continue;

      await prisma.medicalCycleCharge.update({
        where: { id: existing.id },
        data: {
          amount: share.amount,
          overlapMonths: share.overlapMonths,
          status: keepStatus,
          appliedAt: keepStatus === "APPLIED" ? (existing.status === "APPLIED" ? undefined : new Date()) : null,
        },
      });
    }

    // A non-frozen charge on a cycle the term no longer reaches is zeroed rather than deleted:
    // the row is the record that this cycle was once in scope, and deleting it would erase that.
    for (const ch of c.cycleCharges) {
      if (frozenIds.has(ch.id) || wanted.has(ch.planYearId)) continue;
      if (ch.amount === 0) continue;
      await prisma.medicalCycleCharge.update({
        where: { id: ch.id },
        data: { amount: 0, overlapMonths: 0 },
      });
    }
  }
}
