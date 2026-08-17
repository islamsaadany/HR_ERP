"use client";

import { useActionState, useState } from "react";
import {
  approveProfileField,
  declineProfileField,
  type DecisionState,
} from "@/app/(app)/admin/employees/change-request-actions";

export type QueueField = {
  id: string;
  label: string;
  /** Read at review time, never stored on the request (FR-010). */
  current: string;
  requested: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
};

export type QueueRequest = {
  id: string;
  employeeName: string;
  employeeEmail: string;
  employeeTitle: string | null;
  employeeHasLeft: boolean;
  submittedAt: string;
  reason: string | null;
  /**
   * Labels of the people covered by the employee's committed medical premium — set only when
   * this request proposes a dependant change AND a commitment exists (FR-015). Null = no warning.
   */
  medicalCovered: string[] | null;
  fields: QueueField[];
};

/** HR's queue: one card per request, one decision per field (spec 029, US2). */
export function ChangeRequestQueue({ requests }: { requests: QueueRequest[] }) {
  if (requests.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-line bg-surface p-6 text-sm text-muted">
        Nothing waiting. Requests appear here as employees send them.
      </p>
    );
  }
  return (
    <div className="mt-8 flex flex-col gap-5">
      {requests.map((req) => (
        <RequestCard key={req.id} req={req} />
      ))}
    </div>
  );
}

function RequestCard({ req }: { req: QueueRequest }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-ink">{req.employeeName}</h2>
          <p className="text-sm text-muted">
            {req.employeeTitle ? `${req.employeeTitle} · ` : ""}
            {req.employeeEmail}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted">Sent {req.submittedAt}</span>
          {req.employeeHasLeft ? (
            <div className="mt-1 inline-block rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700">
              Employee has left
            </div>
          ) : null}
        </div>
      </div>

      {req.reason ? (
        <p className="mt-3 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-700">“{req.reason}”</p>
      ) : null}

      {req.medicalCovered ? (
        <div className="mt-3 rounded-lg border border-gold-300 bg-gold-50 px-3 py-2 text-sm text-gold-800">
          <span className="font-semibold">Medical premium committed.</span> This employee has a
          committed medical premium covering:{" "}
          <span className="font-semibold">{req.medicalCovered.join(", ")}</span>. A dependant
          change alters who is insured — the premium is not recalculated automatically.
        </div>
      ) : null}

      <ul className="mt-4 divide-y divide-line">
        {req.fields.map((f) => (
          <FieldRow key={f.id} field={f} />
        ))}
      </ul>
    </article>
  );
}

function FieldRow({ field }: { field: QueueField }) {
  const [approveState, approve, approving] = useActionState<DecisionState, FormData>(
    approveProfileField,
    null
  );
  const [declineState, decline, declining] = useActionState<DecisionState, FormData>(
    declineProfileField,
    null
  );
  const [declineOpen, setDeclineOpen] = useState(false);
  const error = approveState?.error ?? declineState?.error;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted">{field.label}</div>
          <div className="mt-0.5 text-sm">
            <span className="text-muted line-through">{field.current}</span>
            <span className="px-1.5 text-muted">→</span>
            <span className="font-semibold text-ink">{field.requested}</span>
          </div>
          {field.decisionReason ? (
            <p className="mt-1 text-xs text-muted">“{field.decisionReason}”</p>
          ) : null}
          {field.status !== "PENDING" ? (
            <p className="mt-1 text-[11px] text-muted">
              {field.status === "APPROVED" ? "Approved" : "Declined"}
              {field.decidedBy ? ` by ${field.decidedBy}` : ""}
              {field.decidedAt ? ` · ${field.decidedAt}` : ""}
            </p>
          ) : null}
        </div>

        {field.status === "PENDING" ? (
          <div className="flex flex-wrap items-center gap-2">
            <form action={approve}>
              <input type="hidden" name="fieldId" value={field.id} />
              <button
                type="submit"
                disabled={approving || declining}
                className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
              >
                {approving ? "Applying…" : "Approve"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setDeclineOpen((v) => !v)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600"
            >
              Decline
            </button>
          </div>
        ) : (
          <span
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-bold " +
              (field.status === "APPROVED"
                ? "border border-green-200 bg-green-50 text-green-700"
                : "border border-red-300 bg-red-50 text-red-700")
            }
          >
            {field.status === "APPROVED" ? "Approved" : "Declined"}
          </span>
        )}
      </div>

      {declineOpen && field.status === "PENDING" ? (
        // The reason is dispatched by the form's action, never by the button's onClick — a state
        // update there unmounts the form before the browser dispatches submit, and the decision
        // silently never runs.
        <form
          action={(fd) => {
            decline(fd);
            setDeclineOpen(false);
          }}
          className="mt-3 flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="fieldId" value={field.id} />
          <input
            name="reason"
            required
            placeholder="Why? The employee sees this."
            className="w-full max-w-[380px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={declining}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {declining ? "Saving…" : "Decline this field"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>
      ) : null}
    </li>
  );
}
