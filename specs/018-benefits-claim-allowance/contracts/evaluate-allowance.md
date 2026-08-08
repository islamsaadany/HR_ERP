# Contract: `evaluateAllowance` / `evaluateClaim` (pure rule function)

The single server-authoritative money-rule function, in `src/lib/benefits/rules.ts`. The client
imports the same helpers for display only (never trusted). Replaces `evaluateBasket`.

## Inputs

```ts
type AllowanceInput = {
  ceiling: number;                       // pool ceiling for this employee
  medicalPremium: number;                // 0 if not committed; already capped at ceiling
  // Covered totals already recorded (pending + released), per catalog item key:
  claimedByBenefit: Record<string, number>;
  employmentType: "FULL_TIME" | "PART_TIME"; // retained for the dormant count-limit only
};

type ProposedClaim = {
  key: string;          // catalog item key
  name: string;
  fullCost: number;     // exact receipt value
  coverageRate: number; // 1–100
};
```

## Derived values

```ts
cap        = Math.floor(ceiling * 0.5)                 // per-benefit 50% cap (FT + PT)
covered    = coveredAmount(fullCost, coverageRate)      // from coverage.ts
benefitUsed= claimedByBenefit[key] ?? 0
poolUsed   = medicalPremium + Σ(claimedByBenefit values)
benefitRemaining = Math.max(0, cap - benefitUsed)
poolRemaining    = Math.max(0, ceiling - poolUsed)
```

## Validation of a `ProposedClaim`

Returns `{ ok, errors[], warnings[], covered, benefitRemaining, poolRemaining }`:

1. `covered ≤ benefitRemaining` else error: `"<name>: exceeds the 50% cap — EGP <benefitRemaining> left on this benefit."`
2. `covered ≤ poolRemaining` else error: `"Your pool is fully used — contact HR."`
3. (dormant) if `COUNT_LIMIT_ENABLED` and adding a new distinct benefit would exceed `maxSelect(employmentType)` → error.

## Display helpers (client mirror)

- `poolUsed`, `poolRemaining`, and per-benefit `benefitRemaining` drive the meter and the "left on this benefit" hints. Identical math to the server; server re-checks at write time.

## Removed

- `evaluateBasket` (basket totals, selection count as a hard rule, medical-in-basket total).
- `STEP` / `coerceAmount` rounding on the cost path (cost is exact now).
- `MAX_SELECT_*` remain as constants but are only consulted when `COUNT_LIMIT_ENABLED` is true.

## Medical

- `computeMedicalPremium(rateCard, cfg)` unchanged.
- Medical premium is passed in as `medicalPremium` (already `min(premium, ceiling)`), counts toward `poolUsed`, and is **exempt** from the 50% per-benefit cap.
