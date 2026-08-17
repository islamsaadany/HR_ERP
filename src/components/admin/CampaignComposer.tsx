"use client";

import { useActionState, useState } from "react";
import { createCampaign, type CampaignState } from "@/app/(app)/admin/data-requests/actions";

export type ComposerField = { key: string; label: string };

/**
 * The campaign composer (spec 033, US2, mockup-approved): title, field checkboxes from the
 * registry, audience (everyone / departments / picked employees). Launch resolves the
 * audience server-side to a frozen list of active employees.
 */
export function CampaignComposer({
  fields,
  departments,
  employees,
}: {
  fields: ComposerField[];
  departments: string[];
  employees: { id: string; name: string; department: string | null }[];
}) {
  const [state, formAction, pending] = useActionState<CampaignState, FormData>(
    createCampaign,
    null
  );
  const [audience, setAudience] = useState<"all" | "departments" | "picked">("all");
  const [picked, setPicked] = useState(0);
  const [checked, setChecked] = useState(0);

  const chip =
    "flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-sm text-ink has-[:checked]:border-navy-500 has-[:checked]:bg-navy-50 has-[:checked]:text-navy-800";

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <section className="rounded-xl border border-line bg-surface p-6">
        <label htmlFor="camp-title" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
          Title (employees see this)
        </label>
        <input
          id="camp-title"
          name="title"
          required
          maxLength={120}
          placeholder="e.g. Employee records update"
          className="w-full max-w-[380px] rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />

        <div className="mt-5">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
            Fields to request
          </span>
          <div className="flex flex-wrap gap-2">
            {fields.map((f) => (
              <label key={f.key} className={chip}>
                <input
                  type="checkbox"
                  name="fields"
                  value={f.key}
                  onChange={(e) => setChecked((n) => n + (e.target.checked ? 1 : -1))}
                  className="accent-navy-700"
                />
                {f.label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Empty fields are asked to be filled; already-filled ones to be verified.
          </p>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted">
            Audience
          </span>
          <div className="flex flex-wrap gap-4 text-sm text-ink">
            {(
              [
                ["all", "All active employees"],
                ["departments", "Departments…"],
                ["picked", "Pick employees…"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="audience"
                  value={value}
                  checked={audience === value}
                  onChange={() => setAudience(value)}
                  className="accent-navy-700"
                />
                {label}
              </label>
            ))}
          </div>

          {audience === "departments" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {departments.map((d) => (
                <label key={d} className={chip}>
                  <input type="checkbox" name="departments" value={d} className="accent-navy-700" />
                  {d}
                </label>
              ))}
            </div>
          ) : null}

          {audience === "picked" ? (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line">
              {employees.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-3 border-b border-line px-3 py-2 text-sm last:border-b-0 hover:bg-navy-50"
                >
                  <input
                    type="checkbox"
                    name="userIds"
                    value={e.id}
                    onChange={(ev) => setPicked((n) => n + (ev.target.checked ? 1 : -1))}
                    className="accent-navy-700"
                  />
                  <span className="text-ink">{e.name}</span>
                  {e.department ? <span className="text-xs text-muted">{e.department}</span> : null}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || checked === 0 || (audience === "picked" && picked === 0)}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
        >
          {pending ? "Launching…" : "Launch request"}
        </button>
        <a href="/admin/data-requests" className="text-sm text-muted hover:text-ink">
          Cancel
        </a>
      </div>

      {state?.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      ) : null}
    </form>
  );
}
