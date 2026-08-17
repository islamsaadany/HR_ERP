"use client";

import { useActionState, useEffect, useState } from "react";
import type { SelfEditState } from "@/app/(app)/profile/request-actions";

/**
 * A field the employee edits directly on My Profile — no request, no HR review (spec 029,
 * FR-002a/FR-002b). One component for both cases (phone, legal name).
 *
 * The field rests as a plain value with a light-gold Edit button; pressing it opens the input
 * and the button becomes a navy Save (mockup-approved 2026-08-17). Saving — or pressing Save
 * with nothing changed — locks it back to Edit, so the card reads as data, not as a form.
 */
export function SelfEditField({
  label,
  name,
  type = "text",
  value,
  placeholder,
  hint,
  action,
}: {
  label: string;
  /** The form field name the server action reads. */
  name: string;
  type?: "text" | "tel";
  value: string | null;
  placeholder?: string;
  /** Optional helper line under the input (e.g. what "legal name" means). */
  hint?: string;
  action: (prev: SelfEditState, formData: FormData) => Promise<SelfEditState>;
}) {
  const initial = value ?? "";
  const [current, setCurrent] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<SelfEditState, FormData>(action, null);
  const changed = current.trim() !== initial.trim();

  // A successful save closes the editor — the same button that saved reads Edit again.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      {editing ? (
        <form action={formAction} className="mt-1 flex flex-wrap items-center gap-2">
          <input
            name={name}
            type={type}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder={placeholder ?? "—"}
            aria-label={label}
            autoFocus
            className="w-full max-w-[260px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
          />
          {changed ? (
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-navy-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          ) : (
            // Nothing changed: "saving" is just closing. No server round trip for a no-op.
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-navy-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-navy-700"
            >
              Save
            </button>
          )}
        </form>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className={current.trim() === "" ? "text-muted" : "text-ink"}>
            {current.trim() === "" ? "—" : current}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-gold-300 bg-gold-100 px-3.5 py-1.5 text-xs font-bold text-gold-800 hover:bg-gold-200"
          >
            Edit
          </button>
        </div>
      )}
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
      {state?.error && editing ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{state.error}</p>
      ) : null}
      {state?.ok && !editing ? <p className="mt-2 text-xs text-green-700">Saved.</p> : null}
    </div>
  );
}
