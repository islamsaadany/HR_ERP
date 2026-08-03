"use client";

import { useActionState } from "react";
import { setUserPassword, type SetPasswordState } from "@/app/(app)/admin/employees/password-actions";

/**
 * Admin set/reset password card (shown on the employee edit page). Sets an
 * employee's sign-in password, or generates a temporary one when left blank,
 * and shows the result once so the admin can hand it over.
 */
export function AdminPasswordCard({ userId, name }: { userId: string; name: string }) {
  const action = setUserPassword.bind(null, userId);
  const [state, formAction, pending] = useActionState<SetPasswordState, FormData>(action, null);

  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-serif text-lg text-ink">Sign-in password</h2>
      <p className="mt-1 text-sm text-muted">
        Set a password for {name}, or leave it blank to generate a temporary one. They sign in with
        their <span className="font-medium">email + this password</span> (or Google). Share it securely —
        it isn&apos;t emailed.
      </p>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">New password (optional)</label>
          <input name="password" type="text" autoComplete="off" placeholder="Leave blank to generate" className={input} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Set / reset password"}
        </button>
      </form>

      {state?.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      {state?.password ? (
        <div className="mt-3 rounded-lg border border-gold-300 bg-gold-50 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gold-700">
            New password — copy it now, it won&apos;t be shown again
          </div>
          <div className="mt-1 select-all font-mono text-lg text-navy-900">{state.password}</div>
        </div>
      ) : null}
    </div>
  );
}
