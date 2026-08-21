"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCourse } from "@/app/(app)/admin/learning/actions";
import { importCourseFromWorkbook, type ImportCourseResult } from "@/app/(app)/admin/learning/import-actions";
import { BTN_GHOST, BTN_NAVY, INPUT } from "@/components/learning/ui";

/** Create a draft course and go straight into its builder — the next thing you want either way. */
export function NewCourseForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState<ImportCourseResult | null>(null);

  return (
    <div className="mt-5">
      {open ? (
        <form
          className="rounded-xl border border-line bg-surface p-4"
          action={(formData) => {
            setError(null);
            startTransition(async () => {
              const result = await createCourse(formData);
              if (!result.ok) setError(result.error);
              else if (result.id) router.push(`/admin/learning/${result.id}`);
            });
          }}
        >
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Course title
          </label>
          <input name="title" className={INPUT} placeholder="Client Engagement Essentials" autoFocus />
          <label className="mb-1 mt-3 block text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Summary <span className="normal-case tracking-normal">(optional)</span>
          </label>
          <input name="summary" className={INPUT} placeholder="What this course covers" />
          {error ? (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={pending} className={BTN_NAVY}>
              {pending ? "Creating…" : "Create course"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOpen(true)} className={BTN_NAVY}>
            + New course
          </button>

          {/* Build the course in a spreadsheet instead — easier for a long curriculum than typing
              a lesson at a time, and the file can be prepared by someone without an admin login. */}
          <a href="/api/admin/learning/template" className={BTN_GHOST}>
            ↓ Course template
          </a>

          <label className={`${BTN_GHOST} cursor-pointer`}>
            ↑ Upload filled template
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set("file", file);
                e.target.value = ""; // so picking the same file twice still fires
                setImported(null);
                startTransition(async () => setImported(await importCourseFromWorkbook(fd)));
              }}
            />
          </label>

          {pending ? <span className="text-xs text-muted">Reading the file…</span> : null}
        </div>
      )}

      {imported && !imported.ok ? (
        <div
          role="alert"
          className="mt-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700"
        >
          <p className="font-semibold">{imported.error}</p>
          {imported.problems ? (
            // Every problem at once — one at a time turns this into fix, re-upload, fix, re-upload.
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {imported.problems.map((p, i) => (
                <li key={i}>
                  <b>{p.where}</b> — {p.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {imported?.ok ? (
        <div className="mt-3 rounded-r-lg border-l-[3px] border-green-600 bg-green-50 px-3 py-2.5 text-[12.5px] text-green-700">
          Imported {imported.lessons} lesson{imported.lessons === 1 ? "" : "s"} across{" "}
          {imported.sections} section{imported.sections === 1 ? "" : "s"} as a <b>draft</b>.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => router.push(`/admin/learning/${imported.courseId}`)}
          >
            Open it
          </button>{" "}
          to review and publish.
        </div>
      ) : null}
    </div>
  );
}
