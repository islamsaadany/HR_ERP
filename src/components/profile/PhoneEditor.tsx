"use client";

import { useActionState, useState } from "react";
import { updateOwnPhone, type PhoneState } from "@/app/(app)/profile/request-actions";

/**
 * The employee's own phone number, edited in place (spec 029, FR-002a).
 *
 * No request, no review: it is their contact number and nothing reads it for eligibility or
 * money. Save only lights up once the value differs, so there is no way to "save" a no-op.
 */
export function PhoneEditor({ phone }: { phone: string | null }) {
  const initial = phone ?? "";
  const [value, setValue] = useState(initial);
  const [state, formAction, pending] = useActionState<PhoneState, FormData>(updateOwnPhone, null);
  const changed = value.trim() !== initial.trim();

  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted">Phone</div>
      <form action={formAction} className="mt-1 flex flex-wrap items-center gap-2">
        <input
          name="phone"
          type="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="—"
          aria-label="Phone"
          className="w-full max-w-[260px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !changed}
          className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-muted">Yours to change — no HR review.</span>
      </form>
      {state?.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{state.error}</p>
      ) : null}
      {state?.ok && !changed ? (
        <p className="mt-2 text-xs text-green-700">Saved.</p>
      ) : null}
    </div>
  );
}
