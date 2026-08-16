import { prisma } from "@/lib/prisma";
import { expectedRecovery } from "@/lib/benefits/policy-year";

/**
 * Create the medical-premium recoveries that should exist, and skip the ones that already do
 * (spec 030).
 *
 * A recovery is owed whenever an employee stops being active before their policy term ends: the
 * company has paid for cover it won't use. The natural moment to notice is when a scheduled
 * charge is cancelled at cycle open — but a leave date is often recorded weeks later, and a
 * departure between cycle openings would otherwise never surface. So this also runs when Finance
 * opens their page.
 *
 * That is safe because `commitmentId` is unique: the pass is idempotent by construction, and
 * re-running it can only ever fill gaps. It deliberately does NOT touch an existing recovery —
 * not its expected amount (frozen at creation, FR-013) and not its status, so a recovery is never
 * reopened or restated behind Finance's back.
 *
 * Employees who left BEFORE this feature shipped are not backfilled: those departures were
 * settled offline, and surfacing them would be phantom work Finance can't action.
 */
export async function syncMedicalRecoveries(): Promise<number> {
  const candidates = await prisma.medicalCommitment.findMany({
    where: {
      policyYearId: { not: null },
      user: { status: { not: "ACTIVE" } },
      recovery: null,
    },
    include: { user: { select: { id: true, endDate: true } }, policyYear: true },
  });
  if (candidates.length === 0) return 0;

  let created = 0;
  for (const c of candidates) {
    if (!c.policyYear) continue;
    const term = { start: c.policyYear.startDate, end: c.policyYear.endDate };
    const coverEndedOn = c.user.endDate ?? null;
    // A leave date at or past the term's end means nothing is recoverable — no item to chase.
    // A MISSING leave date still creates the item, at zero, so Finance can see who to chase HR
    // about; showing nothing would hide the gap instead of naming it.
    if (coverEndedOn && coverEndedOn.getTime() >= term.end.getTime()) continue;
    const { months, amount } = expectedRecovery(term, coverEndedOn, c.premium);
    try {
      await prisma.medicalRecovery.create({
        data: {
          commitmentId: c.id,
          userId: c.user.id,
          policyYearId: c.policyYearId!,
          coverEndedOn,
          premiumAtCreation: c.premium,
          expectedMonths: months,
          expectedAmount: amount,
        },
      });
      created += 1;
    } catch {
      // Unique violation — another request created it first. Nothing to do.
    }
  }
  return created;
}
