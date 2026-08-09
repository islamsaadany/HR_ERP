"use client";

import { useActionState } from "react";
import { changeMyPassword, type ChangePasswordState } from "@/app/(app)/profile/password-actions";

/** Self-service password change on the user's own profile. */
export function ChangePasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changeMyPassword,
    null
  );

  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="font-serif text-lg text-ink">
        {hasPassword ? "Change password" : "Set a password"}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {hasPassword
          ? "Update the password you use to sign in with your email."
          : "Set a password so you can sign in with your email as well as Google."}
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        {hasPassword ? (
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Current password</label>
            <input name="current" type="password" autoComplete="current-password" className={input} />
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">New password</label>
          <input name="next" type="password" autoComplete="new-password" required className={input} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : hasPassword ? "Update password" : "Set password"}
        </button>
      </form>

      {state?.error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="mt-3 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">Password updated.</p>
      ) : null}
    </div>
  );
}
