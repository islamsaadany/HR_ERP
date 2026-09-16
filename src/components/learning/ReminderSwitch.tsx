"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRemindersEnabledAction } from "@/app/(app)/admin/learning/tracks/actions";
import { formatDate } from "@/lib/labels";

/**
 * The brake on the overdue chasing (spec 043, the CEO's own suggestion, mockup-approved
 * 2026-09-16).
 *
 * TWO THINGS IT DELIBERATELY DOES NOT DO, and the text on screen says both. It cannot turn email on
 * when the platform's master switch is off — it only ever narrows. And switching it off silences
 * the emails, not the problem: an overdue course still reads overdue to the employee, their manager
 * and whoever runs Learning.
 *
 * Turning it OFF is open to anyone who runs Learning — stopping mail to the whole company is always
 * safe and must be possible the moment somebody sees it going wrong. Turning it back ON needs an HR
 * Admin, which is why a learning manager is shown the switch as read-only rather than offered a
 * button that would be refused.
 */
export function ReminderSwitch({
  enabled,
  canTurnOn,
  disabledByName,
  disabledAt,
}: {
  enabled: boolean;
  canTurnOn: boolean;
  disabledByName: string | null;
  disabledAt: Date | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Off and unable to turn it on: the control would be refused, so it is not offered — but the
  // reason is said on the row rather than leaving an absent button to be read as a bug.
  const actionable = enabled || canTurnOn;

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const result = await setRemindersEnabledAction(!enabled);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 border-b border-line pb-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Reminders</h2>
      </div>

      <div className="flex items-start gap-3.5 rounded-xl border border-line bg-surface p-4">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Chase overdue courses by email"
          disabled={pending || !actionable}
          onClick={toggle}
          className={`relative mt-0.5 h-6 w-[42px] flex-none rounded-full transition disabled:opacity-60 ${
            enabled ? "bg-navy-800" : "bg-line"
          }`}
        >
          <span
            aria-hidden
            className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white transition-all ${
              enabled ? "right-[3px]" : "left-[3px]"
            }`}
          />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-navy-800">Chase overdue courses by email</p>
          <p className="mt-0.5 text-xs text-muted">
            When a deadline passes with a course unfinished, the person is emailed and their manager
            is told. At most five messages about one course — one on the day, then weekly for four
            weeks — then it stops arriving, though it stays marked overdue on every screen.
          </p>
          <p className="mt-2 text-[11.5px] text-muted">
            Anyone who runs Learning can switch this <strong>off</strong>. Switching it back{" "}
            <strong>on</strong> needs an HR Admin.
            {!enabled && disabledByName ? (
              <> Switched off by {disabledByName}{disabledAt ? ` on ${formatDate(disabledAt)}` : ""}.</>
            ) : null}
          </p>
          {!actionable ? (
            <p className="mt-2 text-[11.5px] font-semibold text-gold-800">
              You can switch this off, but only an HR Admin can switch it back on.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
