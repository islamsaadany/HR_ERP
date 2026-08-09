"use client";

import { useEffect, useState } from "react";

/**
 * Two-tab wrapper for the submitted benefits page: "Your benefits" (the read-only
 * selections summary) and "Claims & reimbursement". Both panels are server-rendered
 * and passed in as props; the inactive one is hidden (not unmounted) so nothing resets.
 *
 * The tab bar stays pinned just beneath the sticky page header while you scroll either
 * panel. It measures the header (`#benefits-header`) so it lands flush on every width —
 * the header's own squeeze-on-scroll behaviour is untouched.
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
  const [headerH, setHeaderH] = useState(0);

  // Keep the tab bar's sticky offset in step with the header height (font load,
  // resize, mobile vs desktop) so the two sticky bands never overlap or gap.
  useEffect(() => {
    const header = document.getElementById("benefits-header");
    if (!header) return;
    const update = () => setHeaderH(header.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const cls = (on: boolean) =>
    "relative px-1 pb-3 text-sm font-semibold transition " +
    (on
      ? "text-navy-800 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold-500"
      : "text-muted hover:text-navy-700");

  return (
    <div className="mt-8">
      {/* Pinned tab bar — full-bleed frosted band beneath the header (matches it). */}
      <div
        role="tablist"
        style={{ top: headerH }}
        className="sticky z-10 -mx-6 flex gap-6 border-b border-line bg-paper/95 px-6 pt-1 backdrop-blur md:-mx-10 md:px-10"
      >
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
