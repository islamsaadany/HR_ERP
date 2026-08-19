"use client";

import { useState } from "react";
import { moveHoliday } from "./actions";

/**
 * The move control on a holiday row (spec 037): a button that opens two date inputs in
 * place, so the list doesn't carry a permanently open form on every row.
 *
 * A past-dated holiday must be confirmed explicitly, because moving it rewrites how many
 * days off everyone is recorded as having taken. The server enforces the same rule — this
 * checkbox only makes the consequence visible before the click.
 */
export function MoveHolidayForm({
  id,
  name,
  startISO,
  endISO,
  isPast,
  label = "Move",
}: {
  id: string;
  name: string;
  startISO: string;
  endISO: string;
  isPast: boolean;
  /** "Apply as move" when the suggestion list offers a fetched date. */
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-navy-200 px-2.5 py-1 text-[11px] font-semibold text-navy-700 hover:bg-navy-50"
      >
        {label}
      </button>
    );
  }

  return (
    <form action={moveHoliday} className="mt-1 w-full rounded-lg border border-line bg-paper p-3">
      <input type="hidden" name="id" value={id} />
      <p className="mb-2 text-[11.5px] text-muted">
        Set the days <b className="text-ink">{name}</b> will actually be observed — the announced
        dates stay on record.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <label htmlFor={`ms-${id}`} className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
            First day
          </label>
          <input
            id={`ms-${id}`}
            name="start"
            type="date"
            defaultValue={startISO}
            required
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>
        <div className="min-w-[140px] flex-1">
          <label htmlFor={`me-${id}`} className="mb-1 block text-[10px] uppercase tracking-wide text-muted">
            Last day
          </label>
          <input
            id={`me-${id}`}
            name="end"
            type="date"
            defaultValue={endISO}
            required
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>
      </div>

      {isPast ? (
        <label className="mt-2 flex items-start gap-2 rounded-lg border border-gold-300 bg-gold-100 p-2 text-[11.5px] text-gold-800">
          <input type="checkbox" name="confirmPast" value="1" required className="mt-0.5" />
          <span>
            This holiday has already passed — changing it changes how many days off everyone is
            recorded as having taken in that year. I understand.
          </span>
        </label>
      ) : null}

      <div className="mt-2 flex gap-2">
        <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-navy-700">
          Save new dates
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-semibold text-muted hover:border-navy-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
