"use client";

import { useState } from "react";
import { saveIncentiveConfig } from "@/app/(app)/incentive/config/actions";
import { CFG_FIELDS, toInput, display } from "@/lib/incentive/config-fields";
import { InfoDot } from "./InfoDot";

const LABELS: Record<string, string> = {
  envelopeRate: "Envelope rate",
  marginGate: "Margin gate",
  vendorMarkupMin: "Vendor markup min",
  pricingFloorMultiple: "Pricing floor",
  maxTotalDeduction: "Max total deduction",
  contributorCapMonths: "Payment cap",
  contributorFloorMonths: "Payment floor",
  commissionReferred: "Referred rate",
  commissionSelfGenerated: "Self-generated rate",
  retainerCommissionMonths: "Retainer months",
  cycleMonths: "Cycle months",
  profitTargetMargin: "Target margin",
  profitFloorMargin: "Floor margin",
  profitCeilingMonths: "Ceiling",
  profitLeadFeeOffsetShare: "Lead-fee offset",
};

// A single "variables as columns, one value row" table (commission, limits, etc.).
const SIMPLE_SECTIONS: { title: string; note?: string; keys: string[] }[] = [
  { title: "Envelope & margin gate", keys: ["envelopeRate", "marginGate", "vendorMarkupMin", "pricingFloorMultiple"] },
  { title: "Commission", keys: ["commissionReferred", "commissionSelfGenerated", "retainerCommissionMonths", "cycleMonths"] },
  { title: "Contributor limits", keys: ["maxTotalDeduction", "contributorCapMonths", "contributorFloorMonths"] },
  { title: "Profit share", note: "Proposed — shown, but excluded from released totals.", keys: ["profitTargetMargin", "profitFloorMargin", "profitCeilingMonths", "profitLeadFeeOffsetShare"] },
];

export function IncentiveConfigTables({
  values,
  customised,
}: {
  values: Record<string, number>;
  customised: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const th = "border border-line bg-navy-50 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-navy-700";
  const rowh = "border border-line bg-paper px-3 py-2 text-left text-xs font-semibold text-muted";
  const td = "border border-line px-3 py-2 text-sm font-semibold tabular-nums text-navy-900";

  function suffixFor(name: string) {
    const f = CFG_FIELDS[name];
    return f.kind === "pct" ? "%" : f.unit === "×" ? "×" : f.unit ?? "";
  }

  function Cell({ name }: { name: string }) {
    if (!editing) return <td className={td}>{display(name, values[name])}</td>;
    const suffix = suffixFor(name);
    return (
      <td className="border border-line px-2 py-1.5">
        <span className="relative flex items-center">
          <input
            name={name}
            type="number"
            step="any"
            defaultValue={toInput(name, values[name])}
            className="w-full rounded-md border border-line bg-surface px-2 py-1.5 pr-6 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
          />
          <span className="pointer-events-none absolute right-2 text-xs text-muted">{suffix}</span>
        </span>
      </td>
    );
  }

  function Head({ name }: { name: string }) {
    return (
      <th className={th}>
        {LABELS[name]}
        <InfoDot text={CFG_FIELDS[name].info} />
      </th>
    );
  }

  return (
    <form action={saveIncentiveConfig}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Currently using <strong className="text-ink">{customised ? "custom saved values" : "the built-in defaults"}</strong>.
          Editing applies to <strong>every cycle&rsquo;s figures</strong> on save.
        </p>
        {editing ? (
          <div className="flex flex-none gap-2">
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50">
              Cancel
            </button>
            <button type="submit" className="rounded-lg bg-navy-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-navy-700">
              Save configuration
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex-none rounded-lg border border-line bg-surface px-4 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50">
            Edit
          </button>
        )}
      </div>

      <div className="mt-4 space-y-5">
        {/* Contributor tiers — tiers as columns, Min share / Deduction as rows */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-serif text-lg text-ink">Contributor tiers</h2>
          <p className="mt-1 text-xs text-muted">Share threshold → deduction from the Lead&rsquo;s fee. A share below Tier 3&rsquo;s threshold earns nothing.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}></th>
                  <th className={th}>Tier 1</th>
                  <th className={th}>Tier 2</th>
                  <th className={th}>Tier 3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className={rowh}>
                    Min share
                    <InfoDot text="The minimum contribution share an assignment member needs to fall into that tier." />
                  </th>
                  <Cell name="tier1Min" /><Cell name="tier2Min" /><Cell name="tier3Min" />
                </tr>
                <tr>
                  <th className={rowh}>
                    Deduction
                    <InfoDot text="The share of the envelope that tier's contributor takes from the Lead's fee." />
                  </th>
                  <Cell name="tier1Deduction" /><Cell name="tier2Deduction" /><Cell name="tier3Deduction" />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Simple variable-as-columns tables */}
        {SIMPLE_SECTIONS.map((s) => (
          <section key={s.title} className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-serif text-lg text-ink">{s.title}</h2>
            {s.note ? <p className="mt-1 text-xs text-muted">{s.note}</p> : null}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>{s.keys.map((k) => <Head key={k} name={k} />)}</tr>
                </thead>
                <tbody>
                  <tr>{s.keys.map((k) => <Cell key={k} name={k} />)}</tr>
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </form>
  );
}
