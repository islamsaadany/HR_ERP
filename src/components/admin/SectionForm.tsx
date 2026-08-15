"use client";

import { useActionState } from "react";
import type { SectionActionState } from "@/app/(app)/admin/handbook/actions";

export type SectionValues = {
  title: string;
  slug: string | null;
  summary: string | null;
  body: string;
  order: number;
  active: boolean;
};

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export function SectionForm({
  action,
  values,
  submitLabel,
}: {
  action: (
    prev: SectionActionState,
    formData: FormData
  ) => Promise<SectionActionState>;
  values: SectionValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<SectionActionState, FormData>(
    action,
    null
  );
  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {state?.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <div>
        <label htmlFor={"section-title"} className={L}>Title *</label>
        <input id={"section-title"} name="title" defaultValue={values.title} required className={I} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={"section-slug"} className={L}>Slug (optional)</label>
          <input id={"section-slug"}
            name="slug"
            defaultValue={values.slug ?? ""}
            placeholder="auto from title"
            className={I}
          />
        </div>
        <div>
          <label htmlFor={"section-order"} className={L}>Order</label>
          <input id={"section-order"} name="order" type="number" defaultValue={values.order} className={I} />
        </div>
      </div>
      <div>
        <label htmlFor={"section-summary"} className={L}>Summary</label>
        <input id={"section-summary"} name="summary" defaultValue={values.summary ?? ""} className={I} />
      </div>
      <div>
        <label htmlFor={"section-body"} className={L}>Body</label>
        <textarea id={"section-body"} name="body" defaultValue={values.body} rows={12} className={I} />
      </div>
      <label htmlFor={"section-active"} className="flex items-center gap-2 text-sm text-ink">
        <input id={"section-active"}
          name="active"
          type="checkbox"
          defaultChecked={values.active}
          className="h-4 w-4"
        />
        Active (visible to employees)
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <a href="/admin/handbook" className="text-sm text-muted hover:text-ink">
          Cancel
        </a>
      </div>
    </form>
  );
}
