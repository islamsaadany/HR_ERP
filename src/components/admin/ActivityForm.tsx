"use client";

import { useActionState } from "react";
import type { ActivityActionState } from "@/app/(app)/admin/onboarding/actions";
import { STAGE_SUGGESTIONS } from "@/lib/onboarding";

export type ActivityValues = {
  title: string;
  description: string | null;
  type: string;
  stage: string;
  track: string;
  linkUrl: string | null;
  order: number;
  active: boolean;
};

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export function ActivityForm({
  action,
  values,
  submitLabel,
}: {
  action: (
    prev: ActivityActionState,
    formData: FormData
  ) => Promise<ActivityActionState>;
  values: ActivityValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActivityActionState, FormData>(
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
        <label htmlFor={"activity-title"} className={L}>Title *</label>
        <input id={"activity-title"} name="title" defaultValue={values.title} required className={I} />
      </div>
      <div>
        <label htmlFor={"activity-description"} className={L}>Description</label>
        <textarea id={"activity-description"}
          name="description"
          defaultValue={values.description ?? ""}
          rows={2}
          className={I}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={"activity-type"} className={L}>Type</label>
          <select id={"activity-type"} name="type" defaultValue={values.type} className={I}>
            <option value="POLICY">Policy (read &amp; acknowledge)</option>
            <option value="ACTION">Action (do &amp; complete)</option>
          </select>
        </div>
        <div>
          <label htmlFor={"activity-stage"} className={L}>Stage</label>
          <input id={"activity-stage"} name="stage" defaultValue={values.stage} list="stage-suggestions" placeholder="e.g. Week 1" className={I} />
          <datalist id="stage-suggestions">
            {STAGE_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-muted">Free text — activities group by stage, ordered by the Order field.</p>
        </div>
        <div>
          <label htmlFor={"activity-track"} className={L}>Track</label>
          <select id={"activity-track"} name="track" defaultValue={values.track} className={I}>
            <option value="COMMON_CORE">Everyone (common core)</option>
            <option value="CONSULTING">Consulting</option>
          </select>
        </div>
        <div>
          <label htmlFor={"activity-order"} className={L}>Order</label>
          <input id={"activity-order"}
            name="order"
            type="number"
            defaultValue={values.order}
            className={I}
          />
        </div>
      </div>
      <div>
        <label htmlFor={"activity-linkUrl"} className={L}>Link (optional)</label>
        <input id={"activity-linkUrl"}
          name="linkUrl"
          defaultValue={values.linkUrl ?? ""}
          placeholder="https://…"
          className={I}
        />
      </div>
      <label htmlFor={"activity-active"} className="flex items-center gap-2 text-sm text-ink">
        <input id={"activity-active"}
          name="active"
          type="checkbox"
          defaultChecked={values.active}
          className="h-4 w-4"
        />
        Active (visible to joiners)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <a href="/admin/onboarding" className="text-sm text-muted hover:text-ink">
          Cancel
        </a>
      </div>
    </form>
  );
}
