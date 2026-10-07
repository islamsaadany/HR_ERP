"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateIncentiveMessage } from "@/app/(app)/admin/notifications/actions";
import type { NotifResult } from "@/app/(app)/admin/notifications/actions";
import {
  INCENTIVE_MESSAGE_DEFAULTS,
  INCENTIVE_PLACEHOLDERS,
  fillMessage,
  type IncentiveMessage,
} from "@/lib/email/incentive-message";

/** What the preview stands in with, so the operator reads a real message rather than braces. */
const SAMPLE = {
  "{first name}": "Ahmed",
  "{full name}": "Ahmed Fathy",
  "{cycle}": "H1-2026",
  "{total}": "EGP 85,130.00",
  "{transfer date}": "26-Aug 2026",
  "{business unit}": "Forefront Consulting",
} as const;

const FIELDS = [
  { key: "subject", label: "Subject", rows: 0 },
  { key: "heading", label: "Heading", rows: 0 },
  { key: "body", label: "Message", rows: 5 },
  { key: "footer", label: "Closing line", rows: 0 },
] as const;

/**
 * Editing the incentive payment message (spec 009 FR-006g).
 *
 * The words are editable; the amount rows are not, and the panel says so — what somebody
 * was paid and what it was for is the payment itself, and a message that could be edited
 * into not saying the amount would be worse than no message.
 *
 * Tracks DIRTY rather than saved: the question the operator is asking is "does what is
 * stored match what I am looking at", and a green tick that lingers while they keep typing
 * answers a different one.
 */
export function IncentiveMessageEditor({ stored }: { stored: IncentiveMessage }) {
  const router = useRouter();
  const [draft, setDraft] = useState<IncentiveMessage>(stored);
  const [state, save, saving] = useActionState<NotifResult | null, FormData>(
    async (_prev, fd) => updateIncentiveMessage(fd),
    null
  );
  // Clicking a placeholder blurs the field before any click handler runs, so the last
  // focused field is remembered — and the mousedown is cancelled so focus never leaves.
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => setDraft(stored), [stored]);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const dirty = (Object.keys(draft) as (keyof IncentiveMessage)[]).some((k) => draft[k] !== stored[k]);
  const fill = (t: string) => fillMessage(t, SAMPLE);

  const insert = (token: string) => {
    const el = lastField.current;
    if (!el) return;
    const at = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? at;
    const next = el.value.slice(0, at) + token + el.value.slice(end);
    setDraft((d) => ({ ...d, [el.name.replace("incentiveEmail", "").toLowerCase()]: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = at + token.length;
    });
  };

  const submit = (fd: FormData) => startTransition(() => save(fd));

  return (
    <section className="mt-8 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-sm font-semibold text-ink">Incentive payment message</h2>
        {dirty ? (
          <span className="rounded-full border border-gold-300 bg-gold-100 px-2.5 py-0.5 text-[10px] font-bold text-gold-800">
            Unsaved changes
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setDraft({ ...INCENTIVE_MESSAGE_DEFAULTS })}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-navy-700 hover:bg-navy-50"
        >
          Restore the original wording
        </button>
      </div>
      <p className="mt-1 max-w-[74ch] text-[12.5px] text-muted">
        Sent to a person only when their transaction is confirmed at the bank — never when it is
        released, and never when Finance creates it.
      </p>

      {state && !state.ok ? (
        <p role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
          Saved. Every incentive payment message from now on uses this wording.
        </p>
      ) : null}

      <form action={submit} className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          {FIELDS.map((f) => {
            const name = `incentiveEmail${f.key[0].toUpperCase()}${f.key.slice(1)}`;
            const common = {
              name,
              id: name,
              value: draft[f.key],
              onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                lastField.current = e.currentTarget;
              },
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setDraft((d) => ({ ...d, [f.key]: e.target.value })),
              className:
                "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none",
            };
            return (
              <label key={f.key} className="mt-4 block first:mt-0">
                <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.06em] text-muted">
                  {f.label}
                </span>
                {f.rows ? <textarea rows={f.rows} {...common} /> : <input type="text" {...common} />}
              </label>
            );
          })}

          <div
            className="mt-2.5 flex flex-wrap gap-1.5"
            onMouseDown={(e) => e.preventDefault()}
          >
            {INCENTIVE_PLACEHOLDERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => insert(t)}
                className="rounded-md border border-navy-100 bg-navy-50 px-2 py-0.5 font-mono text-[11px] text-navy-700 hover:bg-navy-100"
              >
                {t}
              </button>
            ))}
          </div>

          <p className="mt-2.5 rounded-lg border border-dashed border-navy-200 bg-paper px-3 py-2 text-[12px] text-muted">
            <b className="text-ink">Not editable:</b> the amount rows and the brand header. What
            somebody was paid, and for what, is the payment itself — not wording.
          </p>

          <div className="mt-4 flex items-center gap-2.5 border-t border-line pt-4">
            <span className="flex-1" />
            <button
              type="submit"
              disabled={saving || !dirty}
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[12px] text-muted">
            <b className="text-ink">Preview</b> — with a sample cycle&rsquo;s figures
          </p>
          <div className="rounded-xl border border-line bg-[#eceff2] p-4">
            <div className="mx-auto max-w-[600px] overflow-hidden rounded-md bg-white shadow-sm">
              <div className="bg-navy-800 px-6 py-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">
                  Forefront Group
                </div>
                <div className="mt-0.5 text-base font-bold text-white">Forefront Consulting</div>
              </div>
              <div className="px-6 py-6">
                <h3 className="mb-3 text-[19px] font-bold text-ink">{fill(draft.heading)}</h3>
                {fill(draft.body)
                  .split(/\n{2,}/)
                  .map((p, i) => (
                    <p key={i} className="mb-4 whitespace-pre-line text-sm leading-relaxed text-[#3c4351]">
                      {p}
                    </p>
                  ))}
                <div className="border-t border-line">
                  {[
                    ["Business Partner Fee", "EGP 38,880.00"],
                    ["Commission", "EGP 46,250.00"],
                    ["Total transferred", "EGP 85,130.00"],
                    ["Transferred on", "26-Aug 2026"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 border-b border-line py-2 text-sm">
                      <span className="text-muted">{k}</span>
                      <span className="font-semibold tabular-nums text-ink">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-line bg-[#faf9f6] px-6 pb-5 pt-4 text-[12px] text-muted">
                {fill(draft.footer)}
              </div>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            <b className="text-ink">Subject</b> {fill(draft.subject)}
          </p>
        </div>
      </form>
    </section>
  );
}
