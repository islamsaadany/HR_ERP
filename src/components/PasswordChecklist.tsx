"use client";

import { PASSWORD_RULES } from "@/lib/password-policy";

/**
 * Live password-requirement checklist: each house rule flips to a green check the
 * moment the typed password satisfies it (spec: smoother password creation). Uses
 * the same PASSWORD_RULES the server validates against, so UI and enforcement can't drift.
 */
export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li
            key={rule.id}
            className={"flex items-center gap-2 text-xs " + (ok ? "text-green-700" : "text-muted")}
          >
            <span
              aria-hidden="true"
              className={
                "grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors " +
                (ok ? "bg-green-500 text-white" : "border border-line text-transparent")
              }
            >
              ✓
            </span>
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " — met" : " — not met"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
