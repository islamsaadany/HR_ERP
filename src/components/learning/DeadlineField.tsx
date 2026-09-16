"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStepDeadlineAction } from "@/app/(app)/admin/learning/tracks/actions";
import { formatDate } from "@/lib/labels";

/**
 * One control for both kinds of deadline (spec 043, mockup-approved 2026-09-16).
 *
 * A step carries EITHER a period in days from the day that person joined the track, OR a fixed
 * calendar date — never both, which the server and a database check constraint both refuse.
 *
 * IT SHOWS THE RESOLVED DATE WHILE YOU EDIT THE RULE. "Within 30 days" is what the operator is
 * setting; "→ 01/10/2026 for somebody joining today" is what it will mean, and without it they are
 * doing the arithmetic in their head to find out whether the deadline they just typed is sane.
 *
 * The date field is a typed text box stating its format, not a native date input: a native picker
 * draws itself in the BROWSER's UI language, which renders dd/mm/yyyy as mm/dd/yyyy under en-GB,
 * ar-EG and en-US alike — so an operator would be typing into a field labelled the wrong way round.
 */
type Kind = "none" | "days" | "date";

export function DeadlineField({
  trackId,
  stepId,
  dueDays,
  dueOn,
}: {
  trackId: string;
  stepId: string;
  dueDays: number | null;
  dueOn: Date | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>(dueDays !== null ? "days" : dueOn !== null ? "date" : "none");
  const [days, setDays] = useState(dueDays !== null ? String(dueDays) : "30");
  const [date, setDate] = useState(dueOn ? dueOn.toISOString().slice(0, 10) : "");

  const label =
    dueDays !== null
      ? `within ${dueDays} day${dueDays === 1 ? "" : "s"}`
      : dueOn !== null
        ? `by ${formatDate(dueOn)}`
        : "no deadline";

  // What the rule means for somebody joining today — the arithmetic done for them.
  const preview = (() => {
    if (kind !== "days") return null;
    const n = Number.parseInt(days, 10);
    if (!Number.isInteger(n) || n < 1) return null;
    const due = new Date();
    due.setUTCHours(0, 0, 0, 0);
    due.setUTCDate(due.getUTCDate() + n);
    return formatDate(due);
  })();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const value = kind === "days" ? days : kind === "date" ? date : "";
      const result = await setStepDeadlineAction(trackId, stepId, kind, value);
      if (!result.ok) setError(result.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex flex-none items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold ${
          dueDays === null && dueOn === null
            ? "border-dashed border-line bg-paper font-medium text-muted hover:border-navy-200 hover:text-navy-700"
            : "border-line bg-paper text-navy-700 hover:border-navy-200"
        }`}
      >
        ⏱ {label}
      </button>
    );
  }

  const seg = (value: Kind, text: string) => (
    <button
      type="button"
      onClick={() => setKind(value)}
      className={`px-3 py-1.5 text-[11.5px] font-semibold ${
        kind === value ? "bg-navy-800 text-white" : "bg-surface text-muted hover:bg-navy-50"
      }`}
    >
      {text}
    </button>
  );

  return (
    <div className="flex-none rounded-xl border border-line bg-surface p-3">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.05em] text-muted">
        Deadline
      </span>
      <div className="inline-flex overflow-hidden rounded-lg border border-line">
        {seg("none", "None")}
        {seg("days", "Within N days")}
        {seg("date", "On a date")}
      </div>

      {kind === "days" ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-20 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
            aria-label="Days from joining the track"
          />
          <span className="text-xs text-muted">
            days from joining
            {preview ? (
              <>
                {" "}
                — <span className="font-semibold text-navy-700">{preview}</span> for somebody
                joining today
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {kind === "date" ? (
        <div className="mt-2">
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder="yyyy-mm-dd"
            className="w-36 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
            aria-label="Deadline date, as yyyy-mm-dd"
          />
          <span className="ml-2 text-xs text-muted">
            the same date for everybody
            {date && !Number.isNaN(new Date(`${date}T00:00:00Z`).getTime()) ? (
              <>
                {" "}
                — <span className="font-semibold text-navy-700">
                  {formatDate(new Date(`${date}T00:00:00Z`))}
                </span>
              </>
            ) : null}
          </span>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
