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
 * The SITTING store — module scope, so it survives any component remount the framework
 * performs after a save/refresh, and resets only on a full page load. Touched exclusively
 * from effects/handlers (client-side), never during render, so SSR can't leak it between
 * users. This is what guarantees the live-testing bugs stay dead: rows never vanish and
 * answered chips never reset while the person is mid-sitting.
 */
let sittingGroups: DataRequestGroup[] | null = null;
let sittingClosed = false;
const sittingAnswers = new Map<string, { value: string; confirmed: boolean }>();

/**
 * The data-request popup (spec 033, reworked after live testing 2026-08-17):
 *
 * EVERY ACTION IS PER FIELD. Each field is its own little form — ✓ Confirm saves it on the
 * spot, Edit opens the input, Save (or pressing Enter in the input) saves that one field.
 * Answered fields STAY VISIBLE with a green chip instead of vanishing, so the employee sees
 * everything they did in this sitting. The bottom buttons only close: Finish (done) and
 * Later (come back) — nothing down there submits.
 *
 * The field list is FROZEN at open (the server's shrinking pending list must not yank rows
 * out from under the person mid-session); the server still re-checks every save, and the
 * sidebar count follows the server truth.
 */
export function DataRequestLayer({ groups }: { groups: DataRequestGroup[] }) {
  // What this sitting shows. Starts empty and is fed by the merge effect below — never
  // directly by the shrinking server prop, so answered rows don't vanish mid-sitting.
  const [frozen, setFrozen] = useState<DataRequestGroup[]>([]);
  const [open, setOpen] = useState(false);

  // THE MERGE — new asks join the sitting, re-earn attention (auto-open), and answered rows
  // stay because keys are never removed here. Fed from two sources: the layout prop (first
  // paint) and the POLL below — the dead-badge bug (live, 2026-08-17) proved a campaign
  // launched mid-session never arrives through layout props at all (layouts do not re-render
  // on client-side navigation), so the layer must fetch its own truth.
  const mergeIncoming = (incoming: DataRequestGroup[]) => {
    if (!sittingGroups) sittingGroups = [];
    const known = new Set(sittingGroups.flatMap((g) => g.descriptors.map((d) => d.key)));
    let added = false;
    for (const g of incoming) {
      const fresh = g.descriptors.filter((d) => !known.has(d.key));
      if (fresh.length === 0) continue;
      fresh.forEach((d) => known.add(d.key));
      const existing = sittingGroups.find((x) => x.campaignId === g.campaignId);
      if (existing) existing.descriptors = [...existing.descriptors, ...fresh];
      else sittingGroups.push({ ...g, descriptors: fresh });
      added = true;
    }
    if (added) sittingClosed = false;
    if (sittingGroups.length > 0) {
      setFrozen(sittingGroups.map((g) => ({ ...g, descriptors: [...g.descriptors] })));
      if (!sittingClosed) setOpen(true);
    }
  };

  useEffect(() => {
    mergeIncoming(groups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  // THE POLL — on mount, on returning to the tab, and every 30s: fetch the live summary,
  // merge any new asks, and keep the sidebar badge count honest via a broadcast the shell
  // listens for. This is what makes a campaign launched mid-session reach the employee.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/api/profile/data-requests", { cache: "no-store" });
        if (!res.ok || !alive) return;
        const summary = (await res.json()) as { pendingCount?: number; groups?: DataRequestGroup[] };
        if (!alive) return;
        window.dispatchEvent(
          new CustomEvent("hrerp:data-request-count", { detail: summary.pendingCount ?? 0 })
        );
        if (summary.groups && summary.groups.length > 0) mergeIncoming(summary.groups);
      } catch {
        // Offline / transient — the next tick tries again.
      }
    };
    pull();
    const interval = setInterval(pull, 30_000);
    const onFocus = () => pull();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const reopen = () => {
      sittingClosed = false;
      setOpen(true);
    };
    window.addEventListener(OPEN_DATA_REQUESTS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_DATA_REQUESTS_EVENT, reopen);
  }, []);

  const close = () => {
    sittingClosed = true;
    setOpen(false);
  };

  if (frozen.length === 0 || !open) return null;

  const descriptors = frozen.flatMap((g) => g.descriptors);
  const toFill = descriptors.filter((d) => d.current === "").length;
  const toVerify = descriptors.length - toFill;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 sm:p-8">
      <div className="my-auto w-full max-w-xl rounded-2xl bg-surface p-6 shadow-2xl">
        <h2 className="font-serif text-xl text-ink">HR asked you to complete your profile</h2>
        <p className="mt-1 text-sm text-muted">
          {toFill > 0 ? `${toFill} field${toFill === 1 ? "" : "s"} to fill` : null}
          {toFill > 0 && toVerify > 0 ? " · " : null}
          {toVerify > 0 ? `${toVerify} to verify` : null} — each answer saves on its own and goes
          straight to your profile.
        </p>

        {frozen.map((g) => (
          <div key={g.campaignId}>
            <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-gold-600">
              {g.title}
            </p>
            <div className="divide-y divide-line">
              {g.descriptors.map((d) => (
                <FieldForm key={d.key} d={d} />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
          >
            Finish
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-navy-50"
          >
            Later
          </button>
          <span className="text-xs text-muted">
            Anything unanswered stays in your sidebar until it&apos;s done.
          </span>
        </div>
      </div>
    </div>
  );
}

const INPUT =
  "w-full max-w-[320px] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

/**
 * One field = one form. Confirm/Save submit ONLY this field (the server action ignores
 * everything not in the form), so Enter in the input saves this field and nothing else.
 */
function FieldForm({ d }: { d: CampaignFieldDescriptor }) {
  const [state, formAction, pending] = useActionState<AnswerState, FormData>(
    answerDataRequests,
    null
  );
  const isPrefilled = d.current !== "";
  const [value, setValue] = useState(d.current);
  const [editing, setEditing] = useState(!isPrefilled);
  // What this sitting saved, remembered locally AND in the module-scope sitting store, so a
  // component remount after the save/refresh can never reset an answered row to actionable.
  const [saved, setSaved] = useState<null | { value: string; confirmed: boolean }>(null);
  // Set while re-editing an already-answered row — Cancel restores this answer.
  const [prevAnswer, setPrevAnswer] = useState<null | { value: string; confirmed: boolean }>(null);

  useEffect(() => {
    const remembered = sittingAnswers.get(d.key);
    if (remembered) setSaved(remembered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state?.ok) {
      const answer = { value, confirmed: isPrefilled && value === d.current };
      sittingAnswers.set(d.key, answer);
      setSaved(answer);
      setPrevAnswer(null);
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (saved) {
    return (
      <div className="py-3">
        <div className="text-xs uppercase tracking-wide text-muted">{d.label}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink" dir={d.dir} lang={d.dir ? "ar" : undefined}>
            {displayValue(d, saved.value)}
          </span>
          <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-bold text-green-700">
            {saved.confirmed ? "✓ Confirmed" : "✓ Saved"}
          </span>
          {/* Confirmed by mistake? Re-open and re-save — the server takes the latest answer. */}
          <button
            type="button"
            onClick={() => {
              setPrevAnswer(saved);
              sittingAnswers.delete(d.key);
              setSaved(null);
              setEditing(true);
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:bg-navy-50"
          >
            Edit
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="py-3">
      <div className="text-xs uppercase tracking-wide text-muted">
        {d.label}
        {isPrefilled ? " — confirm it's right" : <span className="text-red-600"> *</span>}
      </div>

      {isPrefilled && !editing ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink" dir={d.dir} lang={d.dir ? "ar" : undefined}>
            {displayValue(d, d.current)}
          </span>
          {/* Confirm = submit this field with its current value. */}
          <input type="hidden" name={d.key} value={d.current} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-100 disabled:opacity-40"
          >
            {pending ? "Confirming…" : "✓ Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:bg-navy-50"
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <FieldInput d={d} value={value} onChange={setValue} />
          </div>
          <button
            type="submit"
            disabled={pending || value.trim() === ""}
            className="rounded-lg bg-navy-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-navy-700 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {isPrefilled || prevAnswer ? (
            <button
              type="button"
              onClick={() => {
                if (prevAnswer) {
                  // Re-edit abandoned: restore the answered chip exactly as it was.
                  sittingAnswers.set(d.key, prevAnswer);
                  setValue(prevAnswer.value);
                  setSaved(prevAnswer);
                  setPrevAnswer(null);
                } else {
                  setValue(d.current);
                }
                setEditing(false);
              }}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700"
            >
              Cancel
            </button>
          ) : null}
        </div>
      )}

      {d.hint ? <p className="mt-1 text-xs text-muted">{d.hint}</p> : null}
      {state?.error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}

function displayValue(d: CampaignFieldDescriptor, raw: string): string {
  if (d.input === "select") {
    return d.options?.find((o) => o.value === raw)?.label ?? raw;
  }
  if (d.input === "dependants") {
    try {
      const list = JSON.parse(raw) as { name: string | null; kind: string }[];
      return list.map((x) => x.name ?? (x.kind === "SPOUSE" ? "Spouse" : "Child")).join(", ") || "None";
    } catch {
      return raw;
    }
  }
  return raw;
}

function FieldInput({
  d,
  value,
  onChange,
}: {
  d: CampaignFieldDescriptor;
  value: string;
  onChange: (value: string) => void;
}) {
  if (d.input === "phone") {
    return (
      <>
        <input type="hidden" name={d.key} value={value} />
        <PhoneInput name={`${d.key}__ui`} value={value} ariaLabel={d.label} onValueChange={onChange} />
      </>
    );
  }
  if (d.input === "dependants") {
    return (
      <>
        <input type="hidden" name={d.key} value={value} />
        <DependantsListEditor initial={d.current} onChange={onChange} />
      </>
    );
  }
  if (d.input === "select") {
    return (
      <select
        name={d.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      name={d.key}
      type={d.input === "date" ? "date" : d.input === "tel" ? "tel" : "text"}
      inputMode={d.key === "nationalId" ? "numeric" : undefined}
      maxLength={d.key === "nationalId" ? 14 : 120}
      dir={d.dir}
      lang={d.dir ? "ar" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={d.label}
      className={INPUT}
    />
  );
}
