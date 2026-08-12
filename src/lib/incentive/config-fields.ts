// Field metadata for the incentive config UI (display) + save action (conversion).
// Kept in one place so the % ↔ fraction conversion can never drift between the
// form and the server. `pct` fields are stored as fractions (0.7) but shown and
// edited as percentages (70). `num` fields are stored/edited raw (months, ×).

export type CfgKind = "pct" | "num";
export type CfgField = { kind: CfgKind; int?: boolean; unit?: string; info: string };

export const CFG_FIELDS: Record<string, CfgField> = {
  envelopeRate: { kind: "pct", info: "The fee pool for a paying client = this share of the assignment's gross profit." },
  marginGate: { kind: "pct", info: "A client only generates a fee at or above this gross margin." },
  tier1Min: { kind: "pct", info: "A contributor whose share is at least this threshold falls in Tier 1." },
  tier1Deduction: { kind: "pct", info: "Tier 1 takes this share of the envelope from the Lead's fee." },
  tier2Min: { kind: "pct", info: "Share at least this, but below Tier 1." },
  tier2Deduction: { kind: "pct", info: "Tier 2 takes this share of the envelope." },
  tier3Min: { kind: "pct", info: "Share at least this, but below Tier 2. A share below Tier 3 earns nothing." },
  tier3Deduction: { kind: "pct", info: "Tier 3 takes this share of the envelope." },
  maxTotalDeduction: { kind: "pct", info: "Contributor deductions never exceed this; the Lead always keeps the rest." },
  contributorCapMonths: { kind: "num", unit: "mo", info: "A contributor payment is capped at this many months of net salary. 0.5 = half a month." },
  contributorFloorMonths: { kind: "num", unit: "mo", info: "Below this fraction of a month of net salary, no contributor payment is made. 0.05 = 5% of a month." },
  commissionReferred: { kind: "pct", info: "Commission on net revenue when the lead was referred to the business developer, who closed it." },
  commissionSelfGenerated: { kind: "pct", info: "Commission when the business developer both sourced and closed the work." },
  retainerCommissionMonths: { kind: "num", int: true, unit: "mo", info: "A retainer is commissioned on this many months of the half-year, once." },
  cycleMonths: { kind: "num", int: true, unit: "mo", info: "A cycle is this many months (a half-year)." },
  vendorMarkupMin: { kind: "pct", info: "Minimum markup expected on an external vendor's pass-through cost." },
  profitTargetMargin: { kind: "pct", info: "Profit share pays one month at this net margin and above." },
  profitFloorMargin: { kind: "pct", info: "No profit share below this net margin." },
  profitCeilingMonths: { kind: "num", unit: "mo", info: "Entitlement is capped at this many months." },
  profitLeadFeeOffsetShare: { kind: "pct", info: "This share of the Lead fee offsets the profit-share entitlement." },
  pricingFloorMultiple: { kind: "num", unit: "×", info: "Bill at least this multiple of consultant cost per hour." },
};

export const CFG_KEYS = Object.keys(CFG_FIELDS);

/** Round-trip-safe: strip float noise from ×100 so 0.03 → "3", not "3.0000000001". */
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/** Fraction → the number shown/edited in the form (pct ×100; num as-is). */
export function toInput(name: string, fraction: number): number {
  return CFG_FIELDS[name]?.kind === "pct" ? clean(fraction * 100) : fraction;
}

/** Form number → the stored fraction (pct ÷100; num as-is, ints rounded). */
export function toStored(name: string, input: number): number {
  const f = CFG_FIELDS[name];
  if (!f) return input;
  let v = f.kind === "pct" ? input / 100 : input;
  if (f.int) v = Math.round(v);
  return v;
}

/** Human display of a stored fraction: "3%" for pct, "0.5 mo" / "3.33×" for num. */
export function display(name: string, fraction: number): string {
  const f = CFG_FIELDS[name];
  if (!f) return String(fraction);
  if (f.kind === "pct") return `${clean(fraction * 100)}%`;
  const unit = f.unit === "×" ? "×" : f.unit ? ` ${f.unit}` : "";
  return `${fraction}${unit}`;
}
