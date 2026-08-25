"use client";

import { useState } from "react";
import type { AudienceField } from "@/lib/audience/types";
import { TickList, type FieldSpec } from "@/components/audience/AudienceFields";

/**
 * "Who gets this?" as ONE button (mockup-approved 2026-08-25).
 *
 * A compact alternative to `AudienceField_`, not a replacement for it. That component renders one
 * field as its own labelled section, which is right on a course's Access tab where the seven ways
 * of choosing ARE the subject of the screen. On an announcement they are not: the subject is the
 * message, and seven headings with seven hints and seven buttons occupied most of the page before
 * the operator had chosen a single person.
 *
 * So the two share the thing worth sharing — `TickList`, the searchable staged tick-list, imported
 * unchanged — and differ in the wrapper, which is the same call spec 038 made when it declined to
 * force one component to serve both. Learning's screen is untouched by this file existing.
 *
 * The rules the chips carry are unchanged, because they came from real defects: a count belongs to
 * THAT choice and no other, and gold means it reaches nobody today.
 */
export function AudiencePicker({
  fields,
  pending,
  onAdd,
  onRemove,
}: {
  fields: FieldSpec[];
  pending: boolean;
  onAdd: (field: AudienceField, values: string[]) => void;
  onRemove: (field: AudienceField, rowId: string) => void;
}) {
  const [openKind, setOpenKind] = useState<AudienceField | null>(null);
  const [picking, setPicking] = useState(false);

  const active = fields.find((f) => f.field === openKind) ?? null;

  // Every choice already made, across every field, in one flow. The field's label rides along as
  // the small prefix so a bare department name and a bare person's name cannot be confused.
  const chosen = fields.flatMap((f) => f.chosen.map((c) => ({ ...c, field: f.field, kind: f.label })));

  function close() {
    setPicking(false);
    setOpenKind(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((c) => {
          const empty = c.reach === 0;
          return (
            <span
              key={c.rowId}
              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1.5 text-[12px] font-semibold ${
                empty
                  ? "border-gold-300 bg-gold-100 text-gold-800"
                  : "border-navy-200 bg-navy-50 text-navy-700"
              }`}
            >
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] opacity-70">
                {c.kind}
              </span>
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
                onClick={() => onRemove(c.field, c.rowId)}
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
          disabled={pending}
          onClick={() => (picking ? close() : setPicking(true))}
          aria-expanded={picking}
          className="rounded-full border border-dashed border-navy-200 px-3 py-1 text-[11.5px] font-bold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
        >
          {picking ? "cancel" : "+ Add people"}
        </button>
      </div>

      {picking ? (
        <div className="mt-2.5 max-w-[420px] rounded-xl border border-navy-200 bg-surface p-3 shadow-sm">
          <p className="mb-2 text-[12px] font-bold text-navy-800">Add by…</p>
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <button
                key={f.field}
                type="button"
                disabled={pending}
                onClick={() => setOpenKind(openKind === f.field ? null : f.field)}
                title={f.hint}
                className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold disabled:opacity-60 ${
                  openKind === f.field
                    ? "border-navy-800 bg-navy-800 text-white"
                    : "border-line bg-surface text-ink hover:bg-navy-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {active ? (
            <>
              <p className="mt-2 text-[11.5px] text-muted">{active.hint}</p>
              <TickList
                // Remounted per field, so a part-made selection in one kind never carries into
                // another — staging that leaks across kinds is how the wrong people get added.
                key={active.field}
                spec={active}
                pending={pending}
                onAdd={(values) => {
                  onAdd(active.field, values);
                  close();
                }}
              />
            </>
          ) : (
            <p className="mt-2 text-[11.5px] text-muted">Pick one of the above to choose from.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
