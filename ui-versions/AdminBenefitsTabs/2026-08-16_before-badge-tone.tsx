"use client";

import { useState, type ReactNode } from "react";

/**
 * Tab wrapper for the admin Benefits page — Configuration / Submissions & claims /
 * Claim requirements. Panels are server-rendered and passed in as props; the inactive
 * ones are hidden (not unmounted) so nothing resets on switch. Styling mirrors the
 * employee BenefitsTabs (gold underline on the active tab).
 */
export function AdminBenefitsTabs({
  tabs,
}: {
  tabs: { id: string; label: string; badge?: number; node: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.id);

  const cls = (on: boolean) =>
    "relative px-1 pb-3 text-sm font-semibold transition " +
    (on
      ? "text-navy-800 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold-500"
      : "text-muted hover:text-navy-700");

  return (
    <div className="mt-6 md:flex md:min-h-0 md:flex-1 md:flex-col">
      <div role="tablist" className="flex gap-6 border-b border-line pt-1 md:shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={cls(active === t.id)}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-2 rounded-full bg-gold-100 px-1.5 py-0.5 text-[11px] font-bold text-gold-800">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "mt-6 md:flex md:min-h-0 md:flex-1 md:flex-col" : "hidden"}>
          {t.node}
        </div>
      ))}
    </div>
  );
}
