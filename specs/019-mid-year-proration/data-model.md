# Phase 1 Data Model: Mid-Year Starter Proration

## Schema changes (Prisma / Postgres)

### `PlanYear` — add the proration window

| Field | Type | Notes |
|-------|------|-------|
| `startDate` | `DateTime?` | Plan-year window start (inclusive). Admin-set. Nullable for existing rows / fallback. |
| `endDate` | `DateTime?` | Plan-year window end (inclusive). Admin-set. Must be after `startDate` when both present. |

Existing fields unchanged (`id`, `name`, `status`, `createdAt`, relations). Validation (server): if both dates are present, `endDate > startDate`; a partial window (one set, not the other) is treated as "no window" for proration purposes and surfaces the admin warning.

### `GuaranteedBenefit` — mark which benefits prorate

| Field | Type | Notes |
|-------|------|-------|
| `prorated` | `Boolean @default(false)` | `true` only for Professional development (`gb_ft_profdev`, `gb_pt_profdev`). Others stay `false` (event/season gifts). |

### Migration `prisma/sql/027_plan_year_window.sql`

Idempotent, hand-run in Neon after 026:

1. `ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "startDate" timestamp(3);`
2. `ALTER TABLE "PlanYear" ADD COLUMN IF NOT EXISTS "endDate" timestamp(3);`
3. `ALTER TABLE "GuaranteedBenefit" ADD COLUMN IF NOT EXISTS "prorated" boolean NOT NULL DEFAULT false;`
4. `UPDATE "GuaranteedBenefit" SET "prorated" = true WHERE "id" IN ('gb_ft_profdev','gb_pt_profdev');`

No data destruction; existing plan years get null dates (→ treated as full/un-prorated until an admin sets them).

## Derived entities (computed, never stored)

### `PlanYearWindow`
`{ start: Date, end: Date } | null` — read from the active `PlanYear`; `null` when either date is missing.

### `Eligibility`
Per employee, per benefit group, per plan year:
- `status: "FULL" | "PRORATED" | "NOT_YET"`
- `remainingWholeMonths: number` (0–12; 12 when `FULL`, 0 when `NOT_YET`)
- `fraction: number` (`remainingWholeMonths / 12`; `1` when `FULL`, `0` when `NOT_YET`)

Derivation inputs: employee `startDate`, the threshold (6 months pool/prof-dev, 3 months medical), and the `PlanYearWindow`.

### Prorated figures
- `proratedPoolCeiling = round(annualCeiling × poolEligibility.fraction)`
- `proratedProfDevAllocation = round(annualBandAmount × poolEligibility.fraction)` (only for the benefit flagged `prorated`)
- `proratedMedicalPremium = min( round(annualPremium × medicalEligibility.fraction), proratedPoolCeiling )`

## Relationships & invariants

- Exactly one `PlanYear` is `OPEN` (unchanged invariant).
- Proration never mutates stored amounts; it scales the **ceiling/allocation used at claim/commit time**. Existing `BenefitClaim` / `MedicalCommitment` rows are untouched by the schema change.
- The 50%-per-benefit cap and pool-total checks run against the **prorated** ceiling for a prorated employee (the cap is `floor(proratedCeiling × 0.5)`).
- `MedicalCommitment` still holds the committed premium; for a prorated employee it stores the **prorated** premium computed at commit time (one-time, locked, HR-editable — unchanged lifecycle).

## Eligibility state transitions (across plan years, derived each time)

```
elig date ≤ window.start ───────────────► FULL      (fraction 1)
window.start < elig ≤ window.end ───────► PRORATED  (fraction = wholeMonths/12)
elig date > window.end ─────────────────► NOT_YET   (fraction 0)
window missing / startDate missing ─────► FULL      (fallback; admin/HR warning)
```

No stored state; recomputed every plan year, so a starter is `PRORATED` in year N and naturally `FULL` in year N+1.
