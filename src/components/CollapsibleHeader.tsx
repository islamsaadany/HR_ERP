"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BackLink } from "@/components/admin/BackLink";

/**
 * Page header with an icon-only collapse chevron (top-right). Collapsing folds
 * away the title block (children) to give the data table below more height;
 * the optional back link and everything outside this component (search, filters,
 * the table itself) stay visible. The preference is remembered per browser via
 * `storageKey`. Mirrors the employee-registry header treatment (2026-08-12) so
 * every single-scroll data page collapses the same way.
 */
export function CollapsibleHeader({
  storageKey,
  backHref,
  backLabel,
  children,
}: {
  storageKey: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(storageKey, next ? "1" : "0");
      return next;
    });
  }

  const label = collapsed ? "Show header" : "Hide header";

  return (
    // min-h keeps a row for the chevron even when there is no back link and the
    // title is collapsed, so the absolute chevron never overlaps the content below.
    <div className="relative min-h-8">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        aria-expanded={!collapsed}
        className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-navy-500 transition hover:bg-navy-50 hover:text-navy-800"
      >
        <svg
          viewBox="0 0 24 24"
          className={"h-4 w-4 transition-transform " + (collapsed ? "rotate-180" : "")}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      {backHref ? <BackLink href={backHref} label={backLabel ?? "Back"} /> : null}
      {collapsed ? null : <div>{children}</div>}
    </div>
  );
}
