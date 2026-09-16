import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import type { Role } from "@prisma/client";

/**
 * May this person shape that person's learning (spec 043)?
 *
 * RESOLVED AGAINST THE CURRENT ORG CHART, every time, never against a stored snapshot — the same
 * choice Time-Off makes for approvals, and for the same reason: the question is "who is responsible
 * for this person today", and a promotion or a reorganisation must change the answer immediately.
 * (Reviews & 1:1s deliberately do the opposite, because a review belongs to the two people who had
 * it. Both departures are recorded in their specs so neither gets "fixed" into the other.)
 *
 * A manager may ADD courses for their own reports and order that person's list. They may never
 * remove what a company track requires — that is not enforced here but structurally: a company
 * requirement lives in `LearningTrackStep`, which no manager action writes to at all.
 */
export async function managesLearnerNow(managerId: string, learnerId: string): Promise<boolean> {
  if (managerId === learnerId) return false; // nobody sets their own priorities
  const learner = await prisma.user.findUnique({
    where: { id: learnerId },
    select: { reportsToId: true, status: true },
  });
  if (!learner || learner.status !== "ACTIVE") return false;
  return learner.reportsToId === managerId;
}

/**
 * The people this person may shape — their direct reports today.
 *
 * Whoever runs Learning is deliberately NOT given everybody here. Their power is over the company's
 * tracks, which is a different thing from reaching into one person's list; if they want to change
 * what an individual holds, they do it through a track, where it is visible and named.
 */
export async function learnersFor(managerId: string) {
  return prisma.user.findMany({
    where: { reportsToId: managerId, status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, title: true },
  });
}

/**
 * The guard the actions call. Returns a sentence rather than a boolean, because a refusal the
 * operator can read is worth more than one they have to guess at — and because a row that cannot
 * be acted on must say WHY on the row, never present a silently absent control.
 */
export async function refuseUnlessManages(
  actor: { id: string; role: Role },
  learnerId: string
): Promise<string | null> {
  // An HR Admin or Super User runs the module and may shape anyone: they are the people who would
  // otherwise have to ask a manager to fix something they can see is wrong.
  if (isAdmin(actor.role)) return null;
  if (await managesLearnerNow(actor.id, learnerId)) return null;
  return "You can only change the learning of people who report to you.";
}
