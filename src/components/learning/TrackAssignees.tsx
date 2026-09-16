"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignTrackAction, revokeTrackAction } from "@/app/(app)/admin/learning/tracks/actions";
import { BTN_GHOST } from "@/components/learning/ui";
import { formatDate } from "@/lib/labels";
import { CHIP } from "@/components/learning/ui";

/**
 * Who is on a track (spec 043, mockup-approved 2026-09-16).
 *
 * A group is shown as a group with its size, NOT expanded into its members: assigning a group means
 * anyone who joins it later gets the track too, and flattening it into names on screen would hide
 * exactly that — the operator would see eleven people and not know the eleven are a consequence.
 */
export type Assignee = {
  id: string;
  assignedAt: Date;
  user: { id: string; name: string; email: string } | null;
  group: { id: string; name: string; _count: { members: number } } | null;
};

export function TrackAssignees({
  trackId,
  assignees,
  people,
  groups,
}: {
  trackId: string;
  assignees: Assignee[];
  people: { id: string; name: string; email: string }[];
  groups: { id: string; name: string; members: number }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That did not work.");
      else {
        setAdding(false);
        setQuery("");
        router.refresh();
      }
    });
  };

  const onTrack = new Set(assignees.map((a) => a.user?.id ?? a.group?.id));
  const term = query.trim().toLowerCase();
  const matches = <T extends { id: string; name: string }>(list: T[]) =>
    list.filter((x) => !onTrack.has(x.id) && (term === "" || x.name.toLowerCase().includes(term)));

  return (
    <div>
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}

      {assignees.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          Nobody is on this track yet, so it is reaching nobody. Add a person or a group below.
        </p>
      ) : (
        <ul className="space-y-2">
          {assignees.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-bold text-navy-800">
                    {a.user?.name ?? a.group?.name}
                  </span>
                  {a.group ? (
                    <span className={CHIP.navy}>
                      group · {a.group._count.members}{" "}
                      {a.group._count.members === 1 ? "person" : "people"}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted">
                  {a.group
                    ? `Anyone who joins this group gets the track too · added ${formatDate(a.assignedAt)}`
                    : `Joined this track ${formatDate(a.assignedAt)}`}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => revokeTrackAction(trackId, a.id))}
                className="flex-none rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people and groups"
            aria-label="Search people and groups"
            autoFocus
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
          />
          <div className="mt-3 max-h-64 overflow-y-auto">
            {matches(groups).length > 0 ? (
              <>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                  Groups
                </p>
                <ul className="mb-3 space-y-1.5">
                  {matches(groups).map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => assignTrackAction(trackId, { groupId: g.id }))}
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-navy-800 hover:border-navy-300 hover:bg-navy-50 disabled:opacity-60"
                      >
                        {g.name}{" "}
                        <span className="font-normal text-muted">
                          · {g.members} {g.members === 1 ? "person" : "people"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
              People
            </p>
            {matches(people).length === 0 ? (
              <p className="text-sm text-muted">Nobody left to add.</p>
            ) : (
              <ul className="space-y-1.5">
                {matches(people)
                  .slice(0, 40)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => assignTrackAction(trackId, { userId: p.id }))}
                        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-[13px] font-semibold text-navy-800 hover:border-navy-300 hover:bg-navy-50 disabled:opacity-60"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setAdding(false)} className={`${BTN_GHOST} mt-3`}>
            Done
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={`${BTN_GHOST} mt-3`}>
          + Add a person or group
        </button>
      )}
    </div>
  );
}
