/**
 * Incentive Scheme — load a stored cycle and run the engine over it.
 *
 * Shared by the cycle report page and the Excel-calculation export so both use
 * the identical mapping from persisted rows to the computed report.
 */
import { prisma } from "@/lib/prisma";
import { computeCycle, type CycleAssignment, type CycleReport } from "./compute";
import { getIncentiveConfig } from "./config";
import type { AssignmentType } from "./rules";

export type LoadedCycle = {
  id: string;
  label: string;
  report: CycleReport;
};

export async function loadCycleReport(id: string): Promise<LoadedCycle | null> {
  const cycle = await prisma.incentiveCycle.findUnique({
    where: { id },
    include: { people: true, assignments: true, contributions: true },
  });
  if (!cycle) return null;

  const config = await getIncentiveConfig();

  const report = computeCycle(
    cycle.people.map((p) => ({
      name: p.name,
      role: p.role,
      netMonthlySalary: p.netMonthlySalary,
      eligibleToLead: p.eligibleToLead,
      utilization: p.utilization,
    })),
    cycle.assignments.map(
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
    cycle.contributions.map((c) => ({ client: c.client, person: c.person, share: c.share })),
    { revenue: cycle.revenue, deliveryCost: cycle.deliveryCost, totalExpenses: cycle.totalExpenses },
    config
  );

  return { id: cycle.id, label: cycle.label, report };
}
