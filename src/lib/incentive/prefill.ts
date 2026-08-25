/**
 * Incentive Scheme — server-side pre-filled templates.
 *
 * The static templates in ./templates carry synthetic sample rows. When a cycle
 * is in context we can do better: seed each sheet from data we already hold, so
 * the operator downloads a sheet that is mostly filled in and only needs the
 * money columns.
 *
 *  - people.csv       ← the employee registry (Consulting + Data teams): name,
 *                        role, net monthly salary, start date.
 *  - assignments.csv  ← the clients + lead/bd carried from the most recent PRIOR
 *                        cycle; the money/date columns are left blank to fill in.
 *  - contributions.csv← a client × people grid skeleton (blank shares).
 *
 * Headers match the parsers in ./import exactly. Everything is server-only
 * (reads the DB); the pure static fallback still lives in ./templates.
 */
import { prisma } from "@/lib/prisma";

/** Registry departments whose people seed the Incentive people sheet. */
const INCENTIVE_DEPARTMENTS = ["Consulting Department", "Data Management Unit"] as const;

/** Quote a CSV cell only when it contains a comma, quote, or newline. */
function cell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Dates go into the template **dd/mm/yyyy** — the house standard, and the same
 * form the parser reads back (`parseDate` is day-first), so a template that is
 * downloaded, filled in and uploaded round-trips unchanged. Built from the UTC
 * parts rather than a locale format so a server in another timezone can't shift
 * somebody's start date by a day.
 */
const sheetDate = (d: Date | null | undefined): string =>
  d
    ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`
    : "";

type Prefilled = { filename: string; csv: string };

/** Active people from the Consulting + Data teams, ordered by name. */
async function incentivePeople() {
  return prisma.user.findMany({
    where: { status: "ACTIVE", department: { in: [...INCENTIVE_DEPARTMENTS] } },
    orderBy: { name: "asc" },
    select: { name: true, title: true, monthlySalary: true, startDate: true },
  });
}

/** The most recent cycle other than the one in context (its clients carry forward). */
async function priorCycle(currentCycleId: string) {
  const current = await prisma.incentiveCycle.findUnique({
    where: { id: currentCycleId },
    select: { createdAt: true },
  });
  if (!current) return null;
  return prisma.incentiveCycle.findFirst({
    where: { id: { not: currentCycleId }, createdAt: { lte: current.createdAt } },
    orderBy: { createdAt: "desc" },
    include: { assignments: true },
  });
}

function peopleCsv(people: Awaited<ReturnType<typeof incentivePeople>>): string {
  const header = "name,role,net_monthly_salary,start_date";
  const rows = people.map((p) =>
    [cell(p.name), cell(p.title), cell(p.monthlySalary ?? ""), cell(sheetDate(p.startDate))].join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}

function assignmentsCsv(assignments: { client: string; type: string; lead: string; bd: string; leadSource: string | null }[]): string {
  const header = "client,type,lead,bd,lead_source,revenue,direct_cost,vendor_cost,markup_pct,start_date,close_date";
  const rows = assignments.map((a) =>
    [cell(a.client), cell(a.type), cell(a.lead), cell(a.bd), cell(a.leadSource ?? a.bd), "", "", "", "", "", ""].join(",")
  );
  return [header, ...rows].join("\n") + "\n";
}

function contributionsCsv(clients: string[], people: { name: string }[]): string {
  const header = ["client", ...people.map((p) => p.name)].map(cell).join(",");
  const rows = clients.map((c) => [cell(c), ...people.map(() => "")].join(","));
  return [header, ...rows].join("\n") + "\n";
}

/**
 * Build a pre-filled sheet for a cycle. Returns null for an unknown sheet name.
 * Missing sources degrade gracefully to a header-only template (never throws).
 */
export async function buildPrefilledTemplate(
  sheet: "people" | "assignments" | "contributions",
  cycleId: string
): Promise<Prefilled | null> {
  if (sheet === "people") {
    const people = await incentivePeople();
    return { filename: "people.csv", csv: peopleCsv(people) };
  }

  if (sheet === "assignments") {
    const prior = await priorCycle(cycleId);
    return { filename: "assignments.csv", csv: assignmentsCsv(prior?.assignments ?? []) };
  }

  if (sheet === "contributions") {
    const [prior, people] = await Promise.all([priorCycle(cycleId), incentivePeople()]);
    // De-duplicate clients from the prior cycle, preserving first-seen order.
    const clients = [...new Set((prior?.assignments ?? []).map((a) => a.client))];
    return { filename: "contributions.csv", csv: contributionsCsv(clients, people) };
  }

  return null;
}
