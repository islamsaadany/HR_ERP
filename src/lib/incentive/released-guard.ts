/**
 * Refusing an edit that would change money already released (spec 009 FR-006g).
 *
 * The CEO's rule: a cycle stays editable for anyone not yet paid, but an edit that would
 * change an already-released figure is refused, naming the person. That money has gone —
 * or is at the bank waiting — and the report has to keep agreeing with what actually
 * happened.
 *
 * Done by computing the report the edited rows WOULD produce, in memory, and comparing
 * only the released lines. Nothing is written to find out.
 */
import { computeCycle, type CycleAssignment } from "./compute";
import { getIncentiveConfig } from "./config";
import { payoutLines, releasedFiguresBroken, KIND_LABEL } from "./payouts";
import { prisma } from "@/lib/prisma";
import type { CleanAssignment, CleanContribution, CleanPerson } from "./review";
import type { AssignmentType } from "./rules";

const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function releasedFiguresWouldBreak(
  cycleId: string,
  clean: { people: CleanPerson[]; assignments: CleanAssignment[]; contributions: CleanContribution[] }
): Promise<string[]> {
  // Nothing released → nothing to protect, and no reason to do the work.
  const released = await prisma.incentivePayout.findMany({
    where: { cycleId },
    select: { userId: true, personName: true, kind: true, amount: true },
  });
  if (released.length === 0) return [];

  const cycle = await prisma.incentiveCycle.findUnique({
    where: { id: cycleId },
    select: { revenue: true, deliveryCost: true, totalExpenses: true },
  });
  const config = await getIncentiveConfig();

  const prospective = computeCycle(
    clean.people.map((p) => ({
      name: p.name,
      role: p.role,
      netMonthlySalary: p.netMonthlySalary,
      eligibleToLead: true,
      utilization: null,
    })),
    clean.assignments.map(
      (a): CycleAssignment => ({
        client: a.client,
        type: a.type as AssignmentType,
        lead: a.lead,
        bd: a.bd,
        leadSource: a.leadSource,
        revenue: a.revenue,
        directCost: a.directCost,
        vendorCost: a.vendorCost,
        markupPct: a.markupPct,
        status: a.status,
      })
    ),
    clean.contributions,
    {
      revenue: cycle?.revenue ?? null,
      deliveryCost: cycle?.deliveryCost ?? null,
      totalExpenses: cycle?.totalExpenses ?? null,
    },
    config
  );

  // Matched against the rows about to be SAVED, not the stored ones: the question is what
  // this edit would actually produce, including if it renames or removes somebody.
  const lines = await payoutLines(
    cycleId,
    prospective,
    clean.people.map((p) => ({ name: p.name, employeeId: p.employeeId }))
  );

  return releasedFiguresBroken(
    lines,
    released.map((r) => ({ userId: r.userId, personName: r.personName, kind: r.kind, amount: Number(r.amount) }))
  ).map(
    (b) =>
      `This change would make ${b.personName}'s ${KIND_LABEL[b.kind]} ${m(b.now)}, but ${m(
        b.was
      )} was already released. Release the difference as a separate payment, or ask Finance to return that transaction first.`
  );
}
