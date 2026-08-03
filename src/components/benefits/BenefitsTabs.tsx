"use client";

import { useState } from "react";

/**
 * Two-tab wrapper for the submitted benefits page: "Your benefits" (the read-only
 * selections summary) and "Claims & reimbursement". Both panels are server-rendered
 * and passed in as props; the inactive one is hidden (not unmounted) so nothing resets.
 */
export function BenefitsTabs({
  benefitsPanel,
  claimsPanel,
  claimCount = 0,
}: {
  benefitsPanel: React.ReactNode;
  claimsPanel: React.ReactNode;
  claimCount?: number;
}) {
  const [tab, setTab] = useState<0 | 1>(0);
  const cls = (on: boolean) =>
    "relative px-1 pb-3 text-sm font-semibold transition " +
    (on
      ? "text-navy-800 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold-500"
      : "text-muted hover:text-navy-700");

  return (
    <div className="mt-8">
      <div className="flex gap-6 border-b border-line" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 0} onClick={() => setTab(0)} className={cls(tab === 0)}>
          Your benefits
        </button>
        <button type="button" role="tab" aria-selected={tab === 1} onClick={() => setTab(1)} className={cls(tab === 1)}>
          Claims &amp; reimbursement
          {claimCount > 0 ? (
            <span className="ml-2 rounded-full bg-gold-100 px-1.5 py-0.5 text-[11px] font-bold text-gold-800">
              {claimCount}
            </span>
          ) : null}
        </button>
      </div>
      <div className={tab === 0 ? "" : "hidden"}>{benefitsPanel}</div>
      <div className={tab === 1 ? "" : "hidden"}>{claimsPanel}</div>
    </div>
  );
}
