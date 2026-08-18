"use client";

import { useMemo, useState } from "react";
import { countWorkingDays, isWeekend, dayKey } from "@/lib/workdays";
import { createLeaveRequest } from "@/app/(app)/time-off/actions";

export type ExistingRange = {
  startISO: string; // yyyy-mm-dd
  endISO: string;
  label: string; // "dd/mm/yyyy → dd/mm/yyyy"
  status: "PENDING" | "APPROVED";
};

/**
 * The request form (spec 035): previews the WORKING-day cost live as dates are picked
 * (mirroring the server's countWorkingDays exactly — same pure module), and warns — never
 * blocks — when the range overlaps the employee's own pending/approved requests (FR-005).
 * The server remains authoritative: validation and the zero-working-day refusal live in
 * the action.
 */
export function TimeOffRequestForm({
  holidays,
  existing,
}: {
  /** Listed public holidays as { iso: yyyy-mm-dd, name } — for the count and the breakdown. */
  holidays: { iso: string; name: string }[];
  existing: ExistingRange[];
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => h.iso)), [holidays]);

  const preview = useMemo(() => {
    if (!start || !end) return null;
    const s = new Date(`${start}T00:00:00.000Z`);
    const e = new Date(`${end}T00:00:00.000Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return null;
    const calendar = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    let weekendDays = 0;
    const hitHolidays: string[] = [];
    const cursor = new Date(s);
    while (cursor.getTime() <= e.getTime()) {
      if (isWeekend(cursor)) weekendDays += 1;
      else if (holidaySet.has(dayKey(cursor))) {
        hitHolidays.push(holidays.find((h) => h.iso === dayKey(cursor))?.name ?? dayKey(cursor));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const working = countWorkingDays(s, e, holidaySet);
    const overlaps = existing.filter(
      (r) => new Date(`${r.startISO}T00:00:00.000Z`) <= e && s <= new Date(`${r.endISO}T00:00:00.000Z`)
    );
    return { calendar, weekendDays, hitHolidays, working, overlaps };
  }, [start, end, holidaySet, holidays, existing]);

  return (
    <form action={createLeaveRequest} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="timeoff-startDate" className="mb-1 block text-xs uppercase tracking-wide text-muted">
          Start date
        </label>
        <input
          id="timeoff-startDate"
          name="startDate"
          type="date"
          min={today}
          required
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="timeoff-endDate" className="mb-1 block text-xs uppercase tracking-wide text-muted">
          End date
        </label>
        <input
          id="timeoff-endDate"
          name="endDate"
          type="date"
          min={start || today}
          required
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        />
      </div>

      {preview ? (
        <div className="sm:col-span-2">
          {/* Navy = informational (house semantics; gold is reserved for notices like the
              overlap warning below) — user-approved 2026-08-18. */}
          <span className="inline-block rounded-full bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy-700">
            {preview.working} working day{preview.working === 1 ? "" : "s"}
            <span className="font-normal">
              {" "}
              — {preview.calendar} calendar day{preview.calendar === 1 ? "" : "s"}
              {preview.weekendDays > 0 ? ` minus ${preview.weekendDays} weekend day${preview.weekendDays === 1 ? "" : "s"}` : ""}
              {preview.hitHolidays.length > 0 ? ` minus ${preview.hitHolidays.join(", ")}` : ""}
            </span>
          </span>
          {preview.working === 0 ? (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              That range has no working days — it's all weekend or public holidays.
            </p>
          ) : null}
          {preview.overlaps.length > 0 ? (
            <div className="mt-2 rounded-r-lg border-l-2 border-gold-500 bg-gold-100 px-3 py-2 text-xs text-gold-800">
              ⚠ Overlaps your{" "}
              {preview.overlaps
                .map((o) => `${o.status === "APPROVED" ? "approved" : "pending"} request ${o.label}`)
                .join(" and ")}{" "}
              — you can still submit; your manager will see both.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sm:col-span-2">
        <label htmlFor="timeoff-note" className="mb-1 block text-xs uppercase tracking-wide text-muted">
          Note (optional)
        </label>
        <input id="timeoff-note" name="note" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      </div>
      <div className="sm:col-span-2">
        <button className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
          Submit request
        </button>
      </div>
    </form>
  );
}
