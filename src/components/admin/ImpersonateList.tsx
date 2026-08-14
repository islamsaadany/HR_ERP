"use client";

import { useState } from "react";
import { startImpersonation } from "@/app/(app)/admin/impersonate/actions";

export type ImpersonateEmployee = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  department: string | null;
  role: string;
  status: string;
};

/**
 * Searchable list of employees a Super User can "view as". Super Users and the
 * actor themselves are shown but not impersonable (the reason is labeled). Each
 * "View as" button posts to the `startImpersonation` server action, which sets
 * the cookie and drops the actor into the app as that employee.
 */
export function ImpersonateList({
  employees,
  myId,
}: {
  employees: ImpersonateEmployee[];
  myId: string;
}) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const rows = term
    ? employees.filter((e) =>
        `${e.name} ${e.email} ${e.title ?? ""} ${e.department ?? ""}`.toLowerCase().includes(term),
      )
    : employees;

  return (
    <div className="mt-6">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, email, title, or department…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
      />

      <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No employees match “{q}”.</p>
        ) : (
          rows.map((e) => {
            const isSelf = e.id === myId;
            const isSuper = e.role === "SUPER_USER";
            const left = e.status === "LEFT";
            const blocked = isSelf || isSuper;
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-ink">{e.name}</span>
                    {left ? (
                      <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-600">
                        Left
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted">
                    {e.title ?? "—"}
                    {e.department ? ` · ${e.department}` : ""} · {e.email}
                  </div>
                </div>
                {blocked ? (
                  <span className="flex-shrink-0 text-xs text-muted">{isSelf ? "You" : "Super User"}</span>
                ) : (
                  <form action={startImpersonation} className="flex-shrink-0">
                    <input type="hidden" name="targetId" value={e.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 transition hover:border-navy-800 hover:bg-navy-800 hover:text-white"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      View as
                    </button>
                  </form>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
