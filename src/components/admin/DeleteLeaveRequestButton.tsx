"use client";

import { deleteLeaveRequest } from "@/app/(app)/time-off/actions";

/**
 * Remove a time-off request that was added by mistake (spec 035 follow-up, 2026-08-18).
 * Admin-only, guarded by an explicit confirm — a hard delete that also removes the days
 * from the person's year count (counts are derived live).
 */
export function DeleteLeaveRequestButton({
  id,
  who,
  dates,
}: {
  id: string;
  who: string;
  dates: string;
}) {
  return (
    <form
      action={deleteLeaveRequest}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Remove ${who}'s request (${dates})? It disappears from every view and from their working-day count. This can't be undone.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-red-300 hover:text-red-600"
      >
        Remove
      </button>
    </form>
  );
}
