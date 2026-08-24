"use client";

import { useActionState, useState } from "react";
import {
  addOneOnOneNote,
  writeOneOnOneOutcome,
  acknowledgeOneOnOne,
  type ActionResult,
} from "@/app/(app)/reviews/one-on-ones/actions";

export type NoteRow = {
  id: string;
  authorName: string;
  authorInitials: string;
  mine: boolean;
  body: string;
  createdAt: string;
};

export function OneOnOneBoard({
  oneOnOneId,
  notes,
  outcome,
  employeeName,
  managerName,
  employeeAckAt,
  managerAckAt,
  final,
  iAcknowledged,
}: {
  oneOnOneId: string;
  notes: NoteRow[];
  outcome: string | null;
  employeeName: string;
  managerName: string;
  employeeAckAt: string | null;
  managerAckAt: string | null;
  final: boolean;
  iAcknowledged: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      switch (String(formData.get("intent"))) {
        case "note":
          return addOneOnOneNote(formData);
        case "outcome":
          return writeOneOnOneOutcome(formData);
        case "ack":
          return acknowledgeOneOnOne(formData);
        default:
          return { ok: false, error: "Nothing to do." };
      }
    },
    null
  );

  const [note, setNote] = useState("");

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <input type="hidden" name="oneOnOneId" value={oneOnOneId} />

      {state && !state.ok && (
        <p
          role="alert"
          tabIndex={-1}
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {state.error}
        </p>
      )}

      {notes.length === 0 ? (
        <p className="text-[13px] italic text-muted">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="flex gap-2.5 py-2.5">
              <span
                className={`grid size-[26px] shrink-0 place-items-center rounded-full text-[10.5px] font-bold text-white ${
                  n.mine ? "bg-navy-800" : "bg-gold-600"
                }`}
                aria-hidden="true"
              >
                {n.authorInitials}
              </span>
              <div>
                <div className="text-[11px] text-muted">
                  {n.authorName} · {n.createdAt}
                </div>
                <div className="text-[13px]">{n.body}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!final && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            name="body"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note…"
            maxLength={2000}
            className="flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px]"
          />
          <button
            type="submit"
            name="intent"
            value="note"
            disabled={pending || note.trim() === ""}
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px] font-semibold text-navy-700 disabled:opacity-45"
          >
            Add
          </button>
        </div>
      )}

      <div className="mt-4 rounded-r-xl border-l-[3px] border-gold-500 bg-[#fbf9f2] px-4 py-3">
        <h3 className="font-serif text-[14.5px] text-navy-900">Outcome</h3>
        <textarea
          name="outcome"
          defaultValue={outcome ?? ""}
          readOnly={final}
          rows={2}
          maxLength={2000}
          placeholder="What did you decide?"
          className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] read-only:bg-paper read-only:text-muted"
        />
        {!final && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              name="intent"
              value="outcome"
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
              Editing it clears both agreements.
            </span>
          </div>
        )}
        <div className="mt-2.5 flex flex-wrap gap-2 text-[10px] font-bold">
          <Ack name={employeeName} at={employeeAckAt} />
          <Ack name={managerName} at={managerAckAt} />
        </div>
      </div>
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
