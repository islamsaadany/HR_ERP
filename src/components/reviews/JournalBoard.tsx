"use client";

import { useActionState, useState } from "react";
import {
  addJournalEntry,
  deleteJournalEntry,
  type ActionResult,
} from "@/app/(app)/reviews/journal/actions";
import { JOURNAL_SECTION_LABEL } from "@/lib/reviews/agenda";

export type JournalRow = {
  id: string;
  body: string;
  section: string | null;
  occurredOnLabel: string;
  occurredOnISO: string;
};

const SECTIONS = ["WENT_WELL", "DIDNT_GO_WELL", "LEARNING", "BLOCKER", "EXPECTATION"];

export function JournalBoard({ entries }: { entries: JournalRow[] }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) =>
      String(formData.get("intent")) === "delete"
        ? deleteJournalEntry(formData)
        : addJournalEntry(formData),
    null
  );

  const today = new Date().toISOString().slice(0, 10);
  const [body, setBody] = useState("");

  return (
    <form action={formAction}>
      {state && !state.ok && (
        <p
          role="alert"
          tabIndex={-1}
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {state.error}
        </p>
      )}

      <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            name="occurredOn"
            defaultValue={today}
            max={today}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
            aria-label="The day it happened"
          />
          <select
            name="section"
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
            aria-label="Tag"
          >
            <option value="">No tag</option>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {JOURNAL_SECTION_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="What happened?"
          className="mt-2 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
        />
        <button
          type="submit"
          name="intent"
          value="add"
          disabled={pending || body.trim() === ""}
          className="mt-2 rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
        >
          Save note
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          Nothing yet. The first note is usually the hardest and the most useful.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3.5 py-2.5">
              <span className="min-w-[84px] shrink-0 pt-0.5 text-[12px] tabular-nums text-muted">
                {e.occurredOnLabel}
              </span>
              {e.section && (
                <span className="shrink-0 rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10px] font-bold text-muted">
                  {JOURNAL_SECTION_LABEL[e.section]}
                </span>
              )}
              <span className="flex-1 text-[13px]">{e.body}</span>
              <button
                type="submit"
                name="intent"
                value="delete"
                disabled={pending}
                onClick={(ev) => {
                  const form = ev.currentTarget.form;
                  const field = form?.querySelector<HTMLInputElement>('input[name="entryId"]');
                  if (field) field.value = e.id;
                }}
                className="shrink-0 text-[11px] font-semibold text-muted hover:text-red-700"
                aria-label={`Delete the note from ${e.occurredOnLabel}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <input type="hidden" name="entryId" defaultValue="" />
    </form>
  );
}
