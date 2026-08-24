"use client";

import { useActionState } from "react";
import {
  writeOutcome,
  acknowledgeOutcome,
  type ActionResult,
} from "@/app/(app)/reviews/actions";

export type OutcomeView = {
  priorities: string;
  risks: string;
  successDefinition: string;
  employeeCommitments: string;
  managerCommitments: string;
  employeeAckAt: string | null;
  managerAckAt: string | null;
  finalAt: string | null;
};

/**
 * What the pair agreed — the only thing that outlives the meeting, and what opens
 * the next quarter's sheet.
 *
 * Editable until both acknowledge. Any edit clears both acknowledgements on the
 * server: nobody's agreement should stay attached to text they never saw.
 */
export function OutcomePanel({
  sheetId,
  employeeName,
  managerName,
  outcome,
  iAcknowledged,
}: {
  sheetId: string;
  employeeName: string;
  managerName: string;
  outcome: OutcomeView | null;
  iAcknowledged: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) =>
      String(formData.get("intent")) === "ack"
        ? acknowledgeOutcome(formData)
        : writeOutcome(formData),
    null
  );

  const final = Boolean(outcome?.finalAt);

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <input type="hidden" name="sheetId" value={sheetId} />

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-serif text-[16px] text-navy-900">What we agreed</h3>
        {final ? (
          <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-bold text-green-700">
            Agreed by both {outcome?.finalAt}
          </span>
        ) : (
          <span className="rounded-full border border-gold-300 bg-gold-100 px-2.5 py-0.5 text-[10px] font-bold text-gold-800">
            Not agreed yet
          </span>
        )}
      </div>

      {state && !state.ok && (
        <p
          role="alert"
          tabIndex={-1}
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {state.error}
        </p>
      )}

      <div className="space-y-3">
        <Field
          name="priorities"
          label="Top 3 priorities for the next period"
          value={outcome?.priorities ?? ""}
          readOnly={final}
        />
        <Field
          name="risks"
          label="Key risks or concerns to watch"
          value={outcome?.risks ?? ""}
          readOnly={final}
        />
        <Field
          name="successDefinition"
          label="What would make the next review feel like a success"
          value={outcome?.successDefinition ?? ""}
          readOnly={final}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="employeeCommitments"
            label={`${employeeName} commits to`}
            value={outcome?.employeeCommitments ?? ""}
            readOnly={final}
          />
          <Field
            name="managerCommitments"
            label={`${managerName} commits to`}
            value={outcome?.managerCommitments ?? ""}
            readOnly={final}
          />
        </div>
      </div>

      {!final && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            type="submit"
            name="intent"
            value="write"
            disabled={pending}
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-navy-700 disabled:opacity-45"
          >
            Save
          </button>
          {outcome && (
            <button
              type="submit"
              name="intent"
              value="ack"
              disabled={pending || iAcknowledged}
              className="rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
            >
              {iAcknowledged ? "You agreed" : "Agree this outcome"}
            </button>
          )}
          <span className="text-[11.5px] text-muted">
            Editing after one of you agrees clears both — nobody agrees to text they never
            read.
          </span>
        </div>
      )}

      {outcome && (
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
          <Ack name={employeeName} at={outcome.employeeAckAt} />
          <Ack name={managerName} at={outcome.managerAckAt} />
        </div>
      )}
    </form>
  );
}

function Ack({ name, at }: { name: string; at: string | null }) {
  return at ? (
    <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-green-700">
      ✓ {name} agreed {at}
    </span>
  ) : (
    <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-muted">
      {name} has not yet
    </span>
  );
}

function Field({
  name,
  label,
  value,
  readOnly,
}: {
  name: string;
  label: string;
  value: string;
  readOnly: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={value}
        readOnly={readOnly}
        rows={2}
        maxLength={2000}
        className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink read-only:bg-paper read-only:text-muted"
      />
    </label>
  );
}
