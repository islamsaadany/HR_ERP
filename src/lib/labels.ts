import type {
  EmploymentType,
  MaritalStatus,
  Role,
  TenureBand,
  EmployeeStatus,
} from "@prisma/client";
import { deriveTenureBand } from "./tenure";

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Employee",
  HR_ADMIN: "HR Admin",
  SUPER_USER: "Super User",
  FINANCE: "Finance",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
};

export const TENURE_BAND_LABEL: Record<TenureBand, string> = {
  BAND_6MO_2Y: "6 months – 2 years",
  BAND_2_4Y: "2 – 4 years",
  BAND_4_7Y: "4 – 7 years",
  BAND_7_10Y: "7 – 10 years",
};

/**
 * Live tenure-band label derived from the hire date — never stale (the stored
 * band is only recomputed on employee edit). Shows "< 6 months" for a hire under
 * six months (not yet benefits-eligible) instead of a bare "—", and "—" when
 * there is no hire date or it is in the future.
 */
export function tenureBandDisplay(
  startDate: Date | null | undefined,
  now: Date = new Date()
): string {
  if (!startDate) return "—";
  const { band } = deriveTenureBand(startDate, now);
  if (band) return TENURE_BAND_LABEL[band];
  return startDate.getTime() > now.getTime() ? "—" : "< 6 months";
}

/** Order of the four tenure bands (index aligns with benefits ceiling arrays). */
export const TENURE_BAND_ORDER: TenureBand[] = [
  "BAND_6MO_2Y",
  "BAND_2_4Y",
  "BAND_4_7Y",
  "BAND_7_10Y",
];

export const MARITAL_STATUS_LABEL: Record<MaritalStatus, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  DIVORCED: "Divorced",
  WIDOWED: "Widowed",
};

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  LEFT: "Left",
};

export const DEPARTMENTS = [
  "Consulting Department",
  "Financial Department",
  "Top Management",
  "Marketing & Community",
  "Data Management Unit",
] as const;

/**
 * Money — the single formatter for every EGP figure the product shows (spec 026 audit F1).
 *
 * Two things are deliberate:
 *
 * 1. **The locale is pinned.** `toLocaleString()` with no locale follows the VIEWER's browser, so
 *    the same figure rendered as "EGP 45,000" for one employee renders as "EGP ٤٥٬٠٠٠" for a
 *    colleague on an Arabic-locale browser — a real prospect for an Egypt-based company, and the
 *    claim emails (which were already pinned) would then disagree with the app. Pinned to `en-GB`
 *    to match `formatDate` above.
 * 2. **One rounding rule.** Previously four copies rounded and four did not. Every stored money
 *    field is an integer and `coveredAmount` already rounds, so nothing visibly changes today —
 *    this just stops the two behaviours drifting apart later. Where a domain rule requires
 *    TRUNCATION (medical drops cents, spec 023), the server truncates before the figure ever
 *    reaches here.
 */
export function formatEGP(n: number): string {
  if (!Number.isFinite(n)) return "EGP 0";
  return "EGP " + Math.round(n).toLocaleString("en-GB");
}

/**
 * A grouped number with NO currency prefix, locale pinned — for numeric inputs and for grids that
 * carry their own EGP header.
 *
 * Pinning matters most for the INPUT case: the claim amount field displays
 * `formatNumber(value)` and parses the user's typing back with `/[^0-9]/g`. Under an unpinned
 * locale an Arabic-locale browser renders "١٬٢٣٤", which that regex strips to nothing — so every
 * keystroke wiped the amount and a claim over 9 EGP could not be entered at all.
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-GB");
}

/**
 * Money with two decimals — for the medical rate card only, where the admin Amounts tab keeps the
 * operator's exact figures to the cent (spec 023). `annualPremium` is a Prisma `Decimal`, so this
 * accepts unknown and coerces.
 */
export function formatEGP2(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "EGP 0.00";
  return "EGP " + v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** The platform date standard: dd/mm/yyyy, everywhere a date is DISPLAYED (2026-08-17). */
export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * The same dd/mm/yyyy standard for a date that is already a **date-only string**
 * ("YYYY-MM-DD") rather than a Date — e.g. a value carried to the browser beside
 * an `<input type="date">`, which needs the ISO form for the field and the house
 * form for the text beside it.
 *
 * Reordered textually rather than via `new Date(...)`: an ISO date-only string
 * parses as UTC midnight, and formatting THAT in a timezone behind UTC prints
 * the previous day. Nobody's start date should move because of where they are
 * sitting.
 */
export function formatDateISO(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Date → "YYYY-MM-DD" for <input type="date">, or "" when null. */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}
