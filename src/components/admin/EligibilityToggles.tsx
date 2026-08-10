"use client";

import { useState, useTransition } from "react";
import { setEligibility } from "@/app/(app)/admin/benefits/config-actions";

/**
 * FT / PT eligibility checkboxes for a row in the unified Benefits Catalogue (spec 021).
 * Toggling either box submits both current states to the server; absence = not eligible.
 * Works for guaranteed benefits and flexible/medical catalog items (via `kind`).
 */
export function EligibilityToggles({ kind, id, ft, pt }: { kind: "guaranteed" | "catalog"; id: string; ft: boolean; pt: boolean }) {
  const [ftOn, setFt] = useState(ft);
  const [ptOn, setPt] = useState(pt);
  const [pending, start] = useTransition();

  function submit(nextFt: boolean, nextPt: boolean) {
    setFt(nextFt);
    setPt(nextPt);
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("id", id);
    if (nextFt) fd.set("eligibleFullTime", "true");
    if (nextPt) fd.set("eligiblePartTime", "true");
    start(() => {
      setEligibility(fd);
    });
  }

  const label = "flex items-center gap-1 text-xs font-semibold text-navy-700";
  return (
    <div className={"flex items-center gap-3 " + (pending ? "opacity-60" : "")}>
      <label className={label}>
        <input type="checkbox" checked={ftOn} onChange={(e) => submit(e.target.checked, ptOn)} className="h-4 w-4" /> FT
      </label>
      <label className={label}>
        <input type="checkbox" checked={ptOn} onChange={(e) => submit(ftOn, e.target.checked)} className="h-4 w-4" /> PT
      </label>
    </div>
  );
}
