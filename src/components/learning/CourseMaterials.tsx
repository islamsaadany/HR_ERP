"use client";

import { useRef, useState, useTransition } from "react";
import type { CourseDocumentSlot, CourseResourceKind } from "@prisma/client";
import {
  addCourseResource,
  removeCourseDocument,
  removeCourseResource,
  uploadCourseDocument,
} from "@/app/(app)/admin/learning/materials-actions";
import {
  DOCUMENT_SLOTS,
  DOCUMENT_SLOT_LABEL,
  RESOURCE_KINDS,
  RESOURCE_KIND_LABEL,
  fileKindBadge,
  formatBytes,
  isEmployeeVisibleSlot,
  isPreviewable,
  linkHost,
} from "@/lib/learning/materials";
import { formatDate } from "@/lib/labels";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type MaterialDocument = {
  id: string;
  slot: CourseDocumentSlot;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: Date;
};

export type MaterialResource = {
  id: string;
  kind: CourseResourceKind;
  name: string;
  url: string | null;
  suggestedByName: string | null;
};

/**
 * The Materials tab (spec 038 materials, 2026-08-22).
 *
 * Documents are three FIXED slots, always all three rendered — an empty slot is a dashed row that
 * says "not uploaded yet", not a missing row. That is the whole reason for fixed slots: you can
 * see what a course is missing without knowing what it should have had.
 *
 * The "HR only" / "Employees see this" chip sits ON each slot rather than in a legend elsewhere,
 * so the person uploading a file sees who gets it at the moment they choose it.
 */
export function CourseMaterials({
  courseId,
  documents,
  resources,
}: {
  courseId: string;
  documents: MaterialDocument[];
  resources: MaterialResource[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const bySlot = new Map(documents.map((d) => [d.slot, d]));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-bold text-navy-800">Course documents</h2>
        <p className="mb-3 mt-0.5 text-[11.5px] text-muted">
          The standard set. Only the slides are shown to employees.
        </p>

        {DOCUMENT_SLOTS.map((slot) => (
          <DocumentSlot
            key={slot}
            courseId={courseId}
            slot={slot}
            document={bySlot.get(slot) ?? null}
            onError={setError}
          />
        ))}

        <p className="mt-2 text-[11.5px] text-muted">
          A green chip means employees get it. Everything else stays with HR. A <b>PDF</b> previews
          in the page for employees; a PowerPoint or Word file can only be downloaded.
        </p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-bold text-navy-800">Course resources</h2>
        <p className="mb-3 mt-0.5 text-[11.5px] text-muted">
          A type, a name, and a link when there is one. Employees see all of these.
        </p>

        {resources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-muted">
            No resources yet. Add the reading you&rsquo;d recommend alongside this course.
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
                  <span className="block font-semibold text-ink">{r.name}</span>
                  <span className="text-[11.5px] text-muted">
                    {linkHost(r.url) ?? "no link"}
                    {r.suggestedByName ? (
                      <>
                        {" · "}
                        <span className={CHIP.attention}>suggested by {r.suggestedByName}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await removeCourseResource(r.id);
                      if (!result.ok) setError(result.error);
                    });
                  }}
                  className="flex-none text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-60"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <AddResourceForm courseId={courseId} onError={setError} />
        <p className="mt-2 text-[11.5px] text-muted">
          A gold tag marks anything an employee suggested, so you can see the library growing.
        </p>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 lg:col-span-2"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One fixed slot — filled or empty. Empty is a dashed row, never an absent one. */
function DocumentSlot({
  courseId,
  slot,
  document,
  onError,
}: {
  courseId: string;
  slot: CourseDocumentSlot;
  document: MaterialDocument | null;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const visible = isEmployeeVisibleSlot(slot);

  function upload(file: File) {
    onError(null);
    const formData = new FormData();
    formData.set("courseId", courseId);
    formData.set("slot", slot);
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadCourseDocument(formData);
      if (!result.ok) onError(result.error);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div
      className={`mb-2 flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
        document ? "border-line bg-surface" : "border-dashed border-line"
      }`}
    >
      <span
        aria-hidden
        className={`grid h-[30px] w-[26px] flex-none place-items-center rounded-sm border text-[9px] font-extrabold ${
          document
            ? "border-navy-200 bg-navy-50 text-navy-700"
            : "border-dashed border-navy-200 text-navy-200"
        }`}
      >
        {document ? fileKindBadge(document.fileName) : "—"}
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold ${document ? "text-ink" : "text-muted"}`}>
          {document ? document.fileName : DOCUMENT_SLOT_LABEL[slot]}
        </span>
        <span className="text-[11px] text-muted">
          {document ? (
            <>
              {DOCUMENT_SLOT_LABEL[slot]}
              {document.sizeBytes ? ` · ${formatBytes(document.sizeBytes)}` : ""}
              {` · uploaded ${formatDate(document.createdAt)}`}
              {visible && !isPreviewable(document.contentType, document.fileName)
                ? " · download only"
                : ""}
            </>
          ) : (
            "Not uploaded yet"
          )}
        </span>
      </span>

      <span className={visible ? CHIP.done : CHIP.muted}>
        {visible ? "Employees see this" : "HR only"}
      </span>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className={document ? BTN_GHOST : BTN_NAVY}
      >
        {pending ? "Uploading…" : document ? "Replace" : "Upload"}
      </button>
      {document ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onError(null);
            startTransition(async () => {
              const result = await removeCourseDocument(document.id);
              if (!result.ok) onError(result.error);
            });
          }}
          className="flex-none text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-60"
        >
          Remove
        </button>
      ) : null}
    </div>
  );
}

function AddResourceForm({
  courseId,
  onError,
}: {
  courseId: string;
  onError: (message: string | null) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
      action={(formData) => {
        onError(null);
        formData.set("courseId", courseId);
        startTransition(async () => {
          const result = await addCourseResource(formData);
          if (!result.ok) onError(result.error);
          else formRef.current?.reset();
        });
      }}
    >
      <div className="w-[100px]">
        <label className={LABEL} htmlFor="resource-kind">
          Type
        </label>
        <select id="resource-kind" name="kind" defaultValue="ARTICLE" className={INPUT}>
          {RESOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {RESOURCE_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[150px] flex-1">
        <label className={LABEL} htmlFor="resource-name">
          Name
        </label>
        <input id="resource-name" name="name" placeholder="What it's called" className={INPUT} />
      </div>
      <div className="min-w-[150px] flex-1">
        <label className={LABEL} htmlFor="resource-url">
          Link <span className="normal-case font-normal">— optional</span>
        </label>
        <input id="resource-url" name="url" placeholder="https://" className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className={BTN_NAVY}>
        {pending ? "Adding…" : "Add"}
      </button>
    </form>
  );
}
