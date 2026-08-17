"use client";

import { useActionState, useState } from "react";
import type { SelfEditState } from "@/app/(app)/profile/request-actions";

/**
 * A field the employee edits directly on My Profile — no request, no HR review (spec 029,
 * FR-002a). One component for both cases (phone, legal name): the gold "You edit" tag marks it
 * as self-edit against the card's HR-managed default, and Save only lights up once the value
 * differs, so there is no way to "save" a no-op.
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
  const [state, formAction, pending] = useActionState<SelfEditState, FormData>(action, null);
  const changed = current.trim() !== initial.trim();

  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
        {label}
        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-gold-800">
          You edit
        </span>
      </div>
      <form action={formAction} className="mt-1 flex flex-wrap items-center gap-2">
        <input
          name={name}
          type={type}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={placeholder ?? "—"}
          aria-label={label}
          className="w-full max-w-[260px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !changed}
          className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
      {state?.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{state.error}</p>
      ) : null}
      {state?.ok && !changed ? <p className="mt-2 text-xs text-green-700">Saved.</p> : null}
    </div>
  );
}
