"use client";

import { useMemo, useState } from "react";
import type { AudienceField } from "@/lib/audience/types";
import { BTN_NAVY, CHIP, INPUT } from "@/components/learning/ui";

/**
 * The chips-and-tick-list picker for "who does this reach" — SHARED.
 *
 * Written for a course's Access tab (spec 038, mockup-approved 2026-08-22) and extracted here on
 * 2026-08-24 when an announcement needed to ask the same question. What is shared is the
 * INTERACTION: a field holds chips of what is chosen with each one's own live count, `+ add` opens
 * a searchable tick-list, several are picked and staged, one Add commits them.
 *
 * What is NOT shared is the wrapper, and deliberately so. A course has an Everyone/Only-certain
 * switch and a legacy-rule warning; a message has neither and has a send confirmation instead.
 * Forcing one component to serve both would have meant a prop for every difference — the kind of
 * sharing that costs more than the duplication it removes.
 *
 * The two rules the design carries, both of which came from a real defect:
 *   · a chip's count is THAT choice's count, and gold when it reaches nobody — a choice reaching
 *     nobody used to look identical to one that worked;
 *   · nothing saves until Add is pressed — the controls this replaced committed the instant a
 *     dropdown changed, with no way back but Remove.
 */

export type Choice = {
  /** The stored row's id — whatever removing it needs. */
  rowId: string;
  label: string;
  /** People this ONE choice reaches today. Null where a count is meaningless (a named person). */
  reach: number | null;
};

export type Option = {
  value: string;
  label: string;
  hint?: string | null;
  reach?: number | null;
  /** Already reached by something else chosen — shown, but not tickable. */
  covered?: boolean;
};

export type FieldSpec = {
  field: AudienceField;
  label: string;
  hint: string;
  /** A search box, for the long lists only. Two business units do not need one. */
  searchable: boolean;
  chosen: Choice[];
  options: Option[];
};

export function AudienceField_({
  spec,
  open,
  pending,
  onOpen,
  onAdd,
  onRemove,
}: {
  spec: FieldSpec;
  open: boolean;
  pending: boolean;
  onOpen: () => void;
  onAdd: (field: AudienceField, values: string[]) => void;
  onRemove: (field: AudienceField, rowId: string) => void;
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
          // lost their reports. It is the whole reason the count sits on the chip.
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
                onClick={() => onRemove(spec.field, c.rowId)}
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
        <TickList spec={spec} pending={pending} onAdd={(values) => onAdd(spec.field, values)} />
      ) : null}
    </div>
  );
}

export function TickList({
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
      (o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q)
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
