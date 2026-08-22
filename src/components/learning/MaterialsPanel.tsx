"use client";

import { useRef, useState, useTransition } from "react";
import type { CourseDocumentSlot, CourseResourceKind } from "@prisma/client";
import { suggestResource } from "@/app/(app)/learning/actions";
import {
  RESOURCE_KINDS,
  RESOURCE_KIND_LABEL,
  fileKindBadge,
  formatBytes,
  isPreviewable,
  linkHost,
} from "@/lib/learning/materials";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type LearnerDocument = {
  id: string;
  slot: CourseDocumentSlot;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
};

export type LearnerResource = {
  id: string;
  kind: CourseResourceKind;
  name: string;
  url: string | null;
  fromColleague: boolean;
};

/**
 * What an employee sees of a course's materials (spec 038 materials, 2026-08-22).
 *
 * Only the SLIDES document is ever passed in — the outline and expanded outline are not filtered
 * out here, they are never selected in the first place, and the serving route refuses them
 * independently. Nothing on this screen hints they exist, so nobody asks for a file they are not
 * meant to have.
 *
 * A PDF previews in place; anything else offers a download and says so, rather than opening a
 * viewer that renders an empty box.
 */
export function MaterialsPanel({
  courseId,
  slides,
  resources,
}: {
  courseId: string;
  slides: LearnerDocument | null;
  resources: LearnerResource[];
}) {
  const [suggesting, setSuggesting] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-2.5 text-[13px] font-bold text-navy-800">Materials &amp; resources</h2>

      {slides ? (
        isPreviewable(slides.contentType, slides.fileName) ? (
          <div>
            <iframe
              src={`/api/learning/documents/${slides.id}#view=FitH`}
              title="Slides"
              className="h-[520px] w-full rounded-lg border border-line bg-navy-900"
            />
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] text-muted">
                Slides{slides.sizeBytes ? ` · ${formatBytes(slides.sizeBytes)}` : ""}
              </span>
              <a
                href={`/api/learning/documents/${slides.id}`}
                target="_blank"
                rel="noreferrer"
                className={BTN_GHOST}
              >
                Open full screen
              </a>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2">
            <span
              aria-hidden
              className="grid h-[30px] w-[26px] flex-none place-items-center rounded-sm border border-navy-200 bg-navy-50 text-[9px] font-extrabold text-navy-700"
            >
              {fileKindBadge(slides.fileName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Slides</span>
              <span className="text-[11px] text-muted">
                {formatBytes(slides.sizeBytes)} · the deck used in this course
              </span>
            </span>
            <a
              href={`/api/learning/documents/${slides.id}`}
              target="_blank"
              rel="noreferrer"
              className={BTN_GHOST}
            >
              Download
            </a>
          </div>
        )
      ) : (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-muted">
          No slides for this course.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          If you want to go further
        </p>
        <button
          type="button"
          onClick={() => setSuggesting((open) => !open)}
          className="text-[12px] font-semibold text-navy-700 hover:underline"
        >
          {suggesting ? "Cancel" : "Suggest a resource"}
        </button>
      </div>

      {resources.length === 0 ? (
        <p className="mt-1 text-[12.5px] text-muted">
          Nothing here yet — if you know something good on this topic, suggest it.
        </p>
      ) : (
        <ul>
          {resources.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2.5 border-b border-line py-2 text-[13px] last:border-b-0"
            >
              <span className="w-[62px] flex-none">
                <span className={CHIP.navy}>{RESOURCE_KIND_LABEL[r.kind]}</span>
              </span>
              <span className="min-w-0 flex-1">
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="block font-semibold text-navy-800 hover:underline"
                  >
                    {r.name} →
                  </a>
                ) : (
                  <span className="block font-semibold text-ink">{r.name}</span>
                )}
                <span className="text-[11.5px] text-muted">
                  {linkHost(r.url) ?? "no link"}
                  {r.fromColleague ? " · suggested by a colleague" : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {suggesting ? (
        <SuggestForm courseId={courseId} onDone={() => setSuggesting(false)} />
      ) : null}
    </div>
  );
}

/**
 * Suggest a resource. Shared by this panel and the finish panel, so the wording and the rules
 * people see are the same in both places.
 */
export function SuggestForm({
  courseId,
  onDone,
  compact = false,
}: {
  courseId: string;
  onDone?: () => void;
  compact?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className={`${compact ? "" : "mt-3"} rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-[12.5px] text-green-700`}>
        Thanks — sent to HR. If it lands, it&rsquo;ll show up here for everyone taking this course.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      className={compact ? "" : "mt-3 border-t border-line pt-3"}
      action={(formData) => {
        setError(null);
        formData.set("courseId", courseId);
        startTransition(async () => {
          const result = await suggestResource(formData);
          if (!result.ok) setError(result.error);
          else {
            formRef.current?.reset();
            setSent(true);
            onDone?.();
          }
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-[100px]">
          <label className={LABEL} htmlFor={`suggest-kind-${courseId}`}>
            Type
          </label>
          <select id={`suggest-kind-${courseId}`} name="kind" defaultValue="BOOK" className={INPUT}>
            {RESOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {RESOURCE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <label className={LABEL} htmlFor={`suggest-name-${courseId}`}>
            Name
          </label>
          <input
            id={`suggest-name-${courseId}`}
            name="name"
            placeholder="What it's called"
            className={INPUT}
          />
        </div>
      </div>
      <div className="mt-2">
        <label className={LABEL} htmlFor={`suggest-url-${courseId}`}>
          Link <span className="font-normal normal-case">— if you have one</span>
        </label>
        <input id={`suggest-url-${courseId}`} name="url" placeholder="https://" className={INPUT} />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="submit" disabled={pending} className={BTN_NAVY}>
          {pending ? "Sending…" : "Send to HR"}
        </button>
        <span className="text-[11.5px] text-muted">HR reviews it before it appears.</span>
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
