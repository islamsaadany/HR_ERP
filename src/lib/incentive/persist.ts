/**
 * Incentive Scheme — write the three review sheets back to a cycle.
 *
 * Deliberately NOT in the "use server" actions file: every export there becomes
 * an endpoint the browser can call, and an unauthenticated write to somebody's
 * compensation figures is not something to leave lying about. The action does
 * the access check and hands the already-validated rows here.
 */
import { prisma } from "@/lib/prisma";
import type { IncentivePayoutKind } from "@prisma/client";
import type { CleanAssignment, CleanContribution, CleanPerson } from "./review";

export type ReviewWriteCounts = { people: number; assignments: number; contributions: number };

/**
 * Replace-then-recreate, exactly like a CSV upload: it is the one statement
 * order that can never trip the (cycle, name) / (cycle, client) unique indexes,
 * whatever was renamed or swapped — an update-in-place pass collides the moment
 * two people trade names.
 *
 * The cost is that the two retired columns (`eligibleToLead`, `utilization`)
 * would be reset to their defaults, so they are carried across by row id first.
 * They are inert today, but a screen quietly dropping stored data on the way
 * past is how it stops being inert without anyone noticing.
 */
export async function writeReviewTables(
  cycleId: string,
  clean: { people: CleanPerson[]; assignments: CleanAssignment[]; contributions: CleanContribution[] }
): Promise<ReviewWriteCounts> {
  const existing = await prisma.incentivePerson.findMany({
    where: { cycleId },
    select: { id: true, eligibleToLead: true, utilization: true },
  });
  const retained = new Map(existing.map((p) => [p.id, p]));

  await prisma.$transaction([
    prisma.incentivePerson.deleteMany({ where: { cycleId } }),
    prisma.incentiveAssignment.deleteMany({ where: { cycleId } }),
    prisma.incentiveContribution.deleteMany({ where: { cycleId } }),
    ...clean.people.map((p) => {
      const carried = p.id ? retained.get(p.id) : undefined;
      return prisma.incentivePerson.create({
        data: {
          cycleId,
          name: p.name,
          role: p.role,
          netMonthlySalary: p.netMonthlySalary,
          startDate: p.startDate,
          eligibleToLead: carried?.eligibleToLead ?? true,
          utilization: carried?.utilization ?? null,
        },
      });
    }),
    ...clean.assignments.map((a) => prisma.incentiveAssignment.create({ data: { cycleId, ...a } })),
    ...clean.contributions.map((c) => prisma.incentiveContribution.create({ data: { cycleId, ...c } })),
  ]);

  return {
    people: clean.people.length,
    assignments: clean.assignments.length,
    contributions: clean.contributions.length,
  };
}

/**
 * Release a set of lines into Finance's queue (spec 009 FR-006g).
 *
 * Deliberately in this plain module rather than in the `"use server"` actions file, where
 * every export becomes a URL the browser can post to — an unauthenticated write that
 * creates payables would be worse than the unauthenticated write this module was created
 * to avoid. The action does the access check and hands the already-checked lines here.
 *
 * `createMany` with `skipDuplicates` leans on the (cycle, user, kind) unique index: if two
 * people press Release at the same moment, the second one's overlap is dropped rather than
 * paying twice, and the count returned is what actually landed.
 */
export async function releaseIncentivePayouts(
  cycleId: string,
  releasedById: string,
  lines: {
    userId: string;
    personName: string;
    kind: IncentivePayoutKind;
    amount: number;
    businessUnitId: string;
  }[]
): Promise<number> {
  if (lines.length === 0) return 0;
  const result = await prisma.incentivePayout.createMany({
    data: lines.map((l) => ({
      cycleId,
      userId: l.userId,
      personName: l.personName,
      kind: l.kind,
      amount: l.amount.toFixed(2),
      businessUnitId: l.businessUnitId,
      releasedById,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
