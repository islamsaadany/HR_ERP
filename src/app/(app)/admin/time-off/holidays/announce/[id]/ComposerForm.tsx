"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendAnnouncement,
  sendTestAnnouncement,
  saveAnnouncementDraft,
  type ComposerResult,
} from "../../actions";

export type Recipient = { id: string; name: string | null; email: string; department: string | null };

/**
 * The announcement composer's editing surface (reworked 2026-08-19 after review).
 *
 * The earlier version put the script choice in a three-row radio box and the recipient list
 * permanently open on the page — a lot of furniture for two decisions. Now the script is a
 * one-line picker, and the three ways to send are three buttons: everyone, a chosen few, or
 * a test. Picking people happens in a popup and the choices come back as chips on the page,
 * so the confirmation is visible where the send button is.
 */
export function ComposerForm({
  holidayId,
  people,
  initial,
  canSend,
  sendLabel,
  resendConfirmed,
  suggestedLabel,
}: {
  holidayId: string;
  people: Recipient[];
  initial: { subject: string; bodyEn: string; bodyAr: string };
  canSend: boolean;
  sendLabel: string;
  /** Set when the holiday was already announced at these dates — sending again is deliberate. */
  resendConfirmed: boolean;
  /** The bridge day the message links to, or null when the calendar offers none. */
  suggestedLabel: string | null;
}) {
  const router = useRouter();

  /**
   * One action slot for all four buttons. Whichever ran last reports here, so the page
   * never navigates — it just refreshes its server data quietly and shows the banner below
   * the title. `pending` disables the buttons so a double-click can't send twice.
   */
  const [result, run, pending] = useActionState<ComposerResult | null, FormData>(
    async (_prev, formData) => {
      const intent = String(formData.get("intent") ?? "send");
      if (intent === "test") return sendTestAnnouncement(formData);
      if (intent === "save") return saveAnnouncementDraft(formData);
      return sendAnnouncement(formData);
    },
    null
  );

  // A send changes what the page says about this holiday (announced, recipient count, the
  // outdated flag) — pull the fresh server render in without a navigation.
  useEffect(() => {
    if (result?.ok) router.refresh();
  }, [result, router]);

  const [intent, setIntent] = useState<"send" | "test" | "save">("send");
  const [language, setLanguage] = useState<"both" | "en" | "ar">("both");
  const [picker, setPicker] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [testOpen, setTestOpen] = useState(false);

  const areaCls =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed focus:border-navy-500 focus:outline-none";
  const chosen = people.filter((p) => selected.includes(p.id));
  const shown = people.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (p.name ?? p.email).toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q);
  });

  const LANGS: { v: typeof language; label: string }[] = [
    { v: "both", label: "English + Arabic" },
    { v: "en", label: "English only" },
    { v: "ar", label: "Arabic only" },
  ];

  return (
    <form action={run} className="mt-6">
      <input type="hidden" name="id" value={holidayId} />
      <input type="hidden" name="intent" value={intent} />

      {result?.ok && result.message ? (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {result.message}
        </p>
      ) : null}
      {result && !result.ok ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {result.error}
        </p>
      ) : null}
      <input type="hidden" name="language" value={language} />
      {resendConfirmed ? <input type="hidden" name="resendConfirmed" value="1" /> : null}
      {/* The picked people ride along so the server sends to exactly what the chips show. */}
      {selected.map((id) => (
        <input key={id} type="hidden" name="recipient" value={id} />
      ))}

      <div>
        <label htmlFor="ann-subject" className="mb-1 block text-xs uppercase tracking-wide text-muted">
          Subject
        </label>
        <input
          id="ann-subject"
          name="subject"
          defaultValue={initial.subject}
          required
          maxLength={200}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
        />
      </div>

      {/* Script picker — one line, not a box of radios. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted">Send in</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {LANGS.map((l) => (
            <button
              key={l.v}
              type="button"
              onClick={() => setLanguage(l.v)}
              className={
                "px-3 py-1.5 text-xs font-semibold " +
                (language === l.v ? "bg-navy-800 text-white" : "bg-surface text-navy-700 hover:bg-navy-50")
              }
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className={language === "ar" ? "hidden md:block" : ""}>
          <label htmlFor="ann-en" className="mb-1 block text-xs uppercase tracking-wide text-muted">
            Message · English
          </label>
          <textarea id="ann-en" name="bodyEn" rows={14} defaultValue={initial.bodyEn} className={areaCls} />
        </div>
        <div className={language === "en" ? "hidden md:block" : ""}>
          <label htmlFor="ann-ar" className="mb-1 block text-xs uppercase tracking-wide text-muted">
            Message · Arabic
          </label>
          <textarea id="ann-ar" name="bodyAr" dir="rtl" rows={14} defaultValue={initial.bodyAr} className={areaCls} />
        </div>
      </div>

      {/* Who was picked — the confirmation sits next to the button that sends to them. */}
      {chosen.length > 0 ? (
        <div className="mt-4 rounded-xl border border-navy-200 bg-navy-50/60 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-navy-700">
            Sending to {chosen.length} {chosen.length === 1 ? "person" : "people"}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chosen.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full border border-navy-200 bg-surface px-2.5 py-0.5 text-[12px] text-ink"
              >
                {p.name ?? p.email}
                <button
                  type="button"
                  onClick={() => setSelected((s) => s.filter((x) => x !== p.id))}
                  className="text-muted hover:text-red-600"
                  aria-label={`Remove ${p.name ?? p.email}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Test address — appears only when asked for. */}
      {testOpen ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-navy-200 bg-navy-50/40 p-4">
          <div className="min-w-[240px] flex-1">
            <label htmlFor="ann-test" className="mb-1 block text-xs uppercase tracking-wide text-muted">
              Send one copy to
            </label>
            <input
              id="ann-test"
              name="testTo"
              type="email"
              autoFocus
              placeholder="you@forefront.consulting"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
            />
          </div>
          <button
            formNoValidate
            disabled={pending}
            onClick={() => setIntent("test")}
            className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:bg-navy-200"
          >
            {pending && intent === "test" ? "Sending…" : "Send"}
          </button>
          <button
            type="button"
            onClick={() => setTestOpen(false)}
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:border-navy-200"
          >
            Cancel
          </button>
          <p className="w-full text-[11.5px] text-muted">
            Subject is prefixed “[TEST]”. Nothing is recorded and nobody else receives it.
          </p>
        </div>
      ) : null}

      {/* The three ways to send, plus keeping the wording for later. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          disabled={!canSend || pending}
          onClick={() => setIntent("send")}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-navy-200"
        >
          {pending && intent === "send" ? "Sending…" : sendLabel}
        </button>

        {chosen.length > 0 ? (
          <button
            name="audience"
            value="selected"
            disabled={!canSend || pending}
            onClick={() => setIntent("send")}
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:cursor-not-allowed disabled:bg-navy-200"
          >
            Send to {chosen.length} selected
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setPicker(true)}
          className="rounded-lg border border-navy-200 bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          {chosen.length > 0 ? "Change who…" : "Send to selected…"}
        </button>

        <button
          type="button"
          onClick={() => setTestOpen((v) => !v)}
          className="rounded-lg border border-navy-200 bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          Send test…
        </button>

        <button
          formNoValidate
          disabled={pending}
          onClick={() => setIntent("save")}
          className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-muted hover:border-navy-200 hover:text-navy-700 disabled:opacity-50"
        >
          {pending && intent === "save" ? "Saving…" : "Save draft"}
        </button>

        <span className="w-full text-xs text-muted">
          {suggestedLabel
            ? `The “request ${suggestedLabel} off” button is added to the message automatically.`
            : "No bridge to suggest, so the message carries no request button."}
        </span>
      </div>

      {/* ── Who to send to ─────────────────────────────────────────── */}
      {picker ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 p-4 backdrop-blur-[2px]"
          onClick={() => setPicker(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-serif text-xl text-ink">Who should get this?</h2>
            <p className="mt-1 text-sm text-muted">
              Tick the people to send to. Everyone else hears nothing.
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or department…"
              className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
            />
            <div className="mt-2 flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => setSelected(shown.map((p) => p.id))}
                className="font-semibold text-navy-700 hover:underline"
              >
                Select all shown
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="font-semibold text-muted hover:underline"
              >
                Clear
              </button>
              <span className="ml-auto text-muted">{selected.length} picked</span>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-line">
              {shown.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted">Nobody matches that.</p>
              ) : (
                shown.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-b-0 hover:bg-navy-50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(p.id)}
                      onChange={(e) =>
                        setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))
                      }
                    />
                    <span className="text-ink">{p.name ?? p.email}</span>
                    {p.department ? <span className="text-xs text-muted">· {p.department}</span> : null}
                  </label>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPicker(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-muted hover:border-navy-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPicker(false)}
                className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
              >
                Done{selected.length > 0 ? ` · ${selected.length}` : ""}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
