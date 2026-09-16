import type { LearningCourseStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Where a course sits in the list, and the one write that changes it.
 *
 * This is a plain module rather than part of `actions.ts` on purpose: every export from a
 * `"use server"` file is an endpoint the browser can post to, so the raw write to the published
 * order — which is the order every employee meets their courses in — does not live there. The
 * action is the access check, the validation and a call to this (2026-08-25 rule).
 */

/**
 * The order the states run down the admin list, and the ONE place that order is decided — the page
 * and the write both read it, so the list an operator arranges cannot disagree with the numbering
 * the write produces.
 *
 * Published leads because it is the working set and the only one whose order anybody but the
 * operator ever sees. `status: "asc"` used to decide this implicitly, which meant the answer was
 * whatever order the enum happened to be declared in.
 */
export const STATUS_ORDER = ["PUBLISHED", "DRAFT", "HIDDEN"] as const satisfies readonly LearningCourseStatus[];

/** How the states are named on screen. Not the enum's own words: HIDDEN reads as "Paused". */
export const STATUS_LABEL: Record<LearningCourseStatus, string> = {
  PUBLISHED: "Published",
  DRAFT: "Drafts",
  HIDDEN: "Paused",
};

export function isCourseStatus(value: unknown): value is LearningCourseStatus {
  return typeof value === "string" && (STATUS_ORDER as readonly string[]).includes(value);
}

export function statusRank(status: LearningCourseStatus): number {
  const at = (STATUS_ORDER as readonly string[]).indexOf(status);
  // A member added to the enum later sorts last rather than silently sorting first.
  return at === -1 ? STATUS_ORDER.length : at;
}

export type ReorderOutcome = { ok: true } | { ok: false; error: string };

/**
 * Refused when the submitted list is not exactly the set of courses in that state.
 *
 * Deliberately the same sentence for every shape of mismatch — a course published in another tab,
 * one deleted, one renamed into a different state — because the operator's remedy is identical and
 * the difference is not theirs to act on.
 */
export const LIST_CHANGED =
  "The courses changed while this page was open, so the new order was not saved. Refresh and try again.";

/**
 * Put the courses of ONE state into the given order.
 *
 * THE GUARD STARTS FROM WHAT IT PROTECTS (2026-08-26 rule). The thing being protected is that
 * every course holds exactly one place in the list — so the check iterates the courses the
 * DATABASE says are in this state and demands the submitted list account for all of them, rather
 * than iterating what was submitted and trusting it to be complete. Written the other way round it
 * would have a hole exactly where it matters: a course created or published in another tab is
 * absent from the submitted list, produces nothing to check, and would keep a stale number that
 * silently places it among a different state's courses.
 *
 * Renumbering is CANONICAL and covers every course, not just the ones that moved: the whole list
 * is rewritten as 1..n in state order, so the numbers stay gap-free and unique. That also repairs
 * legacy rows — a course from before creation assigned a number carries 0, and several 0s tie.
 */
export async function reorderCoursesWithin(
  status: LearningCourseStatus,
  ids: string[]
): Promise<ReorderOutcome> {
  if (new Set(ids).size !== ids.length) return { ok: false, error: LIST_CHANGED };

  return prisma.$transaction(async (tx) => {
    const all = await tx.course.findMany({ select: { id: true, status: true, order: true, title: true } });

    const inState = all.filter((c) => c.status === status);
    const submitted = new Set(ids);
    if (inState.length !== ids.length || inState.some((c) => !submitted.has(c.id))) {
      return { ok: false, error: LIST_CHANGED };
    }

    // Every other state keeps the order it already had; only the one being arranged is re-sequenced.
    const settled = (a: (typeof all)[number], b: (typeof all)[number]) =>
      a.order - b.order || a.title.localeCompare(b.title);
    const sequence: string[] = [];
    for (const state of STATUS_ORDER) {
      if (state === status) {
        sequence.push(...ids);
        continue;
      }
      sequence.push(...all.filter((c) => c.status === state).sort(settled).map((c) => c.id));
    }

    const current = new Map(all.map((c) => [c.id, c.order]));
    const writes = sequence
      .map((id, index) => ({ id, order: index + 1 }))
      .filter((row) => current.get(row.id) !== row.order);

    for (const row of writes) {
      await tx.course.update({ where: { id: row.id }, data: { order: row.order } });
    }
    return { ok: true };
  });
}

// ─── Where a track's order fits (spec 043, 2026-09-16) ──────────────────

/**
 * What a person's track membership contributes to the sequence they meet their courses in.
 *
 * `trackOrder` is the track's own position for that course; `trackName` is what the employee's page
 * groups under. A course reached any other way carries neither.
 */
export type TrackPlacement = {
  courseId: string;
  trackId: string;
  trackName: string;
  trackOrder: number;
};

/** A course as the sequencer sees it: its company position, and its track placement if it has one. */
export type Sequenceable = {
  courseId: string;
  /** The company-wide order, already settled by `reorderCoursesWithin`. */
  order: number;
  title: string;
};

/**
 * THE sequence a person meets their courses in — the one place that decides it.
 *
 * Track courses first, grouped by track (tracks in the order the person joined them, stable by
 * name), each track's courses in ITS step order. Then everything else, in the company-wide order
 * that `STATUS_ORDER` and `reorderCoursesWithin` already produce.
 *
 * This lives in THIS file rather than in a new module on purpose: `order.ts` exists precisely so the
 * page and the write cannot disagree about a sequence, and a second ordering function would fork
 * exactly what that is for. A course in two tracks is placed by the FIRST track it appears in, so
 * it is listed once.
 */
export function sequenceForLearner<T extends Sequenceable>(
  courses: T[],
  placements: TrackPlacement[],
  trackOrder: string[]
): Array<T & { track: TrackPlacement | null }> {
  const placementByCourse = new Map<string, TrackPlacement>();
  for (const placement of placements) {
    // First track wins — a course held through two paths appears once, where it is met first.
    if (!placementByCourse.has(placement.courseId)) placementByCourse.set(placement.courseId, placement);
  }
  const trackRank = new Map(trackOrder.map((id, i) => [id, i]));

  return courses
    .map((course) => ({ ...course, track: placementByCourse.get(course.courseId) ?? null }))
    .sort((a, b) => {
      if (a.track && b.track) {
        const rank =
          (trackRank.get(a.track.trackId) ?? Number.MAX_SAFE_INTEGER) -
          (trackRank.get(b.track.trackId) ?? Number.MAX_SAFE_INTEGER);
        if (rank !== 0) return rank;
        if (a.track.trackId === b.track.trackId) return a.track.trackOrder - b.track.trackOrder;
        return a.track.trackName.localeCompare(b.track.trackName);
      }
      // A course on a path comes before one that is merely assigned: the path is the statement
      // about what matters first, which is the whole reason tracks exist.
      if (a.track) return -1;
      if (b.track) return 1;
      return a.order - b.order || a.title.localeCompare(b.title);
    });
}
