"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AudienceField } from "@/lib/audience/types";
import {
  removeAudienceChoice,
  sendAnnouncement,
  setAnnouncementAudience,
  updateAnnouncement,
} from "@/app/(app)/admin/communications/actions";
import { AudienceField_, type FieldSpec } from "@/components/audience/AudienceFields";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

/**
 * Writing an announcement and sending it (spec 039 US1).
 *
 * The send is the one irreversible thing in this platform that somebody triggers on purpose, so it
 * is behind a dialog that NAMES the number of people — and that number is passed to the server,
 * which refuses if it has changed since. A confirmation that can silently cover more people than
 * it named is not a confirmation.
 *
 * The preview is an `<iframe srcdoc>` fed by a route that calls the same builder the send calls.
 * Not a React mirror of the email: those drift on the first change, invisibly.
 */
export function AnnouncementEditor({
  messageId,
  initial,
  fields,
  totalReach,
  units,
  emailEnabled,
}: {
  messageId: string;
  initial: { subject: string; body: string; ctaLabel: string; ctaHref: string };
  fields: FieldSpec[];
  totalReach: number;
  /** Which unit to preview as. The first entry is "somebody with no unit" — a real case. */
  units: Array<{ id: string; name: string }>;
  emailEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [openField, setOpenField] = useState<AudienceField | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [previewUnit, setPreviewUnit] = useState<string>(units[0]?.id ?? "");
  const [previewKey, setPreviewKey] = useState(0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else {
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_460px]">
      <div>
        <form
          className="rounded-xl border border-line bg-surface p-4"
          action={(formData) => run(() => updateAnnouncement(messageId, formData), () => setSaved(true))}
        >
          <div>
            <label className={LABEL} htmlFor="subject">Subject</label>
            <input id="subject" name="subject" defaultValue={initial.subject} className={INPUT} />
          </div>
          <div className="mt-3">
            <label className={LABEL} htmlFor="body">Message</label>
            <textarea
              id="body"
              name="body"
              defaultValue={initial.body}
              rows={10}
              className={`${INPUT} font-normal`}
            />
            <p className="mt-1 text-[11.5px] text-muted">
              Leave a blank line between paragraphs — that is how they arrive.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="min-w-[150px] flex-1">
              <label className={LABEL} htmlFor="ctaLabel">Button label <span className="font-normal normal-case">— optional</span></label>
              <input id="ctaLabel" name="ctaLabel" defaultValue={initial.ctaLabel} className={INPUT} />
            </div>
            <div className="min-w-[190px] flex-[2]">
              <label className={LABEL} htmlFor="ctaHref">Button link</label>
              <input id="ctaHref" name="ctaHref" defaultValue={initial.ctaHref} placeholder="https://" className={INPUT} />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={pending} className={BTN_GHOST}>
              {pending ? "Saving…" : "Save draft"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setPreviewKey((k) => k + 1)}
              className="text-[12px] font-semibold text-navy-700 hover:underline disabled:opacity-60"
            >
              Refresh preview →
            </button>
            {saved ? <span className={CHIP.done}>Saved</span> : null}
          </div>
        </form>

        <section className="mt-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[13px] font-bold text-navy-800">Who gets this?</h2>
          <p className="mb-2 mt-0.5 text-[11.5px] text-muted">
            Each choice shows how many people it reaches today.
          </p>
          {fields.map((spec) => (
            <AudienceField_
              key={spec.field}
              spec={spec}
              open={openField === spec.field}
              pending={pending}
              onOpen={() => setOpenField(openField === spec.field ? null : spec.field)}
              onAdd={(field, values) =>
                run(() => setAnnouncementAudience(messageId, field, values), () => setOpenField(null))
              }
              onRemove={(field, rowId) => run(() => removeAudienceChoice(messageId, rowId))}
            />
          ))}

          <div className="mt-3 flex flex-wrap items-baseline gap-2 border-t border-line pt-3 text-[13px]">
            <span className="text-muted">Right now this reaches</span>
            <b className="font-serif text-[22px] text-navy-800">
              {totalReach} {totalReach === 1 ? "person" : "people"}
            </b>
            <span className="text-muted">
              — fewer than the numbers above add up to, because some people are in more than one.
            </span>
          </div>
        </section>

        {!emailEnabled ? (
          <p className="mt-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
            Email sending is switched off in Notification settings. You can write and preview, but
            nothing can be sent.
          </p>
        ) : null}

        <div className="mt-4">
          {confirming ? (
            <div className="rounded-xl border border-gold-300 bg-gold-100 p-4">
              <p className="m-0 text-[13.5px] font-bold text-gold-800">
                About to email {totalReach} {totalReach === 1 ? "person" : "people"}.
              </p>
              <p className="mt-1 text-[12.5px] text-gold-800">
                This cannot be undone, and there is no recall. Each person gets their own copy,
                branded with their own business unit.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending || totalReach === 0}
                  className={BTN_NAVY}
                  onClick={() =>
                    run(
                      async () => {
                        const r = await sendAnnouncement(messageId, totalReach);
                        if (r.ok && r.data)
                          setError(
                            r.data.failed > 0
                              ? `Sent to ${r.data.sent}. ${r.data.failed} could not be delivered — see the list below.`
                              : null
                          );
                        return r;
                      },
                      () => setConfirming(false)
                    )
                  }
                >
                  {pending ? "Sending…" : `Yes, send to ${totalReach}`}
                </button>
                <button type="button" disabled={pending} className={BTN_GHOST} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={pending || totalReach === 0 || !emailEnabled}
              className={BTN_NAVY}
              onClick={() => setConfirming(true)}
              title={totalReach === 0 ? "Nobody is selected yet" : undefined}
            >
              Send…
            </button>
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {error}
          </p>
        ) : null}
      </div>

      <aside className="rounded-xl border border-line bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold text-navy-800">Preview</h2>
          <select
            aria-label="Preview as"
            value={previewUnit}
            onChange={(e) => setPreviewUnit(e.target.value)}
            className={`${INPUT} w-auto py-1 text-[12px]`}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <iframe
          key={`${previewUnit}-${previewKey}`}
          title="Email preview"
          src={`/api/admin/communications/preview?id=${messageId}${previewUnit ? `&unit=${previewUnit}` : ""}`}
          className="h-[620px] w-full rounded-lg border border-line bg-white"
        />
        <p className="mt-1.5 text-[11.5px] text-muted">
          This is the real email, built by the same code that sends it — not an impression of it.
          Save the draft to see edits.
        </p>
      </aside>
    </div>
  );
}
