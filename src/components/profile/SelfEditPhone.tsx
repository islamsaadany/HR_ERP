"use client";

import { useActionState, useEffect, useState } from "react";
import type { SelfEditState } from "@/app/(app)/profile/request-actions";
import { updateOwnPhone } from "@/app/(app)/profile/request-actions";
import { PhoneInput } from "@/components/PhoneInput";
import { splitStoredPhone, countryFlag } from "@/lib/phone";

/**
 * The employee's own phone on My Profile: the SelfEditField pattern (gold Edit → navy Save,
 * red Cancel / Escape) around the country-code PhoneInput. Stored as one sequence
 * ("+201001234567"); shown at rest with its flag so the country is readable at a glance.
 */
export function SelfEditPhone({ value }: { value: string | null }) {
  const initial = value ?? "";
  const [current, setCurrent] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<SelfEditState, FormData>(
    updateOwnPhone,
    null
  );
  const changed = current.trim() !== initial.trim();

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  const cancel = () => {
    setCurrent(initial);
    setEditing(false);
  };

  const parsed = current ? splitStoredPhone(current) : null;
  const display = parsed
    ? `${countryFlag(parsed.country.iso)} +${parsed.country.dial} ${parsed.digits}`
    : current;

  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <div className="text-xs uppercase tracking-wide text-muted">Phone</div>
      {editing ? (
        <form
          action={formAction}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pending) {
              e.preventDefault();
              cancel();
            }
          }}
          className="mt-1 flex flex-wrap items-center gap-2"
        >
          <PhoneInput name="phone" value={current} ariaLabel="Phone" onValueChange={setCurrent} />
          {changed ? (
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-navy-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-navy-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-navy-700"
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <span className={current.trim() === "" ? "text-muted" : "text-ink"}>
            {current.trim() === "" ? "—" : display}
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
      {state?.error && editing ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{state.error}</p>
      ) : null}
      {state?.ok && !editing ? <p className="mt-2 text-xs text-green-700">Saved.</p> : null}
    </div>
  );
}
