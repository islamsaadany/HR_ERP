/**
 * Incentive Scheme — turn a stored cycle's inputs into the full report model.
 *
 * Runs the pure engine (./rules) over the persisted people / assignments /
 * contributions / firm P&L, applying:
 *  - payable rules (closed project or active retainer),
 *  - flag-and-block validation (a payable assignment whose contributions don't
 *    total 100% is blocked and excluded from payouts until corrected),
 *  - firm P&L, per-person aggregation, cost recovery, and proposed Profit Share.
 *
 * Per-hour performance metrics (GP/hour, break-even, pricing floor) are NOT
 * produced here — the sheets carry no hours; only overall utilisation and
 * cost recovery are available.
 */
import {
  computeAssignment,
  grossProfit,
  grossMargin,
  profitShareEntitlement,
  money,
  INCENTIVE_RULES,
  type AssignmentResult,
  type AssignmentType,
} from "./rules";

export type CyclePerson = {
  name: string;
  role: string | null;
  netMonthlySalary: number;
  eligibleToLead: boolean;
  utilization: number | null;
};
export type CycleAssignment = {
  client: string;
  type: AssignmentType;
  lead: string;
  bd: string;
  leadSource: string | null;
  revenue: number | null;
  directCost: number | null;
  vendorCost: number;
  markupPct: number;
  status: string; // closed | ongoing | in_progress | pending
};
export type CycleContribution = { client: string; person: string; share: number };
export type FirmFigures = { revenue: number | null; deliveryCost: number | null; totalExpenses: number | null };

const CONTRIB_TOLERANCE = 0.01; // ±1 percentage point

export type BlockedAssignment = { client: string; reason: string };

export type PersonTotals = {
  name: string;
  salary: number;
  leadFee: number;
  contributor: number;
  commission: number;
  total: number; // lead fee + contributor (released comp excl. commission)
  months: number; // (leadFee + contributor) ÷ monthly salary
};

export type CostRecoveryRow = {
  name: string;
  sixMonthSalary: number;
  gpGenerated: number;
  multiple: number;
  surplus: number;
};

export type CycleReport = {
  assignments: AssignmentResult[]; // payable + balanced
  blocked: BlockedAssignment[];
  notPayable: { client: string; status: string }[];
  issues: string[];
  totals: {
    leadFees: number;
    contributorPayments: number;
    commission: number;
    firmRetained: number;
    schemeCost: number; // lead fees + contributor payments + commission
  };
  byPerson: PersonTotals[];
  commissionByPerson: { name: string; amount: number }[];
  firm: {
    revenue: number;
    deliveryCost: number;
    totalExpenses: number;
    profitBeforeScheme: number;
    profitBeforeSchemePct: number;
    schemeCost: number;
    profitAfterScheme: number;
    profitAfterSchemePct: number;
    schemePctOfGrossProfit: number;
  } | null;
  costRecovery: CostRecoveryRow[];
  profitShare: {
    adopted: false;
    netMarginPct: number | null;
    gateMet: boolean;
    rows: { name: string; entitlement: number; offset: number; net: number }[];
  };
  watchList: string[];
};

const key = (s: string) => s.trim().toLowerCase();

function isPayable(a: CycleAssignment): boolean {
  if (a.revenue == null || a.directCost == null) return false;
  if (a.type === "RET") return a.status === "ongoing" || a.status === "closed";
  return a.status === "closed";
}

export function computeCycle(
  people: CyclePerson[],
  assignments: CycleAssignment[],
  contributions: CycleContribution[],
  firm: FirmFigures
): CycleReport {
  const issues: string[] = [];
  const salaries: Record<string, number> = {};
  const eligible: Record<string, boolean> = {};
  for (const p of people) {
    salaries[p.name] = p.netMonthlySalary;
    eligible[p.name] = p.eligibleToLead;
  }
  const salaryFor = (name: string) =>
    salaries[name] ?? salaries[Object.keys(salaries).find((k) => key(k) === key(name)) ?? ""] ?? 0;
  const eligibleFor = (name: string) => {
    const k = Object.keys(eligible).find((x) => key(x) === key(name));
    return k ? eligible[k] : true;
  };

  const contribByClient = new Map<string, CycleContribution[]>();
  for (const c of contributions) {
    const list = contribByClient.get(c.client) ?? [];
    list.push(c);
    contribByClient.set(c.client, list);
  }

  const results: AssignmentResult[] = [];
  const blocked: BlockedAssignment[] = [];
  const notPayable: { client: string; status: string }[] = [];

  for (const a of assignments) {
    if (!isPayable(a)) {
      notPayable.push({ client: a.client, status: a.status });
      continue;
    }
    const contribs = contribByClient.get(a.client) ?? [];
    // Flag-and-block: a payable assignment with contributions that don't total 100%.
    if (contribs.length > 0) {
      const sum = contribs.reduce((s, c) => s + c.share, 0);
      // Allow ±1pp drift; the 1e-6 epsilon keeps float noise off the boundary.
      if (Math.abs(sum - 1) > CONTRIB_TOLERANCE + 1e-6) {
        blocked.push({ client: a.client, reason: `Contributions total ${(sum * 100).toFixed(1)}% (must be 100%).` });
        continue;
      }
    }
    if (!people.some((p) => key(p.name) === key(a.lead))) {
      issues.push(`Assignment "${a.client}": lead "${a.lead}" is not in the people sheet.`);
    }
    results.push(
      computeAssignment({
        client: a.client,
        type: a.type,
        revenue: a.revenue!,
        directCost: a.directCost!,
        vendorCost: a.vendorCost,
        markupPct: a.markupPct,
        leadName: a.lead,
        leadEligible: eligibleFor(a.lead),
        bd: a.bd,
        leadSource: a.leadSource ?? a.bd,
        payable: true,
        contributions: contribs.map((c) => ({ name: c.person, share: c.share })),
        salaries,
      })
    );
  }

  // Totals.
  const leadFees = money(results.reduce((s, r) => s + r.leadFee, 0));
  const contributorPayments = money(
    results.reduce((s, r) => s + r.contributors.reduce((x, c) => x + c.payment, 0), 0)
  );
  const commission = money(results.reduce((s, r) => s + (r.commission?.amount ?? 0), 0));
  const firmRetained = money(results.reduce((s, r) => s + r.firmRetained, 0));
  const schemeCost = money(leadFees + contributorPayments + commission);

  // Per-person aggregation.
  const pmap = new Map<string, PersonTotals>();
  const ensure = (name: string): PersonTotals => {
    const existing = pmap.get(key(name));
    if (existing) return existing;
    const t: PersonTotals = {
      name,
      salary: salaryFor(name),
      leadFee: 0,
      contributor: 0,
      commission: 0,
      total: 0,
      months: 0,
    };
    pmap.set(key(name), t);
    return t;
  };
  for (const p of people) ensure(p.name);
  for (const r of results) {
    ensure(r.leadName).leadFee += r.leadFee;
    for (const c of r.contributors) ensure(c.name).contributor += c.payment;
    if (r.commission && r.commission.amount > 0) ensure(r.commission.earner).commission += r.commission.amount;
  }
  const byPerson = [...pmap.values()].map((t) => {
    const total = money(t.leadFee + t.contributor);
    return {
      ...t,
      leadFee: money(t.leadFee),
      contributor: money(t.contributor),
      commission: money(t.commission),
      total,
      months: t.salary > 0 ? Math.round((total / t.salary) * 100) / 100 : 0,
    };
  });
  byPerson.sort((a, b) => b.total - a.total);
  const commissionByPerson = byPerson
    .filter((p) => p.commission > 0)
    .map((p) => ({ name: p.name, amount: p.commission }))
    .sort((a, b) => b.amount - a.amount);

  // Firm P&L.
  let firmBlock: CycleReport["firm"] = null;
  if (firm.revenue != null && firm.deliveryCost != null && firm.totalExpenses != null) {
    const grossProfitFirm = firm.revenue - firm.deliveryCost;
    const profitBeforeScheme = money(firm.revenue - firm.deliveryCost - firm.totalExpenses);
    const profitAfterScheme = money(profitBeforeScheme - schemeCost);
    firmBlock = {
      revenue: firm.revenue,
      deliveryCost: firm.deliveryCost,
      totalExpenses: firm.totalExpenses,
      profitBeforeScheme,
      profitBeforeSchemePct: firm.revenue > 0 ? profitBeforeScheme / firm.revenue : 0,
      schemeCost,
      profitAfterScheme,
      profitAfterSchemePct: firm.revenue > 0 ? profitAfterScheme / firm.revenue : 0,
      schemePctOfGrossProfit: grossProfitFirm > 0 ? schemeCost / grossProfitFirm : 0,
    };
  }

  // Cost recovery — GP attributed to a person by their contribution share.
  const gpByPerson = new Map<string, number>();
  for (const a of assignments) {
    if (!isPayable(a)) continue;
    const gp = grossProfit(a.revenue!, a.directCost!);
    const contribs = contribByClient.get(a.client) ?? [];
    for (const c of contribs) {
      gpByPerson.set(key(c.person), (gpByPerson.get(key(c.person)) ?? 0) + gp * c.share);
    }
  }
  const costRecovery: CostRecoveryRow[] = people
    .map((p) => {
      const sixMonthSalary = money(p.netMonthlySalary * INCENTIVE_RULES.cycleMonths);
      const gpGenerated = money(gpByPerson.get(key(p.name)) ?? 0);
      return {
        name: p.name,
        sixMonthSalary,
        gpGenerated,
        multiple: sixMonthSalary > 0 ? Math.round((gpGenerated / sixMonthSalary) * 10) / 10 : 0,
        surplus: money(gpGenerated - sixMonthSalary),
      };
    })
    .sort((a, b) => b.multiple - a.multiple);

  // Profit Share (proposed) — driven by firm net margin (profit after scheme).
  const netMarginPct = firmBlock ? firmBlock.profitAfterSchemePct : null;
  const gateMet = netMarginPct != null && netMarginPct >= INCENTIVE_RULES.profitShare.floorMargin;
  const psRows = gateMet
    ? people.map((p) => {
        const entitlement = profitShareEntitlement(netMarginPct!, p.netMonthlySalary);
        const leadFee = byPerson.find((b) => key(b.name) === key(p.name))?.leadFee ?? 0;
        const offset = money(leadFee * INCENTIVE_RULES.profitShare.leadFeeOffsetShare);
        return { name: p.name, entitlement, offset, net: money(Math.max(0, entitlement - offset)) };
      })
    : [];

  // Watch list — the computable items.
  const watchList: string[] = [];
  for (const r of results) {
    for (const c of r.contributors) {
      if (c.flooredToZero) watchList.push(`${c.name} contributed to ${r.client} but the payment fell below the 5% floor (£0).`);
    }
    if (r.marginGatePassed && r.grossMarginPct < INCENTIVE_RULES.marginGate + 0.02) {
      watchList.push(`${r.client} clears the 70% gate by a thin margin (${(r.grossMarginPct * 100).toFixed(1)}%).`);
    }
  }
  for (const p of byPerson) {
    if (p.salary > 0 && p.contributor / p.salary > 2) watchList.push(`${p.name}'s contributor payments exceed two months of salary.`);
    if (p.total === 0 && p.commission === 0) watchList.push(`${p.name} earned nothing this cycle.`);
  }

  return {
    assignments: results,
    blocked,
    notPayable,
    issues,
    totals: { leadFees, contributorPayments, commission, firmRetained, schemeCost },
    byPerson,
    commissionByPerson,
    firm: firmBlock,
    costRecovery,
    profitShare: { adopted: false, netMarginPct, gateMet, rows: psRows },
    watchList,
  };
}
