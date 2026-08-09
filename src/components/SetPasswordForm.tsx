"use client";

import { useState } from "react";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { passwordMeetsPolicy } from "@/lib/password-policy";

const L = "block text-xs font-medium uppercase tracking-wide text-muted mb-1";
const I =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

/**
 * First-time set-password form (client island for the server-rendered set-password page).
 * Shows the live requirement checklist and disables submit until the password meets policy
 * and both entries match. The server action still validates authoritatively.
 */
export function SetPasswordForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = passwordMeetsPolicy(next) && next === confirm && confirm.length > 0;

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="next" className={L}>New password</label>
        <input
          id="next"
          name="next"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={I}
        />
        <PasswordChecklist value={next} />
      </div>
      <div>
        <label htmlFor="confirm" className={L}>Confirm new password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={I}
        />
        {mismatch ? <p className="mt-1 text-xs text-red-600">The two passwords don&apos;t match.</p> : null}
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-lg bg-navy-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-50"
      >
        Save and continue
      </button>
    </form>
  );
}
