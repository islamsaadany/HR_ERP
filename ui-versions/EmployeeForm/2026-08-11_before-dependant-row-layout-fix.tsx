"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/app/(app)/admin/employees/actions";
import { deriveTenureBand, statusFromEndDate } from "@/lib/tenure";
import { TENURE_BAND_LABEL, STATUS_LABEL } from "@/lib/labels";

type Dep = { name: string | null; dateOfBirth: string; kind: "CHILD" | "SPOUSE" };

export type EmployeeFormValues = {
  name: string;
  email: string;
  phone: string | null;
  department: string | null;
  title: string | null;
  role: string;
  employmentType: string | null;
  tenureBand: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  monthlySalary: string | null;
  status: string;
  dateOfBirth: string | null;
  maritalStatus: string | null;
  reportsToId: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  dependants: Dep[];
};

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

export function EmployeeForm({
  action,
  values,
  managers,
  departments,
  canEditRole,
  canSeeSalary,
  submitLabel,
  companyDomain = "forefront.consulting",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  values: EmployeeFormValues;
  managers: { id: string; name: string }[];
  /** Managed department list (spec 014). The employee's current value is kept even if not in the list. */
  departments: string[];
  canEditRole: boolean;
  /** Salary is confidential — the field is omitted entirely unless the actor is a Super User. */
  canSeeSalary: boolean;
  submitLabel: string;
  /** Company email domain — a non-matching address raises a non-blocking warning. */
  companyDomain?: string;
}) {
  // Keep the employee's existing department selectable even if it's a legacy value not in the list.
  const deptOptions =
    values.department && !departments.includes(values.department)
      ? [values.department, ...departments]
      : departments;

  // Tenure band and status are derived, not entered: band from the start date,
  // status from the end date. Track the dates so the read-only displays update live.
  const [startDate, setStartDate] = useState(values.startDate ?? "");
  const [endDate, setEndDate] = useState(values.endDate ?? "");
  const derivedBand = deriveTenureBand(startDate ? new Date(startDate) : null).band;
  const derivedStatus = statusFromEndDate(endDate ? new Date(endDate) : null);
  const RO = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink";
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null
  );
  const [deps, setDeps] = useState<Dep[]>(values.dependants);
  const [email, setEmail] = useState(values.email);
  const offDomain =
    email.trim() !== "" && !email.trim().toLowerCase().endsWith(`@${companyDomain.toLowerCase()}`);

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      <input type="hidden" name="dependants" value={JSON.stringify(deps)} />

      {state?.error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Identity & contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={L}>Full name *</label>
            <input name="name" defaultValue={values.name} required className={I} />
          </div>
          <div>
            <label className={L}>Email *</label>
            <input
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={I}
            />
            {offDomain ? (
              <p className="mt-1 text-xs text-gold-700">
                This isn&apos;t a @{companyDomain} address. They can still sign in with a password — just
                double-check it&apos;s correct.
              </p>
            ) : null}
          </div>
          <div>
            <label className={L}>Phone</label>
            <input name="phone" defaultValue={values.phone ?? ""} className={I} />
          </div>
          <div>
            <label className={L}>Department</label>
            <select name="department" defaultValue={values.department ?? ""} className={I}>
              <option value="">—</option>
              {deptOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={L}>Title</label>
            <input name="title" defaultValue={values.title ?? ""} className={I} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Employment</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={L}>Employment type</label>
            <select name="employmentType" defaultValue={values.employmentType ?? ""} className={I}>
              <option value="">—</option>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
            </select>
          </div>
          <div>
            <label className={L}>Tenure band</label>
            <div className={RO} aria-readonly="true">
              {derivedBand ? TENURE_BAND_LABEL[derivedBand] : "—"}
            </div>
            <p className="mt-1 text-[11px] text-muted">Calculated automatically from the start date.</p>
          </div>
          <div>
            <label className={L}>Start date</label>
            <input
              name="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={I}
            />
          </div>
          <div>
            <label className={L}>End date</label>
            <input
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={I}
            />
            <p className="mt-1 text-[11px] text-muted">Setting an end date marks the employee as Left.</p>
          </div>
          {canSeeSalary ? (
            <div>
              <label className={L}>Monthly salary (EGP)</label>
              <input name="monthlySalary" inputMode="numeric" defaultValue={values.monthlySalary ?? ""} className={I} />
            </div>
          ) : null}
          <div>
            <label className={L}>Status</label>
            <div className={RO} aria-readonly="true">{STATUS_LABEL[derivedStatus]}</div>
            <p className="mt-1 text-[11px] text-muted">Set automatically from the end date.</p>
          </div>
          <div>
            <label className={L}>Reports to</label>
            <select name="reportsToId" defaultValue={values.reportsToId ?? ""} className={I}>
              <option value="">—</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={L}>Role {canEditRole ? "" : "(Super User only)"}</label>
            <select
              name="role"
              defaultValue={values.role}
              disabled={!canEditRole}
              className={I + (canEditRole ? "" : " opacity-60")}
            >
              <option value="EMPLOYEE">Employee</option>
              <option value="HR_ADMIN">HR Admin</option>
              <option value="FINANCE">Finance</option>
              <option value="SUPER_USER">Super User</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Personal</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={L}>Date of birth</label>
            <input name="dateOfBirth" type="date" defaultValue={values.dateOfBirth ?? ""} className={I} />
          </div>
          <div>
            <label className={L}>Marital status</label>
            <select name="maritalStatus" defaultValue={values.maritalStatus ?? ""} className={I}>
              <option value="">—</option>
              <option value="SINGLE">Single</option>
              <option value="MARRIED">Married</option>
              <option value="DIVORCED">Divorced</option>
              <option value="WIDOWED">Widowed</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label className={L}>Dependants</label>
            <button
              type="button"
              onClick={() => setDeps([...deps, { name: "", dateOfBirth: "", kind: "CHILD" }])}
              className="text-xs font-semibold text-navy-600 hover:text-navy-800"
            >
              + Add dependant
            </button>
          </div>
          <div className="space-y-2">
            {deps.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              deps.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={d.kind}
                    onChange={(e) => {
                      const next = [...deps];
                      next[i] = { ...next[i], kind: e.target.value as "CHILD" | "SPOUSE" };
                      setDeps(next);
                    }}
                    className={`${I} w-28 shrink-0`}
                  >
                    <option value="CHILD">Child</option>
                    <option value="SPOUSE">Spouse</option>
                  </select>
                  <input
                    placeholder="Name"
                    value={d.name ?? ""}
                    onChange={(e) => {
                      const next = [...deps];
                      next[i] = { ...next[i], name: e.target.value };
                      setDeps(next);
                    }}
                    className={I}
                  />
                  <input
                    type="date"
                    value={d.dateOfBirth}
                    onChange={(e) => {
                      const next = [...deps];
                      next[i] = { ...next[i], dateOfBirth: e.target.value };
                      setDeps(next);
                    }}
                    className={I}
                  />
                  <button
                    type="button"
                    onClick={() => setDeps(deps.filter((_, j) => j !== i))}
                    className="shrink-0 rounded-lg border border-line px-2 py-2 text-xs text-muted hover:border-red-300 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            A dependant needs a date of birth (age is calculated). Mark the spouse as <strong>Spouse</strong> (one max) so medical can price them.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Emergency contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={L}>Contact name *</label>
            <input name="emergencyContactName" defaultValue={values.emergencyContactName ?? ""} required className={I} />
          </div>
          <div>
            <label className={L}>Relationship *</label>
            <input name="emergencyContactRelationship" defaultValue={values.emergencyContactRelationship ?? ""} required className={I} />
          </div>
          <div className="sm:col-span-2">
            <label className={L}>Contact phone *</label>
            <input name="emergencyContactPhone" defaultValue={values.emergencyContactPhone ?? ""} required className={I} />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <a href="/admin/employees" className="text-sm text-muted hover:text-ink">
          Cancel
        </a>
      </div>
    </form>
  );
}
