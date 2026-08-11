# Phase 1 Data Model — Age-Banded Medical Rate Card (Tier 1)

Prisma/PostgreSQL. Changes ship as a numbered `prisma/sql/0NN_medical_age_rate_card.sql` applied to Neon
(sessions cannot `db push`), regenerated in the same commit as `schema.prisma`.

## New: `MedicalRateBand`

One row per age band. Replaces the single-row `MedicalRateCard`.

| Field | Type | Notes |
|---|---|---|
| `id` | String cuid PK | |
| `tier` | Int, default `1` | Future tiers add rows with a new value; only Tier 1 today. |
| `minAge` | Int | Inclusive lower bound (completed years). Band "0–17" → `0`. |
| `maxAge` | Int? | Inclusive upper bound; top band `70–75` → `75`. (Nullable reserved for a future open-ended top band; today all bands are closed.) |
| `annualPremium` | Decimal `@db.Decimal(10,2)` | Operator annual figure, two decimals. |
| `order` | Int, default `0` | Display order in the admin editor. |

- **Unique**: `@@unique([tier, minAge])`.
- **Index**: `@@index([tier])`.

**Seed (Tier 1)** — 12 rows (EGP): `0–17 = 3990.72`, `18–24 = 5173.57`, `25–29 = 5708.69`,
`30–34 = 7181.70`, `35–39 = 8898.47`, `40–44 = 9883.96`, `45–49 = 12497.11`, `50–54 = 13297.38`,
`55–59 = 16139.08`, `60–64 = 21912.07`, `65–69 = 23788.03`, `70–75 = 29796.12`.

## Changed: `Dependant`

Add a kind so a covered **spouse** is a dependant alongside children.

| Field | Type | Notes |
|---|---|---|
| `kind` | `DependantKind` enum `{ CHILD, SPOUSE }`, default `CHILD` | Existing rows → `CHILD` (safe default). At most one `SPOUSE` per user (app-enforced). |

`name` stays optional; `dateOfBirth` stays required (already). No other change.

```prisma
enum DependantKind { CHILD SPOUSE }
```

## Changed: `MedicalCommitment`

Keep `premium` (whole EGP, post-proration) and `committedAt` (the pricing reference date). The
`spouse` / `childrenUnder18` / `children18Plus` count columns become **legacy** — made nullable, no longer
written for new commits (retained so any historical row keeps its record). Add the covered-people snapshot
relation:

```prisma
coveredPeople MedicalCoveredPerson[]
```

## New: `MedicalCoveredPerson` (commit snapshot)

Immutable snapshot of who was covered and their contribution, captured at commit (age at commit date;
locked). Makes the committed premium explainable (SC-006) and immune to later DOB/dependant edits.

| Field | Type | Notes |
|---|---|---|
| `id` | String cuid PK | |
| `commitmentId` | String FK → `MedicalCommitment` (cascade) | |
| `dependantId` | String? FK → `Dependant` (setNull) | `null` = the employee themselves. |
| `label` | String | "Employee" or the dependant's name/kind, for the breakdown. |
| `ageAtCommit` | Int | Completed years at commit date. |
| `annualPremium` | Decimal `@db.Decimal(10,2)` | The band figure applied to this person. |

- **Index**: `@@index([commitmentId])`.

## Dropped

- `MedicalRateCard` (self/spouse/childUnder18/child18Plus) — dropped **after** `MedicalRateBand` is
  seeded in the same migration.

## Unchanged (referenced)

- `User.dateOfBirth` — stays nullable in the schema; **required at medical commit time** by server
  validation (not a DB constraint, so non-medical employees are unaffected).
- `PlanYear.startDate/endDate` — the plan-year window (spec 019), still used for the medical proration
  fraction (`classifyEligibility(startDate, 3, window)`).
- Pool ceiling, 50%-cap engine, `BenefitClaim` — untouched.

## Validation rules (enforced server-side)

- Employee DOB present → else block commit (FR-005).
- Every selected covered dependant has a DOB (schema guarantees) and a resolvable band.
- At most one SPOUSE dependant per employee.
- Age > 75 → top band + HR-review flag (FR-012).
- Committed premium = `round( sum(annualPremium over covered people) × medicalFraction )`, capped at the
  pool ceiling; medical excluded from the 50% cap (FR-008, FR-010, FR-011).

## Migration ordering (SQL file)

1. `CREATE TYPE "DependantKind"`; add `Dependant.kind` default `CHILD`.
2. `CREATE TABLE "MedicalRateBand"`; insert the 12 Tier-1 rows.
3. `CREATE TABLE "MedicalCoveredPerson"`; add `MedicalCommitment.coveredPeople` relation (FK on child).
4. Make `MedicalCommitment.spouse/childrenUnder18/children18Plus` nullable (legacy).
5. `DROP TABLE "MedicalRateCard"`.

Verified on a throwaway local Postgres (000→0NN) before hand-off; the file tells HR exactly which numbered
file to paste into Neon and in what order.
