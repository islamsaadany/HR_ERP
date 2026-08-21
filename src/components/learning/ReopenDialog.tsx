"use client";

import { BTN_GHOST, BTN_NAVY } from "@/components/learning/ui";
import type { CompletionChoice } from "@/app/(app)/admin/learning/actions";

/**
 * The one place an HR edit changes somebody's finished record (FR-039).
 *
 * This dialog is an AFFORDANCE, not the control. The server re-counts affected people inside the
 * write and refuses the edit outright when completions exist and no choice arrived — so skipping
 * this dialog cannot silently apply either outcome.
 *
 * Both choices are stated in terms of what the employee will experience, because that is what the
 * person clicking is actually deciding.
 */
export function ReopenDialog({
  affected,
  pending,
  onChoose,
  onCancel,
}: {
  affected: number;
  pending: boolean;
  onChoose: (choice: CompletionChoice) => void;
  onCancel: () => void;
}) {
  const people = affected === 1 ? "1 person has" : `${affected} people have`;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-900/40 p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-title"
        className="w-full max-w-[470px] rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h4 id="reopen-title" className="font-serif text-[17px] text-ink">
          {people} already completed this course
        </h4>
        <p className="mt-1.5 text-[13px] text-muted">
          You&rsquo;re adding a required lesson. Does that reopen the course for them?
        </p>

        <button
          type="button"
          disabled={pending}
          onClick={() => onChoose("REOPEN")}
          className="mt-3 block w-full rounded-xl border border-line p-3 text-left hover:border-navy-800 hover:bg-navy-50/40 disabled:opacity-60"
        >
          <b className="block text-[13px] text-navy-800">Reopen it for them</b>
          <span className="text-[12.5px] text-muted">
            The new lesson appears in their list and the course goes back to in-progress. Their
            original completion date is kept and shown alongside.
          </span>
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => onChoose("KEEP")}
          className="mt-2 block w-full rounded-xl border border-line p-3 text-left hover:border-navy-800 hover:bg-navy-50/40 disabled:opacity-60"
        >
          <b className="block text-[13px] text-navy-800">Leave their completion standing</b>
          <span className="text-[12.5px] text-muted">
            They stay complete. The new lesson isn&rsquo;t required of them.
          </span>
        </button>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className={BTN_GHOST}>
            Cancel
          </button>
        </div>

        <p className="mt-2 text-[11.5px] text-muted">
          Counts only people the course still reaches — anyone who finished it and has since moved
          out of its audience isn&rsquo;t pulled back in.
        </p>
      </div>
    </div>
  );
}
