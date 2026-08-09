# Contracts: Mid-Year Starter Proration

Interfaces this feature exposes internally. Two kinds: a **pure module** (the authoritative math, shared server + client) and the **server-action** surface changes. No public HTTP API.

## 1. Pure module — `src/lib/benefits/proration.ts`

All functions are pure and deterministic (no I/O). `now` is injected so callers/tests control the clock.

```ts
export type PlanYearWindow = { start: Date; end: Date } | null;

export type EligibilityStatus = "FULL" | "PRORATED" | "NOT_YET";

export type Eligibility = {
  status: EligibilityStatus;
  remainingWholeMonths: number; // 0..12
  fraction: number;             // remainingWholeMonths / 12  (FULL→1, NOT_YET→0)
};

/** startDate + thresholdMonths; null when startDate is null (unknown eligibility date). */
export function eligibilityDate(startDate: Date | null, thresholdMonths: number): Date | null;

/** Complete months from `from` to `end` (partial first month excluded); 0 if from > end. */
export function remainingWholeMonths(from: Date, end: Date): number;

/**
 * Classify an employee for a plan year.
 * - window null OR eligDate null → FULL (fallback; caller surfaces the warning).
 * - eligDate ≤ window.start → FULL.
 * - window.start < eligDate ≤ window.end → PRORATED (fraction = wholeMonths/12).
 * - eligDate > window.end → NOT_YET.
 */
export function classifyEligibility(
  startDate: Date | null,
  thresholdMonths: number,
  window: PlanYearWindow,
  now?: Date
): Eligibility;

/** round(annual × fraction) — nearest whole EGP. */
export function prorate(annual: number, fraction: number): number;
```

**Contract tests (behavioral expectations):**

| Input | Expected |
|-------|----------|
| window null | `FULL`, fraction 1 |
| startDate null | `FULL`, fraction 1 (fallback) |
| elig = window.start | `FULL` |
| elig = window.start − 1d | `FULL` |
| elig = 1 Oct, end 31 Dec | `PRORATED`, remainingWholeMonths 3, fraction 0.25 |
| elig = window.end | `PRORATED`, remainingWholeMonths 0 → fraction 0 (boundary: no whole months left) |
| elig = window.end + 1d | `NOT_YET`, fraction 0 |
| `prorate(20000, 0.25)` | `5000` |
| `prorate(9500, 3/12)` | `2375` |

> Note the `elig = window.end` boundary yields 0 whole months → effectively no allowance that year; documented in spec Edge Cases. If HR prefers "≥1 month if eligible before year-end," that's a one-line change to `remainingWholeMonths` (revisit via `/speckit-clarify`).

No test runner exists in the repo; these are verified by a short scratch script under the throwaway-Postgres check and by tracing the values in `quickstart.md`.

## 2. Config helpers — `src/lib/benefits/config.ts`

```ts
/** Active plan year INCLUDING the window (start/end). Unchanged query, wider select. */
export async function getActivePlanYear(): Promise<PlanYear | null>;

/** window(planYear) → { start, end } | null (null if either date missing). */
export function planYearWindow(planYear: { startDate: Date | null; endDate: Date | null } | null): PlanYearWindow;

/** Pool ceiling for (type, band) — falls back to BAND_6MO_2Y when band is null (medical @ 3mo). */
export async function poolCeilingFor(employmentType: EmploymentType, band: TenureBand | null): Promise<number | null>;
```

## 3. Server-action surface changes

### `commitMedical(payload)` — `src/app/(app)/benefits/actions.ts`
- **New**: 3-month eligibility gate (`classifyEligibility(startDate, 3, window)` ≠ `NOT_YET`), else error "Medical becomes available after 3 months of service."
- **New**: allow commit when `tenureBand` is null but medical-eligible → use `poolCeilingFor(type, null)` (entry tier).
- **Changed**: `premium = min(prorate(rawAnnualPremium, medicalEligibility.fraction), proratedCeiling)`.
- **Unchanged**: single commit, locked after, HR-editable; 50%-cap-exempt; warnings when raw premium exceeds the (prorated) ceiling.

### `createClaim(formData)` — `src/app/(app)/benefits/claim-actions.ts`
- **catalog path**: build `ctx.ceiling = prorate(annualCeiling, poolEligibility.fraction)` (6-month threshold) before `evaluateClaim`. All existing rules (50% cap, pool total) then run against the prorated ceiling automatically.
- **guaranteed path**: when `gb.prorated === true`, `allocated = prorate(amountForBand(band, gb), poolEligibility.fraction)`; otherwise unchanged (full).

### Plan-year management — `src/app/(app)/benefits/actions.ts`
- `createPlanYear(formData)`: **new** optional `startDate` / `endDate` fields; validate `endDate > startDate` when both present; persist.
- `editPlanYearWindow(formData)` (**new** action): set/adjust an existing plan year's `startDate` / `endDate` (SUPER_USER/HR_ADMIN), same validation.

### Employee page — `src/app/(app)/benefits/page.tsx`
- Gate change: allow an employee with no `tenureBand` but medical-eligible (≥3mo) through to a **medical-only** render; keep the existing block only when `employmentType` is missing or the employee is not even medical-eligible.
- Compute pool/prof-dev/medical eligibility once; pass prorated figures + status flags to `BenefitsBoard` for display (mirrors, never authoritative).

**Auth**: plan-year window edits are HR_ADMIN/SUPER_USER only (existing admin gating on the route/actions). Employee-facing reads are self-scoped as today.
