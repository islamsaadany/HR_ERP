"use client";

import { useState, useTransition } from "react";
import type { CourseResourceKind } from "@prisma/client";
import {
  approveSuggestion,
  declineSuggestion,
} from "@/app/(app)/admin/learning/materials-actions";
import { RESOURCE_KIND_LABEL, linkHost } from "@/lib/learning/materials";
import { formatDate } from "@/lib/labels";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT } from "@/components/learning/ui";

export type Suggestion = {
  id: string;
  kind: CourseResourceKind;
  name: string;
  url: string | null;
  courseId: string;
  courseTitle: string;
  suggestedByName: string | null;
  createdAt: Date;
};

/**
 * HR's review of employee-suggested resources (spec 038 materials, 2026-08-22).
 *
 * ONE queue for the whole module rather than a tab per course: reviewing four suggestions should
 * not mean opening four courses. The row says which course it is for, and approving drops it
 * straight into that course's list.
 *
 * Name and link are EDITABLE in place. A suggestion worth keeping should not be declined over a
 * typo or a missing "https", and asking HR to decline-then-retype is how good recommendations get
 * lost.
 */
export function SuggestionQueue({ suggestions }: { suggestions: Suggestion[] }) {
  const [error, setError] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-gold-300 bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-bold text-navy-800">
          Suggested resources{" "}
          <span className={CHIP.attention}>{suggestions.length} waiting</span>
        </h2>
        <p className="text-[11.5px] text-muted">from employees taking these courses</p>
      </div>

      <ul className="space-y-2">
        {suggestions.map((s) => (
          <SuggestionRow key={s.id} suggestion={s} onError={setError} />
        ))}
      </ul>

      <p className="mt-2 text-[11.5px] text-muted">
        Fix the name or the link before approving if you need to. Declining is silent — the
        employee isn&rsquo;t told, because a &ldquo;no&rdquo; on a book recommendation is not worth
        a notification.
      </p>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

function SuggestionRow({
  suggestion,
  onError,
}: {
  suggestion: Suggestion;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(suggestion.name);
  const [url, setUrl] = useState(suggestion.url ?? "");

  function approve() {
    onError(null);
    const formData = new FormData();
    formData.set("resourceId", suggestion.id);
    formData.set("name", name);
    formData.set("url", url);
    startTransition(async () => {
      const result = await approveSuggestion(formData);
      if (!result.ok) onError(result.error);
    });
  }

  function decline() {
    onError(null);
    startTransition(async () => {
      const result = await declineSuggestion(suggestion.id);
      if (!result.ok) onError(result.error);
    });
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-start gap-2.5">
        <span className="w-[62px] flex-none">
          <span className={CHIP.navy}>{RESOURCE_KIND_LABEL[suggestion.kind]}</span>
        </span>

        <span className="min-w-0 flex-1">
          {editing ? (
            <span className="flex flex-wrap gap-2">
              <input
                aria-label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${INPUT} min-w-[160px] flex-1`}
              />
              <input
                aria-label="Link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className={`${INPUT} min-w-[160px] flex-1`}
              />
            </span>
          ) : (
            <>
              <span className="block text-[13px] font-semibold text-ink">{name}</span>
              <span className="text-[11.5px] text-muted">
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer noopener" className="hover:underline">
                    {linkHost(url)} ↗
                  </a>
                ) : (
                  "no link"
                )}
              </span>
            </>
          )}
          <span className="mt-0.5 block text-[11.5px] text-muted">
            {suggestion.suggestedByName ?? "Someone"} · for <b>{suggestion.courseTitle}</b> ·{" "}
            {formatDate(suggestion.createdAt)}
          </span>
        </span>

        <span className="flex flex-none flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            disabled={pending}
            className="text-[11px] font-semibold text-navy-700 hover:underline disabled:opacity-60"
          >
            {editing ? "Done" : "Edit"}
          </button>
          <button type="button" onClick={approve} disabled={pending} className={BTN_NAVY}>
            Approve
          </button>
          <button type="button" onClick={decline} disabled={pending} className={BTN_GHOST}>
            Decline
          </button>
        </span>
      </div>
    </li>
  );
}
