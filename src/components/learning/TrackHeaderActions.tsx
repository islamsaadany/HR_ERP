"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTrackAction, updateTrackAction } from "@/app/(app)/admin/learning/tracks/actions";
import { BTN_GHOST, BTN_NAVY, INPUT, LABEL } from "@/components/learning/ui";

/**
 * Rename or delete a track (spec 043).
 *
 * DELETING SAYS WHAT GOES WITH IT BEFORE IT ASKS, not after — being asked to confirm and then told
 * what you just agreed to is the wrong way round. The important half is what does NOT go: nobody
 * loses a course they have started, because being mid-course is its own route to it.
 */
export function TrackHeaderActions({
  trackId,
  name,
  description,
  peopleCount,
}: {
  trackId: string;
  name: string;
  description: string | null;
  peopleCount: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rename" | "confirm">("idle");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (mode === "rename") {
    return (
      <form
        className="w-[min(420px,100%)] rounded-xl border border-line bg-surface p-4"
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await updateTrackAction(trackId, formData);
            if (!result.ok) setError(result.error);
            else {
              setMode("idle");
              router.refresh();
            }
          });
        }}
      >
        <label className={LABEL} htmlFor="track-rename">
          Name
        </label>
        <input id="track-rename" name="name" defaultValue={name} className={INPUT} autoFocus />
        <label className={`${LABEL} mt-3`} htmlFor="track-redescribe">
          What it is for
        </label>
        <input
          id="track-redescribe"
          name="description"
          defaultValue={description ?? ""}
          className={INPUT}
        />
        {error ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button type="submit" disabled={pending} className={BTN_NAVY}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className={BTN_GHOST}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  if (mode === "confirm") {
    return (
      <div className="w-[min(480px,100%)] rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="m-0 text-[12.5px] text-ink">
          Delete <strong>{name}</strong>?{" "}
          {peopleCount > 0 ? (
            <>
              {peopleCount} {peopleCount === 1 ? "person" : "people"} will stop holding its courses —
              except any they have already started, which they keep until they finish.
            </>
          ) : (
            <>Nobody is on it, so nobody is affected.</>
          )}
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await deleteTrackAction(trackId);
                if (!result.ok) setError(result.error);
                else router.push("/admin/learning/tracks");
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-surface px-3 py-1.5 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete the track"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className={BTN_GHOST}>
            Keep it
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => setMode("rename")} className={BTN_GHOST}>
        Rename
      </button>
      <button
        type="button"
        onClick={() => setMode("confirm")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );
}
