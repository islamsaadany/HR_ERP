# Quickstart / Validation: Benefits — Company Coverage Rates

Proves the coverage math, the covered-based rules, and the migration. Gates + a throwaway Postgres proof.

## Gates
```bash
npx tsc --noEmit
npm run build
```

## Migration proof (throwaway local Postgres)
1. Push the schema + apply `prisma/sql/023_benefits_coverage.sql`.
2. Assert:
   - `BenefitCatalogItem.coverageRate` present; gym/sports/schooling/childcare/caregiver/learning = 80;
     mobile/homeoffice = 50; medical/checkup/coaching = 100.
   - `SelectionLine.cost` present; a pre-existing row has `cost = amount` (backfill).
   - Re-applying `023` is a no-op (idempotent).

## Rules proof (`scripts/verify-coverage.mts`, against the throwaway DB or pure)
Exercise the spec's acceptance scenarios:
- **US1**: gym 80% cost 10,000 → covered 8,000, out-of-pocket 2,000. 100% cost 3,000 → 3,000 / 0.
  50% cost 12,000 → 6,000 / 6,000.
- **US1.4**: meter/pool total = Σ covered (+ medical premium), not Σ cost.
- **US2.1 (FT 50% cap)**: pool 30,000; a single non-medical **covered** > 15,000 → flagged, submit blocked.
- **US2.2 (over-pool)**: Σ covered (+ medical) > ceiling → flagged, submit blocked.
- **US2.3 (PT)**: no 50% cap; selection limit **3**.
- **US2.4 (FT)**: selection limit **5**.
- **DC-2**: cost 9,000 @ 80% → covered 7,200 (non-1,000, not re-rounded).
- **Medical**: premium = covered = pool draw; cap-exempt.

## Claims proof
- Gym 80%, covered allocation 8,000: a proof claim for a 10,000 receipt → reimbursable = covered portion
  8,000, capped at the covered allocation. Total reimbursement across claims never exceeds 8,000.
- Claimed-lock: with 8,000 claimed, saving the basket cannot reduce that benefit's covered below 8,000.

## Admin proof
- Set gym coverage 80 → 100 in the Configuration catalog editor; an employee entering 10,000 gym now draws
  10,000 and shows 0 out-of-pocket. Rate outside 0–100 is clamped/rejected.

## Expected outcome
Gates green; migration idempotent + backfilled; every covered figure equals cost × rate; pool/cap/limits
all enforced server-side on the covered amount; claims reimburse only the covered portion.
