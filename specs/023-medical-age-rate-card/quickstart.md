# Quickstart — Validating the Age-Banded Medical Rate Card

Proves the feature end-to-end. Two verification surfaces: pure-function math (fast, no DB) and the
migration/seed on a throwaway Postgres.

## Prerequisites

- `npm install` done; `npx prisma generate` run.
- Local throwaway Postgres available (Postgres 16 under `/usr/lib/postgresql/*/bin`, run as `postgres`,
  socket in `/tmp`) for the SQL/seed check.

## 1. Pricing math (pure, via `tsx`)

Exercise `src/lib/benefits/rates.ts` against the spec's worked examples (see
`contracts/medical-pricing.md`). Expected:

Per-person **truncates** to whole EGP (drops the cents): 7,181.70→7,181, 5,708.69→5,708, 3,990.72→3,990.

| Case | Annual (whole EGP) | After proration | Committed (whole EGP) |
|---|---|---|---|
| Personal, emp 32 | 7,181 | ×1 | **7,181** |
| Family: 32 + spouse 29 + child 10 | 7,181+5,708+3,990 = 16,879 | ×1 | **16,879** |
| Mid-cycle joiner, annual 16,879, 4 mo left | 16,879 | ×4/12 = 5,626.33 → trunc | **5,626** |
| Family minus the child | 16,879 − 3,990 = 12,889 | ×1 | **12,889** |
| Age boundary: exactly 18 | prices in 18–24 (5,173.57 → 5,173) | — | — |
| Age 80 (over top) | top band 70–75 (29,796.12 → 29,796) + overTop flag | — | — |

Run: `npx tsx <scratch>/verify-medical-rates.ts` → all rows PASS.

## 2. Migration + seed (throwaway Postgres)

1. `initdb` + `pg_ctl start` a throwaway cluster; apply `prisma/sql/000_*` … up to the new
   `0NN_medical_age_rate_card.sql` in order.
2. Confirm:
   - `SELECT count(*) FROM "MedicalRateBand" WHERE tier = 1;` → **12**.
   - `SELECT "minAge","maxAge","annualPremium" FROM "MedicalRateBand" ORDER BY "order";` → matches the
     Tier-1 table (decimals intact, e.g. `3990.72`).
   - `MedicalRateCard` table **dropped**.
   - `Dependant.kind` column exists, existing rows = `CHILD`.
   - `MedicalCoveredPerson` table exists with the FK to `MedicalCommitment`.
   - `MedicalCommitment.spouse/childrenUnder18/children18Plus` now nullable.

## 3. Employee flow (build + manual, once UI is mocked & approved)

- Employee with a DOB, Family-eligible: open medical setup → see own age-band line, add spouse (with DOB,
  stored as a `SPOUSE` dependant) + tick children → live premium = sum of age-band figures → commit →
  `MedicalCommitment.premium` = rounded, `MedicalCoveredPerson` rows written; election locked.
- Employee **without** a DOB: setup blocks with "a date of birth is required for medical…".
- Mid-cycle joiner: committed premium = annual × remaining months ÷ 12, rounded.

## 4. Gates before hand-off

- `npx tsc --noEmit` and `npm run build` green.
- Admin Amounts tab shows the 12-band editor (not self/spouse/child); editing a band changes an
  employee's preview.
- Steering docs + spec 023 updated in the same commit; the `prisma/sql/0NN_*.sql` file named for HR to
  paste into Neon (after the current latest numbered file).
