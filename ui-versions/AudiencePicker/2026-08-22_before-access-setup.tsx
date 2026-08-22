"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AudienceKind } from "@prisma/client";
import {
  addAudience,
  assignToGroup,
  assignToUser,
  removeAudience,
  revokeAssignment,
  setVisibility,
} from "@/app/(app)/admin/learning/access-actions";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type RouteRow = {
  id: string;
  /** Which sort of route this row is — the column that answers "why can they see this?". */
  kind: "AUDIENCE" | "GROUP" | "DIRECT";
  label: string;
  detail: string;
  reach: number;
};

export type PickerOptions = {
  departments: string[];
  businessUnits: Array<{ id: string; name: string }>;
  managers: Array<{ id: string; name: string }>;
  groups: Array<{ id: string; name: string; memberCount: number }>;
  employees: Array<{ id: string; name: string; department: string | null }>;
};

const KIND_LABEL: Record<AudienceKind, string> = {
  ALL_ACTIVE: "Everyone",
  DEPARTMENT: "Department",
  BUSINESS_UNIT: "Business unit",
  EMPLOYMENT_TYPE: "Employment type",
  TENURE_BAND: "Tenure band",
  REPORTS_TO: "Reports to",
};

const TENURE_LABEL: Record<string, string> = {
  BAND_6MO_2Y: "6 months – 2 years",
  BAND_2_4Y: "2 – 4 years",
  BAND_4_7Y: "4 – 7 years",
  BAND_7_10Y: "7 years and over",
};

/**
 * The Access tab: which routes reach this course, and how many people each reaches today.
 *
 * The live "people today" count matters more than it looks. An audience is a rule, not a list, so
 * without it nobody can tell whether "Consulting" means nine people or nobody — and a rule that
 * reaches nobody looks identical to one that works.
 */
export function AudiencePicker({
  courseId,
  visibility,
  routes,
  totalReach,
  options,
}: {
  courseId: string;
  visibility: "OPEN" | "RESTRICTED";
  routes: RouteRow[];
  totalReach: number;
  options: PickerOptions;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<AudienceKind>("DEPARTMENT");
  const [value, setValue] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "That didn't work.");
      else {
        setValue("");
        router.refresh();
      }
    });
  }

  const valueOptions: Array<{ v: string; label: string }> =
    kind === "DEPARTMENT"
      ? options.departments.map((d) => ({ v: d, label: d }))
      : kind === "BUSINESS_UNIT"
        ? options.businessUnits.map((b) => ({ v: b.id, label: b.name }))
        : kind === "EMPLOYMENT_TYPE"
          ? [
              { v: "FULL_TIME", label: "Full-time" },
              { v: "PART_TIME", label: "Part-time" },
            ]
          : kind === "TENURE_BAND"
            ? Object.entries(TENURE_LABEL).map(([v, label]) => ({ v, label }))
            : kind === "REPORTS_TO"
              ? options.managers.map((m) => ({ v: m.id, label: m.name }))
              : [];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={visibility === "OPEN" ? CHIP.navy : CHIP.muted}>
          {visibility === "OPEN" ? "Open to everyone" : "Restricted"}
        </span>
        <button
          type="button"
          disabled={pending}
          className={BTN_GHOST}
          onClick={() =>
            run(() => setVisibility(courseId, visibility === "OPEN" ? "RESTRICTED" : "OPEN"))
          }
        >
          {visibility === "OPEN" ? "Restrict to specific people" : "Open to everyone"}
        </button>
        <span className="text-xs text-muted">
          {visibility === "OPEN"
            ? "Every active employee can see this course."
            : "Only the people reached below can see this course."}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mb-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </p>
      ) : null}

      {visibility === "RESTRICTED" ? (
        <>
          <div className="ff-data-scroll overflow-x-auto rounded-xl border border-line">
            <table className="ff-data-table w-full text-[13px]">
              <thead>
                <tr>
                  <th className="px-2.5 py-2 text-left">Route</th>
                  <th className="px-2.5 py-2 text-left">Reaches</th>
                  <th className="px-2.5 py-2 text-right">People today</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2.5 py-4 text-muted">
                      Nobody can see this course yet. Add an audience, a group, or a person below.
                    </td>
                  </tr>
                ) : (
                  routes.map((route) => (
                    <tr key={route.id}>
                      <td className="px-2.5 py-2">
                        <span className={route.kind === "AUDIENCE" ? CHIP.navy : CHIP.muted}>
                          {route.kind === "AUDIENCE"
                            ? `Audience · ${route.label}`
                            : route.kind === "GROUP"
                              ? "Group"
                              : "Direct"}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">{route.detail}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{route.reach}</td>
                      <td className="px-2.5 py-2 text-right">
                        <button
                          type="button"
                          disabled={pending}
                          className="text-xs text-red-700 hover:underline"
                          onClick={() =>
                            run(() =>
                              route.kind === "AUDIENCE"
                                ? removeAudience(courseId, route.id)
                                : revokeAssignment(courseId, route.id)
                            )
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {routes.length > 1 ? (
            <p className="mt-2.5 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
              Routes <b>add up</b> — {totalReach} {totalReach === 1 ? "person" : "people"} in total,
              which is fewer than the rows above if anyone matches more than one. Someone reached
              twice keeps the course until the last route goes.
            </p>
          ) : null}

          <div className="mt-4 rounded-xl border border-line bg-surface p-4">
            <p className="mb-2 text-[13px] font-bold text-navy-800">Add a route</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[150px]">
                <label className={LABEL} htmlFor="aud-kind">Audience</label>
                <select
                  id="aud-kind"
                  className={INPUT}
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as AudienceKind);
                    setValue("");
                  }}
                >
                  {Object.entries(KIND_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {kind !== "ALL_ACTIVE" ? (
                <div className="min-w-[190px]">
                  <label className={LABEL} htmlFor="aud-value">Which</label>
                  <select
                    id="aud-value"
                    className={INPUT}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {valueOptions.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <button
                type="button"
                disabled={pending || (kind !== "ALL_ACTIVE" && !value)}
                className={BTN_NAVY}
                onClick={() => run(() => addAudience(courseId, kind, value || null))}
              >
                Add audience
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <div className="min-w-[190px]">
                <label className={LABEL} htmlFor="grp">Or a group</label>
                <select
                  id="grp"
                  className={INPUT}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) run(() => assignToGroup(courseId, e.target.value));
                  }}
                >
                  <option value="">Choose a group…</option>
                  {options.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberCount})
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-[190px]">
                <label className={LABEL} htmlFor="person">Or one person</label>
                <select
                  id="person"
                  className={INPUT}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) run(() => assignToUser(courseId, e.target.value));
                  }}
                >
                  <option value="">Choose an employee…</option>
                  {options.employees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.department ? ` — ${p.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
