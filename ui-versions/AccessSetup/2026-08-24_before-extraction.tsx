"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAccessChoices,
  clearEveryoneRule,
  removeAccessChoice,
  setVisibility,
  type AccessField,
} from "@/app/(app)/admin/learning/access-actions";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT } from "@/components/learning/ui";

/** One thing already chosen, as it is shown on its field. */
export type Choice = {
  /** The audience row id, or the assignment id — whatever removing it needs. */
  rowId: string;
  label: string;
  /** People this ONE choice reaches today. Null for a named person (always themselves). */
  reach: number | null;
};

/** One thing that COULD be chosen, in the tick-list. */
export type Option = {
  value: string;
  label: string;
  hint?: string | null;
  /** People it would reach. Null when we do not count that kind (a named person). */
  reach?: number | null;
  /** Already reached by something else already chosen — shown, but not tickable. */
  covered?: boolean;
};

export type FieldSpec = {
  field: AccessField;
  label: string;
  /** Said once, under the label — what this field actually means. */
  hint: string;
  /** Show a search box. Set for the long lists only. */
  searchable: boolean;
  chosen: Choice[];
  options: Option[];
};

/**
 * "Who takes this course?" — the Access tab (spec 038 follow-up, 2026-08-22, mockup-approved).
 *
 * This replaced a build-a-row box because a course's audience is a SETUP, not a list of records to
 * maintain: you answer one question and the rules fall out of it. Three things follow from that,
 * and each was a real fault in what came before:
 *
 *  • ONE way to say "everyone" — the switch at the top. The old audience dropdown also offered it,
 *    so a course could read "Only certain people" and still reach the whole company.
 *  • Several at once. Adding eight people used to be eight trips through a dropdown of everybody,
 *    each saving the instant the mouse came up, with no way back but Remove.
 *  • A count per choice that is actually that choice's count. The old table printed the combined
 *    total on every row, so a choice reaching nobody looked exactly like one that worked.
 */
export function AccessSetup({
  courseId,
  visibility,
  fields,
  totalReach,
  legacyEveryoneRule,
}: {
  courseId: string;
  visibility: "OPEN" | "RESTRICTED";
  fields: FieldSpec[];
  /** Distinct people reached by everything chosen — never the sum, which double-counts. */
  totalReach: number;
  /** True when this course still carries a pre-2026-08-22 "Everyone" audience rule. */
  legacyEveryoneRule: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openField, setOpenField] = useState<AccessField | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else {
        setOpenField(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-[780px]">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-bold text-navy-800">Who takes this course?</span>
          <span className="inline-flex overflow-hidden rounded-lg border border-navy-200">
            {(["OPEN", "RESTRICTED"] as const).map((v) => (
              <button
                key={v}
                type="button"
                disabled={pending}
                onClick={() => run(() => setVisibility(courseId, v))}
                aria-pressed={visibility === v}
                className={`px-4 py-1.5 text-[12.5px] font-semibold disabled:opacity-60 ${
                  visibility === v
                    ? "bg-navy-800 text-white"
                    : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {v === "OPEN" ? "Everyone" : "Only certain people"}
              </button>
            ))}
          </span>
        </div>

        {legacyEveryoneRule ? (
          <div className="mb-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
            <p className="m-0">
              This course still carries an old <b>&ldquo;Everyone&rdquo;</b> rule from the previous
              screen. While it is there, <b>every active employee gets this course</b> — whatever
              the switch above says.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => clearEveryoneRule(courseId))}
              className={`${BTN_GHOST} mt-2`}
            >
              Remove it
            </button>
          </div>
        ) : null}

        {visibility === "OPEN" ? (
          <p className="text-[12.5px] text-muted">
            Every active employee sees this course once it is published. Nothing else to choose.
          </p>
        ) : (
          <>
            {fields.map((spec) => (
              <Field
                key={spec.field}
                spec={spec}
                courseId={courseId}
                open={openField === spec.field}
                pending={pending}
                onOpen={() => setOpenField(openField === spec.field ? null : spec.field)}
                onRun={run}
              />
            ))}

            <div className="mt-3 flex flex-wrap items-baseline gap-2 border-t border-line pt-3 text-[13px]">
              <span className="text-muted">Right now this reaches</span>
              <b className="font-serif text-[22px] text-navy-800">
                {totalReach} {totalReach === 1 ? "person" : "people"}
              </b>
              <span className="text-muted">
                — fewer than the numbers above add up to, because some people are in more than one.
              </span>
            </div>
          </>
        )}

        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  spec,
  courseId,
  open,
  pending,
  onOpen,
  onRun,
}: {
  spec: FieldSpec;
  courseId: string;
  open: boolean;
  pending: boolean;
  onOpen: () => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  return (
    <div className="border-t border-line py-2.5 first:border-t-0">
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <b className="text-[12px] font-extrabold text-navy-800">{spec.label}</b>
        <span className="text-[11.5px] text-muted">{spec.hint}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {spec.chosen.map((c) => {
          // Gold means this choice reaches NOBODY today — an emptied department, a manager who
          // lost their reports. It is the whole reason the count is on the chip.
          const empty = c.reach === 0;
          return (
            <span
              key={c.rowId}
              className={`inline-flex items-center gap-2 rounded-full border py-1 pl-3 pr-1.5 text-[12px] font-semibold ${
                empty
                  ? "border-gold-300 bg-gold-100 text-gold-800"
                  : "border-navy-200 bg-navy-50 text-navy-700"
              }`}
            >
              {c.label}
              {c.reach !== null ? (
                <span
                  className={`rounded-full border bg-surface px-1.5 text-[10.5px] font-extrabold tabular-nums ${
                    empty ? "border-gold-300 text-gold-800" : "border-navy-100 text-navy-800"
                  }`}
                  title={empty ? "Reaches nobody today" : `${c.reach} people today`}
                >
                  {c.reach}
                </span>
              ) : null}
              <button
                type="button"
                disabled={pending}
                aria-label={`Remove ${c.label}`}
                onClick={() => onRun(() => removeAccessChoice(courseId, spec.field, c.rowId))}
                className={`grid h-4 w-4 place-items-center rounded-full text-[10px] font-extrabold disabled:opacity-60 ${
                  empty ? "bg-gold-300 text-gold-800" : "bg-navy-200 text-navy-800"
                }`}
              >
                ✕
              </button>
            </span>
          );
        })}

        <button
          type="button"
          onClick={onOpen}
          disabled={pending}
          className="rounded-full border border-dashed border-navy-200 px-3 py-1 text-[11.5px] font-bold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
        >
          {open ? "cancel" : "+ add"}
        </button>
      </div>

      {open ? (
        <TickList
          spec={spec}
          pending={pending}
          onAdd={(values) => onRun(() => addAccessChoices(courseId, spec.field, values))}
        />
      ) : null}
    </div>
  );
}

function TickList({
  spec,
  pending,
  onAdd,
}: {
  spec: FieldSpec;
  pending: boolean;
  onAdd: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return spec.options;
    return spec.options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)
    );
  }, [spec.options, query]);

  if (spec.options.length === 0) {
    return (
      <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-[12.5px] text-muted">
        Nothing left to add here.
      </p>
    );
  }

  return (
    <div className="mt-2 max-w-[380px] overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      {spec.searchable ? (
        <div className="flex items-center gap-2 border-b border-line bg-paper px-2.5 py-1.5">
          <span aria-hidden className="text-[12px] text-muted">
            🔍
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to filter…"
            aria-label={`Search ${spec.label}`}
            className={`${INPUT} border-0 bg-transparent px-0 py-0 focus:outline-none`}
          />
          <span className="whitespace-nowrap text-[11px] text-muted">
            {shown.length} of {spec.options.length}
          </span>
        </div>
      ) : null}

      <div className="max-h-[240px] overflow-y-auto">
        {shown.length === 0 ? (
          <p className="px-3 py-3 text-[12.5px] text-muted">Nothing matches &ldquo;{query}&rdquo;.</p>
        ) : (
          shown.map((o) => {
            const on = picked.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                disabled={o.covered}
                onClick={() =>
                  setPicked((p) => (on ? p.filter((v) => v !== o.value) : [...p, o.value]))
                }
                className="flex w-full items-center gap-2.5 border-b border-line px-2.5 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-navy-50/40 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span
                  aria-hidden
                  className={`grid h-[15px] w-[15px] flex-none place-items-center rounded border-[1.5px] text-[10px] text-white ${
                    on ? "border-navy-800 bg-navy-800" : "border-navy-200 bg-surface"
                  } ${o.covered ? "opacity-40" : ""}`}
                >
                  ✓
                </span>
                <span className={`min-w-0 flex-1 ${o.covered ? "text-muted" : ""}`}>
                  <b className="font-semibold">{o.label}</b>
                  {o.hint ? <span className="text-muted"> — {o.hint}</span> : null}
                </span>
                {o.covered ? (
                  <span className={CHIP.muted}>already covered</span>
                ) : o.reach !== null && o.reach !== undefined ? (
                  <span className="text-[11.5px] tabular-nums text-muted">{o.reach}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line bg-paper px-2.5 py-1.5">
        <span className="text-[11.5px] text-muted">{picked.length} selected</span>
        <button
          type="button"
          disabled={pending || picked.length === 0}
          onClick={() => onAdd(picked)}
          className={BTN_NAVY}
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}
