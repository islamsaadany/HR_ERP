"use client";

import { useMemo, useState } from "react";

/** One row in the picker. `hasPassword` is a boolean — the hash never leaves the server. */
export type PickerEmployee = { id: string; name: string; email: string; hasPassword: boolean };

/**
 * "Reset selected employees…" — the picker behind the registry's Passwords menu.
 *
 * The registry could already reset one person (on their edit page), everyone without a password,
 * or everyone (Super User). This covers the case in between: HR ticks a specific set of people.
 * It posts to the same `generateTeamPasswords` action as the other two bulk items — the parent
 * owns the action state, so the one-time result table and CSV below the header are reused as-is.
 *
 * Only ACTIVE employees are listed, matching what the server will actually reset, and the acting
 * admin is never in the list (nor accepted server-side) so nobody can lock themselves out.
 */
export function ResetSelectedPasswordsModal({
  open,
  onClose,
  employees,
  formAction,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  employees: PickerEmployee[];
  /**
   * Submits to `generateTeamPasswords` and closes this picker. It must dispatch
   * before closing — see `runAndClose` in RegistryHeader.
   */
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  // Mounted only while open, so the search box and ticks start clean every time.
  if (!open) return null;
  return (
    <PickerDialog
      onClose={onClose}
      employees={employees}
      formAction={formAction}
      pending={pending}
    />
  );
}

function PickerDialog({
  onClose,
  employees,
  formAction,
  pending,
}: {
  onClose: () => void;
  employees: PickerEmployee[];
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q)
    );
  }, [employees, query]);

  const shownSelectedCount = shown.reduce((n, e) => (selected.has(e.id) ? n + 1 : n), 0);
  const allShownSelected = shown.length > 0 && shownSelectedCount === shown.length;
  const someShownSelected = shownSelectedCount > 0 && !allShownSelected;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      // Ticking clears only what's on screen, so a selection made under an
      // earlier search survives a new one.
      for (const e of shown) {
        if (allShownSelected) next.delete(e.id);
        else next.add(e.id);
      }
      return next;
    });
  }

  const count = selected.size;
  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-selected-title"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="reset-selected-title" className="font-serif text-lg text-ink">
              Reset passwords for selected employees
            </h2>
            <p className="mt-1 text-sm text-muted">
              Each person you pick gets a new temporary password and must choose their own the next
              time they sign in. You&apos;ll get the list to download once.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-muted hover:bg-paper hover:text-ink"
          >
            ✕
          </button>
        </div>

        {employees.length === 0 ? (
          <p className="mt-4 rounded-lg bg-paper px-4 py-3 text-sm text-muted">
            There are no other active employees to reset.
          </p>
        ) : (
          <form action={formAction} className="mt-4 flex min-h-0 flex-col">
            <input type="hidden" name="mode" value="selected" />
            {[...selected].map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}

            <label htmlFor="reset-selected-search" className="sr-only">
              Search employees by name or email
            </label>
            <input
              id="reset-selected-search"
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              className={input}
            />

            <div className="mt-3 flex items-center justify-between gap-3 px-0.5">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-[15px] w-[15px] accent-navy-800"
                  checked={allShownSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someShownSelected;
                  }}
                  onChange={toggleAllShown}
                  disabled={shown.length === 0}
                />
                <span className="text-[13px] font-semibold text-navy-700">
                  Select all {shown.length} shown
                </span>
              </label>
              <span className="text-[13px] text-muted">Active employees only</span>
            </div>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-line">
              {shown.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  No employee matches “{query.trim()}”.
                </p>
              ) : (
                shown.map((e) => {
                  const on = selected.has(e.id);
                  return (
                    <label
                      key={e.id}
                      className={`flex cursor-pointer items-center gap-3 border-t border-line px-3 py-2 first:border-t-0 hover:bg-navy-50 ${
                        on ? "bg-navy-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-[15px] w-[15px] shrink-0 accent-navy-800"
                        checked={on}
                        onChange={() => toggleOne(e.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{e.name}</span>
                        <span className="block truncate text-xs text-muted">{e.email}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          e.hasPassword
                            ? "border-line bg-paper text-muted"
                            : "border-gold-300 bg-gold-50 text-gold-700"
                        }`}
                      >
                        {e.hasPassword ? "Has password" : "No password yet"}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-sm text-muted">
                <strong className="font-semibold text-ink">{count}</strong> selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={count === 0 || pending}
                  onClick={(e) => {
                    // Only ever cancel here. Closing the picker in this handler would
                    // unmount the form before `submit` fires and silently kill the
                    // action — `formAction` closes it after dispatching instead.
                    if (
                      !window.confirm(
                        `Reset the sign-in password for ${count} employee${count === 1 ? "" : "s"}? Each gets a temporary password and must choose a new one at next sign-in.`
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
                >
                  Reset {count} password{count === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
