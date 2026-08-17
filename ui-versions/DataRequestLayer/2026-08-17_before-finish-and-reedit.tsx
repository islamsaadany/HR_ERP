"use client";

import { useActionState, useEffect, useState } from "react";
import { answerDataRequests, type AnswerState } from "@/app/(app)/profile/campaign-actions";
import type { DataRequestGroup } from "@/lib/profile/campaigns";
import type { CampaignFieldDescriptor } from "@/lib/profile/campaign-fields";
import { PhoneInput } from "@/components/PhoneInput";
import { DependantsListEditor } from "@/components/profile/DependantsListEditor";

/** Fired by the sidebar notice; the layer listens and re-opens the popup. */
export const OPEN_DATA_REQUESTS_EVENT = "hrerp:open-data-requests";

/**
 * The data-request popup (spec 033, US1/US3, mockup-approved): opens once per full page load
 * while fields are pending, merged across campaigns (each group under its campaign title).
 * A field is SENT only once the employee engages with it — prefilled fields via ✓ Confirm or
 * Edit, empty fields by typing — so partial saves are natural and untouched fields stay
 * pending. "Later" closes it; the sidebar notice re-opens it.
 */
export function DataRequestLayer({ groups }: { groups: DataRequestGroup[] }) {
  const [open, setOpen] = useState(true);
  const [state, formAction, pending] = useActionState<AnswerState, FormData>(
    answerDataRequests,
    null
  );
  const descriptors = groups.flatMap((g) => g.descriptors);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(descriptors.map((d) => [d.key, d.current]))
  );
  // A field participates in the submit only once engaged (its input then carries a name).
  const [engaged, setEngaged] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_DATA_REQUESTS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_DATA_REQUESTS_EVENT, reopen);
  }, []);

  // A successful save re-renders the server layout; if fields remain (partial save), the
  // fresh layer replaces this one. Close so the employee is not shown a stale form.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (!open) return null;

  const engagedCount = Object.values(engaged).filter(Boolean).length;
  const toFill = descriptors.filter((d) => d.current === "").length;
  const toVerify = descriptors.length - toFill;

  const engage = (key: string, value?: string) => {
    setEngaged((e) => ({ ...e, [key]: true }));
    if (value !== undefined) setValues((v) => ({ ...v, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 sm:p-8">
      <div className="my-auto w-full max-w-xl rounded-2xl bg-surface p-6 shadow-2xl">
        <h2 className="font-serif text-xl text-ink">HR asked you to complete your profile</h2>
        <p className="mt-1 text-sm text-muted">
          {toFill > 0 ? `${toFill} field${toFill === 1 ? "" : "s"} to fill` : null}
          {toFill > 0 && toVerify > 0 ? " · " : null}
          {toVerify > 0 ? `${toVerify} to verify` : null} — saved answers go straight to your
          profile.
        </p>

        <form action={formAction}>
          {groups.map((g) => (
            <div key={g.campaignId}>
              <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-gold-600">
                {g.title}
              </p>
              <div className="divide-y divide-line">
                {g.descriptors.map((d) => (
                  <FieldBlock
                    key={d.key}
                    d={d}
                    value={values[d.key] ?? ""}
                    engaged={!!engaged[d.key]}
                    onEngage={engage}
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending || engagedCount === 0}
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {pending
                ? "Saving…"
                : engagedCount === 0
                  ? "Nothing answered yet"
                  : `Save ${engagedCount} answer${engagedCount === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-navy-50"
            >
              Later
            </button>
            <span className="text-xs text-muted">You can save some now and the rest later.</span>
          </div>
          {state?.error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

const INPUT =
  "w-full max-w-[320px] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

function FieldBlock({
  d,
  value,
  engaged,
  onEngage,
}: {
  d: CampaignFieldDescriptor;
  value: string;
  engaged: boolean;
  onEngage: (key: string, value?: string) => void;
}) {
  const isPrefilled = d.current !== "";
  // Confirmed = engaged with the value still equal to the record's.
  const confirmed = engaged && value === d.current && isPrefilled;
  const [editing, setEditing] = useState(!isPrefilled);

  return (
    <div className="py-3">
      <div className="text-xs uppercase tracking-wide text-muted">
        {d.label}
        {isPrefilled ? " — confirm it's right" : <span className="text-red-600"> *</span>}
      </div>

      {isPrefilled && !editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink" dir={d.dir} lang={d.dir ? "ar" : undefined}>
            {displayCurrent(d)}
          </span>
          {confirmed ? (
            <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">
              ✓ Confirmed
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onEngage(d.key, d.current)}
                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100"
              >
                ✓ Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  onEngage(d.key);
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:bg-navy-50"
              >
                Edit
              </button>
            </>
          )}
          {/* The confirmed value still has to travel with the form. */}
          {engaged ? <input type="hidden" name={d.key} value={value} /> : null}
        </div>
      ) : (
        <div className="mt-1">
          <FieldInput d={d} value={value} engaged={engaged} onEngage={onEngage} />
        </div>
      )}
      {d.hint ? <p className="mt-1 text-xs text-muted">{d.hint}</p> : null}
    </div>
  );
}

function displayCurrent(d: CampaignFieldDescriptor): string {
  if (d.input === "select") {
    return d.options?.find((o) => o.value === d.current)?.label ?? d.current;
  }
  if (d.input === "dependants") {
    try {
      const list = JSON.parse(d.current) as { name: string | null; kind: string }[];
      return list.map((x) => x.name ?? (x.kind === "SPOUSE" ? "Spouse" : "Child")).join(", ") || "None";
    } catch {
      return d.current;
    }
  }
  return d.current;
}

function FieldInput({
  d,
  value,
  engaged,
  onEngage,
}: {
  d: CampaignFieldDescriptor;
  value: string;
  engaged: boolean;
  onEngage: (key: string, value?: string) => void;
}) {
  // Inputs carry a `name` only once engaged, so untouched fields never submit (FR-008).
  const name = engaged ? d.key : undefined;

  if (d.input === "phone") {
    return (
      <>
        {engaged ? <input type="hidden" name={d.key} value={value} /> : null}
        <PhoneInput
          name={`${d.key}__ui`}
          value={value}
          ariaLabel={d.label}
          onValueChange={(v) => onEngage(d.key, v)}
        />
      </>
    );
  }
  if (d.input === "dependants") {
    return (
      <>
        {engaged ? <input type="hidden" name={d.key} value={value} /> : null}
        <DependantsListEditor initial={d.current} onChange={(v) => onEngage(d.key, v)} />
      </>
    );
  }
  if (d.input === "select") {
    return (
      <select
        name={name}
        value={value}
        onChange={(e) => onEngage(d.key, e.target.value)}
        aria-label={d.label}
        className={INPUT}
      >
        {(d.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      name={name}
      type={d.input === "date" ? "date" : d.input === "tel" ? "tel" : "text"}
      inputMode={d.key === "nationalId" ? "numeric" : undefined}
      maxLength={d.key === "nationalId" ? 14 : 120}
      dir={d.dir}
      lang={d.dir ? "ar" : undefined}
      value={value}
      onChange={(e) => onEngage(d.key, e.target.value)}
      aria-label={d.label}
      className={INPUT}
    />
  );
}
