"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeAudienceChoice,
  sendAnnouncement,
  setAnnouncementAudience,
  updateAnnouncement,
} from "@/app/(app)/admin/communications/actions";
import { type FieldSpec } from "@/components/audience/AudienceFields";
import { AudiencePicker } from "@/components/audience/AudiencePicker";
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
  // `dirty` rather than `saved`. The chip used to be set true on a successful write and cleared
  // only by the NEXT action — so it stayed on screen while the operator carried on typing, telling
  // them their work was stored when it was not, and the preview (which reads what IS stored) was
  // then blamed for showing older text. The screen now tracks the one thing that matters: whether
  // what is on screen has been written down.
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewUnit, setPreviewUnit] = useState<string>(units[0]?.id ?? "");
  const [previewKey, setPreviewKey] = useState(0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
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
          // Saving and rebuilding the preview are ONE action. Two controls that can disagree is
          // exactly what made a correctly-rendered preview look broken.
          onInput={() => setDirty(true)}
          action={(formData) =>
            run(
              () => updateAnnouncement(messageId, formData),
              () => {
                setDirty(false);
                setPreviewKey((k) => k + 1);
              }
            )
          }
        >
          <div>
            <label className={LABEL} htmlFor="subject">Subject</label>
            {/* A grey prompt, not stored text. A draft opens empty and this disappears the moment
                anything is typed — the operator never has to delete words they did not write. */}
            <input
              id="subject"
              name="subject"
              defaultValue={initial.subject}
              placeholder="What is this about?"
              className={`${INPUT} placeholder:text-muted/60`}
            />
          </div>
          <div className="mt-3">
            <label className={LABEL} htmlFor="body">Message</label>
            <textarea
              id="body"
              name="body"
              defaultValue={initial.body}
              rows={10}
              placeholder="Write your message here."
              className={`${INPUT} font-normal placeholder:text-muted/60`}
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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending} className={BTN_NAVY}>
              {pending ? "Saving…" : "Save & refresh preview"}
            </button>
            {dirty ? (
              <span className={CHIP.attention}>Not saved yet</span>
            ) : (
              <span className={CHIP.done}>Saved</span>
            )}
          </div>
        </form>

        <section className="mt-4 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[13px] font-bold text-navy-800">Who gets this?</h2>
          <p className="mb-2 mt-0.5 text-[11.5px] text-muted">
            Each choice shows how many people it reaches today. Gold means it reaches nobody.
          </p>
          <AudiencePicker
            fields={fields}
            pending={pending}
            onAdd={(field, values) => run(() => setAnnouncementAudience(messageId, field, values))}
            onRemove={(_field, rowId) => run(() => removeAudienceChoice(messageId, rowId))}
          />

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
        <EmailPreview
          key={`${previewUnit}-${previewKey}`}
          src={`/api/admin/communications/preview?id=${messageId}${previewUnit ? `&unit=${previewUnit}` : ""}`}
        />
        <p className="mt-1.5 text-[11.5px] text-muted">
          This is the real email, built by the same code that sends it — not an impression of it.
          It shows what was last saved.
        </p>
      </aside>
    </div>
  );
}

/**
 * The email preview: the WHOLE email, scaled to the panel.
 *
 * Two faults, and the second was introduced by fixing the first (2026-08-25).
 *
 * It began as a fixed 620px box with its own scrollbar, so a normal-length announcement was read
 * through a letterbox. Removing the scrollbar and measuring the document fixed the height — and
 * silently clipped the RIGHT-HAND EDGE, because the email is a 600px table (the only layout every
 * mail client agrees on) inside a panel narrower than that. Losing the end of every line is worse
 * than scrolling to it.
 *
 * So the frame is laid out at the email's own width and scaled down to fit, rather than squeezed.
 * The email is a fixed-width design; showing it at 70% is honest, showing 70% of it is not. Height
 * is measured from the document and scaled by the same factor, so the panel is exactly as tall as
 * the scaled email and nothing scrolls in either direction.
 *
 * Measured on load AND on resize: a font arriving after `load` changes the height, and a preview
 * that settles a line short of its own footer is the kind of small wrongness that makes an operator
 * distrust the screen.
 */
// `render.ts` builds the email table at exactly 600px. The DOCUMENT is wider than that — the body
// carries its own padding — so this is only a starting guess, and the real width is measured. An
// assumed 600 left 24px of the right-hand edge outside the frame, which is the same clipping this
// component exists to avoid, just smaller and harder to notice.
const PREVIEW_WIDTH_GUESS = 600;

function EmailPreview({ src }: { src: string }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const ref = useRef<HTMLIFrameElement | null>(null);
  // Plausible starting values, so the panel does not visibly jump on first paint.
  const [height, setHeight] = useState(420);
  const [width, setWidth] = useState(PREVIEW_WIDTH_GUESS);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let contentObserver: ResizeObserver | null = null;
    let holderObserver: ResizeObserver | null = null;

    // Measure the BODY, never `documentElement`.
    //
    // The root element stretches to fill the frame, so reading its size returns the size this
    // component just set — the measurement feeds on its own output. It locked the preview at its
    // initial guess of 420px and left 117px of empty grey under a 303px email, which is exactly
    // the letterboxing the old fixed-height box produced. The body is sized by its contents.
    function contentWidth(): number {
      try {
        return Math.max(frame?.contentDocument?.body?.scrollWidth ?? 0, PREVIEW_WIDTH_GUESS);
      } catch {
        return PREVIEW_WIDTH_GUESS;
      }
    }

    function fit() {
      const natural = contentWidth();
      setWidth(natural);
      const available = holder.current?.clientWidth ?? natural;
      // Never scale UP — a 600px email blown up to fill a wide panel would be a lie about its size.
      setScale(Math.min(1, available / natural));
    }

    function measure() {
      // Cross-origin would throw. It cannot be — the src is our own route — but a preview is not
      // worth an unhandled error on the page it is previewing for.
      try {
        const body = frame?.contentDocument?.body;
        if (!body) return;
        const next = body.scrollHeight;
        if (next > 0) setHeight(next);
        // Height and width are measured together: a re-wrap changes both.
        fit();
      } catch {
        /* leave the last known height */
      }
    }

    function onLoad() {
      // measure() calls fit() itself — width and height are one question.
      measure();
      try {
        const body = frame?.contentDocument?.body;
        if (body && typeof ResizeObserver !== "undefined") {
          contentObserver = new ResizeObserver(measure);
          contentObserver.observe(body);
        }
      } catch {
        /* the load measurement stands on its own */
      }
    }

    frame.addEventListener("load", onLoad);
    // Already loaded by the time this effect runs (a cached response) — the load event has been and
    // gone and will not fire again, so measure now.
    if (frame.contentDocument?.readyState === "complete") onLoad();

    if (holder.current && typeof ResizeObserver !== "undefined") {
      holderObserver = new ResizeObserver(fit);
      holderObserver.observe(holder.current);
    }
    fit();

    return () => {
      frame.removeEventListener("load", onLoad);
      contentObserver?.disconnect();
      holderObserver?.disconnect();
    };
  }, [src]);

  return (
    // The border lives HERE, not on the iframe. On the iframe it ate 2px of the frame's own inner
    // width, so the document was 2px wider than its viewport and the right edge was clipped — the
    // very thing this component exists to prevent, just small enough to miss.
    <div
      ref={holder}
      style={{ height: height * scale }}
      className="w-full overflow-hidden rounded-lg border border-line bg-white"
    >
      <iframe
        ref={ref}
        title="Email preview"
        src={src}
        scrolling="no"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="block overflow-hidden border-0 bg-white"
      />
    </div>
  );
}
