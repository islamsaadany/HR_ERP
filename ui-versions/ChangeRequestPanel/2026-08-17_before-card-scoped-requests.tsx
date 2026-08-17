"use client";

import { useActionState, useMemo, useState } from "react";
import {
  submitProfileChangeRequest,
  cancelProfileChangeRequest,
  type RequestState,
} from "@/app/(app)/profile/request-actions";
import type { FieldDescriptor } from "@/lib/profile/change-requests";

export type RequestRow = {
  id: string;
  label: string;
  /** The record's value, read now — not what it was when the request was sent. */
  was: string;
  now: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type PanelRequest = {
  id: string;
  submittedAt: string;
  reason: string | null;
  rows: RequestRow[];
};

const CHIP: Record<RequestRow["status"], string> = {
  PENDING: "border border-gold-300 bg-gold-50 text-gold-800",
  APPROVED: "border border-green-200 bg-green-50 text-green-700",
  DECLINED: "border border-red-300 bg-red-50 text-red-700",
};
const CHIP_LABEL: Record<RequestRow["status"], string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  DECLINED: "Declined",
};

/**
 * The employee's half of profile change requests (spec 029, US1): propose a correction, see it
 * waiting, and see HR's decision per field.
 *
 * The form is mounted only while open, so cancelling and reopening always starts from the record
 * as it stands rather than from a half-edited draft.
 */
export function ChangeRequestPanel({
  descriptors,
  open,
  decided,
}: {
  descriptors: FieldDescriptor[];
  open: PanelRequest | null;
  decided: PanelRequest | null;
}) {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg text-ink">Change requests</h2>
        {open ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CHIP.PENDING}`}>
            Awaiting HR
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">
        Ask HR to correct your emergency contact or personal details. Nothing changes until they
        approve it.
      </p>

      {open ? (
        <div className="mt-4">
          <RequestRows rows={open.rows} />
          {open.reason ? (
            <p className="mt-3 text-xs text-muted">Your note: “{open.reason}”</p>
          ) : null}
          <form action={cancelProfileChangeRequest} className="mt-3">
            <input type="hidden" name="id" value={open.id} />
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600"
            >
              Withdraw request
            </button>
          </form>
        </div>
      ) : formOpen ? (
        <RequestForm descriptors={descriptors} onClose={() => setFormOpen(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          Request a change
        </button>
      )}

      {decided ? (
        <div className="mt-6 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">Your last request</h3>
            <span className="text-xs text-muted">Sent {decided.submittedAt}</span>
          </div>
          <RequestRows rows={decided.rows} />
        </div>
      ) : null}
    </section>
  );
}

function RequestRows({ rows }: { rows: RequestRow[] }) {
  return (
    <ul className="mt-2 divide-y divide-line">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-muted">{row.label}</div>
            <div className="mt-0.5 text-sm text-ink">
              {row.status === "APPROVED" ? null : (
                <>
                  <span className="text-muted line-through">{row.was}</span>
                  <span className="px-1.5 text-muted">→</span>
                </>
              )}
              <span className="font-semibold">{row.now}</span>
            </div>
            {row.reason ? (
              <p className="mt-1 text-xs text-muted">“{row.reason}”</p>
            ) : null}
            {row.decidedBy && row.decidedAt ? (
              <p className="mt-1 text-[11px] text-muted">
                {row.decidedBy} · {row.decidedAt}
              </p>
            ) : null}
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CHIP[row.status]}`}>
            {CHIP_LABEL[row.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RequestForm({
  descriptors,
  onClose,
}: {
  descriptors: FieldDescriptor[];
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<RequestState, FormData>(
    submitProfileChangeRequest,
    null
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(descriptors.map((d) => [d.key, d.current]))
  );

  const changedKeys = useMemo(
    () => descriptors.filter((d) => (values[d.key] ?? "").trim() !== d.current.trim()).map((d) => d.key),
    [descriptors, values]
  );

  const groups = useMemo(() => {
    const map = new Map<string, FieldDescriptor[]>();
    for (const d of descriptors) {
      const list = map.get(d.group) ?? [];
      list.push(d);
      map.set(d.group, list);
    }
    return [...map.entries()];
  }, [descriptors]);

  const input =
    "w-full max-w-[320px] rounded-lg border bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  // No success branch here on purpose: a recorded request re-renders the page with `open` set,
  // so the panel replaces this form with the pending list. The "Awaiting HR" state IS the receipt.

  return (
    <form action={formAction} className="mt-4">
      <p className="text-sm text-muted">Edit what is wrong. Fields you do not touch are not sent.</p>
      {groups.map(([group, fields]) => (
        <div key={group} className="mt-4">
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-navy-700">{group}</div>
          {fields.map((d) => {
            const changed = changedKeys.includes(d.key);
            const cls = `${input} ${changed ? "border-gold-300 bg-gold-50" : "border-line"}`;
            return (
              <div key={d.key} className="mt-3">
                <label htmlFor={`req-${d.key}`} className="mb-1 block text-xs uppercase tracking-wide text-muted">
                  {d.label}
                </label>
                {d.input === "select" ? (
                  <select
                    id={`req-${d.key}`}
                    name={d.key}
                    value={values[d.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                    className={cls}
                  >
                    {(d.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`req-${d.key}`}
                    name={d.key}
                    type={d.input === "date" ? "date" : d.input === "tel" ? "tel" : "text"}
                    value={values[d.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [d.key]: e.target.value }))}
                    className={cls}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="mt-4">
        <label htmlFor="req-reason" className="mb-1 block text-xs uppercase tracking-wide text-muted">
          Reason (optional)
        </label>
        <input
          id="req-reason"
          name="reason"
          placeholder="e.g. she changed her number"
          className={`${input} border-line`}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || changedKeys.length === 0}
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
        >
          {pending
            ? "Sending…"
            : changedKeys.length === 0
              ? "Nothing changed yet"
              : `Send ${changedKeys.length} change${changedKeys.length === 1 ? "" : "s"} to HR`}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-4 py-2 text-sm text-muted hover:bg-navy-50"
        >
          Cancel
        </button>
      </div>

      {state?.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
