# Phase 0 Research: Mid-Year Starter Proration

All open questions were resolved during alignment (spec 019) and confirmed by the product owner. This records the decisions and why, plus the two small design choices made here.

## D1 — Plan-year window storage

- **Decision**: Add nullable `startDate` and `endDate` (`DateTime?`) to `PlanYear`. Admin sets them via the plan-year dialog.
- **Rationale**: "Remaining months" is meaningless without a window; a plan year currently has only `name` + `status`. Nullable so the ALTER doesn't break existing rows and so FR-016's fallback (missing window → full amounts + admin warning) is expressible.
- **Alternatives considered**: Derive the window from the year `name` (rejected — locks to calendar years, and names are free text like "2027"). A separate `PlanYearWindow` table (rejected — one-to-one, needless join).

## D2 — Proration formula & boundary rule

- **Decision**: `prorated = round(annual × remainingWholeMonths ÷ 12)`. `remainingWholeMonths` = count of **complete** months from the eligibility date to the plan-year end (a partial first month does not count). Currency rounds to the nearest whole EGP.
- **Rationale**: The product owner's stated formula ("whole months … ÷ 12"). Whole-month floor is simplest to explain to employees and avoids day-level disputes.
- **Alternatives considered**: Day-accurate proration (rejected — over-precise for an annual allowance, harder to explain); rounding down the currency (rejected — nearest is fairer and matches typical payroll rounding).

## D3 — Two eligibility thresholds

- **Decision**: Eligibility date = employment `startDate` + **6 months** for the flexible pool and Professional development; + **3 months** for medical. Classification per plan year: `FULL` (elig ≤ window start), `PRORATED` (window start < elig ≤ window end), `NOT_YET` (elig > window end).
- **Rationale**: Confirmed product decision — medical unlocks earlier than the basket. Classification is stateless (recomputed from dates), so no per-employee flags/migration.

## D4 — Which benefits prorate, and how Professional development is identified

- **Decision**: Prorate (a) the **flexible pool ceiling** (globally — every flexible claim then draws from the smaller pool) and (b) the **Professional-development** guaranteed allocation. Mark prof-dev with a new `prorated Boolean @default(false)` column on `GuaranteedBenefit`, set `true` for the two prof-dev rows in migration 027. Marriage/Summer/Special events/Loans keep `false`.
- **Rationale**: A boolean flag is explicit and future-proof (HR could mark another guaranteed benefit prorated later) and avoids brittle name-matching (`ILIKE '%professional development%'`) in the money path. The flexible pool is prorated once at the ceiling, not per catalog item, so no per-item flag is needed.
- **Alternatives considered**: Name/key matching (rejected — fragile, and the money path must not depend on display strings); a hard-coded prof-dev id (rejected — not portable across environments/seeds).

## D5 — Medical for a 3-to-6-month employee (no tenure band)

- **Decision**: Use the **entry tier `BAND_6MO_2Y`** of the employment type for the pool-ceiling lookup when the employee has no assigned band but is medical-eligible (≥3 months). The single-row medical rate card is band-independent, so only the ceiling lookup needs the fallback. The committed premium is then prorated by the medical fraction and capped at the (prorated) entry-tier ceiling; medical stays 50%-cap-exempt.
- **Rationale**: Confirmed as the default in alignment; it's the lowest tier, appropriate for the newest employees, and keeps "rest of basket unchanged."
- **Alternatives considered**: A dedicated sub-6-month ceiling (rejected — no such figure exists; adds config with no source data).

## D6 — Missing / partial data fallbacks

- **Decision**:
  - Active plan year has **no window** → treat everyone as `FULL` (no proration) and show an **admin warning** that dates are missing (FR-016). Never silently zero allowances.
  - Employee has **no `startDate`** → eligibility date unknown → fall back to existing band-based behavior, un-prorated; flag for HR. Do not block the employee.
- **Rationale**: Fail safe (toward paying the full, known-good amount) rather than fail closed on money.

## D7 — Placeholder medical rates

- **Decision**: Build the `÷12` medical proration now against the existing placeholder `MedicalRateCard`. The operator's confirmed prorated premiums are a later data/config swap; if they prove **non-linear**, that's a follow-up to medical rate handling (noted in spec Dependencies).
- **Rationale**: Decouples the rule/design (buildable now) from the pending numbers; honors "placeholder figures never presented as final."

## Resolved

No `NEEDS CLARIFICATION` remain. Ready for Phase 1 design.
