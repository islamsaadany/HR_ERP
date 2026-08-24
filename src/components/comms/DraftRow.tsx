"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  dismissCongratulation,
  sendCongratulation,
  updateCongratulation,
} from "@/app/(app)/admin/communications/actions";
import { formatDate } from "@/lib/labels";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type DraftItem = {
  id: string;
  kind: "BIRTHDAY" | "WORK_ANNIVERSARY";
  subject: string;
  body: string;
  personName: string;
  unitName: string | null;
  unitColor: string | null;
  occasionDate: Date | null;
  years: number | null;
  /** Only shown on HR's queue — a manager already knows it is theirs. */
  assigneeName?: string | null;
};

/** "tomorrow" · "in 3 days" · "today". A date alone makes you count. */
function whenLabel(date: Date | null): { text: string; urgent: boolean } {
  if (!date) return { text: "—", urgent: false };
  const today = new Date();
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((a - b) / 86_400_000);
  if (days < 0) return { text: "the day has passed", urgent: true };
  if (days === 0) return { text: "today", urgent: true };
  if (days === 1) return { text: "tomorrow", urgent: true };
  return { text: `in ${days} days`, urgent: false };
}

/**
 * One waiting congratulation: read it, change it, send it.
 *
 * Opens closed. A queue of expanded editors is unreadable, and the common case is a manager
 * glancing at three rows and sending the one that is due tomorrow.
 */
export function DraftRow({ item, canPreview }: { item: DraftItem; canPreview: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState(false);

  const when = whenLabel(item.occasionDate);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span
          aria-hidden
          className="h-9 w-[3px] flex-none rounded-sm"
          style={{ background: item.unitColor ?? "#c9a227" }}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-navy-800">
            {item.personName}
            {item.kind === "WORK_ANNIVERSARY" && item.years ? ` — ${item.years} years` : " — birthday"}
          </span>
          <span className="block text-[11.5px] text-muted">
            {item.occasionDate ? formatDate(item.occasionDate) : "—"}
            {item.unitName ? ` · ${item.unitName}` : ""}
            {item.assigneeName ? ` · with ${item.assigneeName}` : ""}
          </span>
        </span>
        <span className={when.urgent ? CHIP.attention : CHIP.muted}>{when.text}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[12px] font-semibold text-navy-700 hover:underline"
        >
          {open ? "Close" : "Review →"}
        </button>
      </div>

      {open ? (
        <div className="border-t border-line p-3">
          <form action={(fd) => run(() => updateCongratulation(item.id, fd))}>
            <div>
              <label className={LABEL} htmlFor={`s-${item.id}`}>Subject</label>
              <input id={`s-${item.id}`} name="subject" defaultValue={item.subject} className={INPUT} />
            </div>
            <div className="mt-2">
              <label className={LABEL} htmlFor={`b-${item.id}`}>Message</label>
              <textarea id={`b-${item.id}`} name="body" defaultValue={item.body} rows={7} className={INPUT} />
              <p className="mt-1 text-[11.5px] text-muted">
                Change anything. It goes out signed with your name, so it should sound like you.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="submit" disabled={pending} className={BTN_GHOST}>
                {pending ? "Saving…" : "Save"}
              </button>
              {canPreview ? (
                <a
                  href={`/api/admin/communications/preview?id=${item.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-semibold text-navy-700 hover:underline"
                >
                  Preview the email →
                </a>
              ) : null}
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              disabled={pending}
              className={BTN_NAVY}
              onClick={() => run(() => sendCongratulation(item.id))}
            >
              {pending ? "Sending…" : `Send to ${item.personName.split(/\s+/)[0]}`}
            </button>

            {confirmDismiss ? (
              <>
                <span className="text-[12px] text-muted">Close without sending?</span>
                <button
                  type="button"
                  disabled={pending}
                  className={BTN_GHOST}
                  onClick={() => run(() => dismissCongratulation(item.id))}
                >
                  Yes, close it
                </button>
                <button type="button" className={BTN_GHOST} onClick={() => setConfirmDismiss(false)}>
                  Keep it
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDismiss(true)}
                className="text-[12px] font-semibold text-muted hover:text-ink"
                title="For when a message would not land well right now"
              >
                Not this one
              </button>
            )}
          </div>

          {error ? (
            <p role="alert" className="mt-2 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
