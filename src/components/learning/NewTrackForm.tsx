"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTrackAction } from "@/app/(app)/admin/learning/tracks/actions";
import { BTN_NAVY, INPUT, LABEL } from "@/components/learning/ui";

/**
 * Create a track (spec 043).
 *
 * Collapsed until asked for, like the course list's own new-course form, so the page opens as what
 * it mostly is — a list of the tracks that exist.
 */
export function NewTrackForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${BTN_NAVY} mt-5`}>
        + New track
      </button>
    );
  }

  return (
    <form
      className="mt-5 rounded-xl border border-line bg-surface p-4"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await createTrackAction(formData);
          if (!result.ok) setError(result.error);
          else {
            setOpen(false);
            if (result.id) router.push(`/admin/learning/tracks/${result.id}`);
            else router.refresh();
          }
        });
      }}
    >
      <label className={LABEL} htmlFor="track-name">
        Name
      </label>
      <input
        id="track-name"
        name="name"
        className={INPUT}
        placeholder="New consultant — first 90 days"
        autoFocus
      />
      <label className={`${LABEL} mt-3`} htmlFor="track-description">
        What it is for <span className="normal-case tracking-normal">(optional)</span>
      </label>
      <input
        id="track-description"
        name="description"
        className={INPUT}
        placeholder="Everyone joining the consulting team"
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className={BTN_NAVY}>
          {pending ? "Creating…" : "Create track"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
