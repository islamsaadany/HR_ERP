/**
 * Result types for the track actions (spec 043).
 *
 * A PLAIN MODULE, deliberately. Every export from a `"use server"` file must be an async function:
 * Next validates a page's whole server-action entry the first time any action on that page is
 * called, so one exported type's runtime twin, one array, one constant, breaks EVERY action on that
 * page — as a bare 500 with no message, above any code that could catch it. It is not a type error
 * and `next build` compiles it happily (learned the hard way on the Learning course page,
 * 2026-08-25).
 */

export type TrackResult = { ok: true; id?: string } | { ok: false; error: string };

/**
 * Returned by the reorder guard when the submitted list is not exactly the set of steps the
 * database says are in the track — a step added or removed in another tab.
 *
 * Deliberately one sentence for every shape of mismatch: the operator's remedy is identical and
 * the difference is not theirs to act on.
 */
export const TRACK_CHANGED =
  "The track changed while this page was open, so the new order was not saved. Refresh and try again.";

export const NOT_PUBLISHED =
  "Only a published course can be added to a track — a path built from drafts would reach nobody.";

export const TWO_DEADLINES =
  "A step carries one kind of deadline: either a number of days, or a fixed date. Not both.";

export const BAD_DUE_DAYS = "A deadline in days must be at least 1.";
