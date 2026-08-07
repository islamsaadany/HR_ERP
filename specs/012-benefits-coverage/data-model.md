# Data Model: Benefits — Company Coverage Rates

## Changed entities

### `BenefitCatalogItem` (+ `coverageRate`)
| Field | Type | Notes |
|-------|------|-------|
| … existing (key, name, description, category, isMedical, order, active, claimType) … | | unchanged |
| `coverageRate` | Int | Company coverage **percent**, 0–100. Default **100**. HR-editable. Seeded: 100 (medical, checkup, coaching); 80 (gym, sports, schooling, childcare, caregiver, learning); 50 (mobile, homeoffice). |

### `SelectionLine` (+ `cost`; `amount` meaning clarified)
| Field | Type | Notes |
|-------|------|-------|
| `amount` | Int | **Covered (company) amount = the pool draw** (unchanged column, meaning made explicit). For medical = the premium. |
| `cost` | Int | **NEW** — the full cost the employee entered (1,000 steps). For medical = the premium (cost = covered). Default 0; backfilled to `amount` for pre-012 rows. |

Out-of-pocket is **derived** (`cost − amount`), never stored.

### Prisma sketch
```prisma
model BenefitCatalogItem {
  // …existing…
  coverageRate Int @default(100) // company coverage %, 0–100 (spec 012)
}

model SelectionLine {
  // …existing…
  amount Int  // covered (company) amount = pool draw
  cost   Int  @default(0) // full cost entered by the employee (spec 012)
}
```

## Derived math (single source: `src/lib/benefits/coverage.ts`)
- `coveredAmount(cost, rate) = Math.round(cost * rate / 100)` — integer (cost is 1,000-stepped, rate integer).
- `outOfPocket(cost, rate) = cost - coveredAmount(cost, rate)`.
- Medical: `cost = covered = premium` (rate 100).

## Rule invariants (server-authoritative, on the **covered** amount)
- **Pool total** = Σ covered (non-medical) + medical premium ≤ pool ceiling (FR-C03).
- **50% cap (full-time only)**: each non-medical line's **covered** ≤ 50% of ceiling (FR-C04). Part-time exempt.
- **Selection limit**: full-time **5**, part-time **3** (FR-C05); over-selection prevented at the new limits.
- **Medical**: single item, 100% covered, cap-exempt, ceiling-capped (FR-C06).
- **Claims**: reimburse covered portion, capped at the line's covered `amount`; claimed-lock forbids
  reducing a line's covered `amount` below the sum already claimed (FR-C08/C10).

## Migration `023_benefits_coverage.sql` (idempotent, runner-applied)
1. `ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "coverageRate" integer NOT NULL DEFAULT 100;`
2. `UPDATE` the 80% keys (gym, sports, schooling, childcare, caregiver, learning) and 50% keys (mobile, homeoffice); 100% keys keep the default.
3. `ALTER TABLE "SelectionLine" ADD COLUMN IF NOT EXISTS "cost" integer NOT NULL DEFAULT 0;`
4. `UPDATE "SelectionLine" SET "cost" = "amount" WHERE "cost" = 0;` (backfill pre-012 rows — historically 100%-covered).

## Backwards compatibility
- Existing submitted baskets: `cost` backfilled to `amount` → shown as 100%-covered historically (correct,
  since coverage did not exist before). Their pool draw is unchanged.
- Any catalog item without an explicit rate defaults to 100% (fully covered) — safe.
