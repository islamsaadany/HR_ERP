# Contract: saveBasket + coverage rules (spec 012)

## Client → server payload (changed)
`saveBasket(payload, submit)` where each non-medical item now carries the **cost** (not the pool draw):
```ts
payload = {
  items: { key: string; cost: number }[],   // full cost the employee entered (1,000 steps)
  medical: { selected, spouse, childrenUnder18, children18Plus },
}
```
Medical is unchanged (rate-card driven; no cost field — premium = covered).

## Server derivation (authoritative)
For each item: look up `coverageRate` from the catalog → `covered = coveredAmount(cost, rate)` →
store `SelectionLine { cost, amount: covered }`. Medical line: `cost = amount = premium`.

## Rules evaluated on the covered amount (`evaluateBasket`)
- `poolTotal = Σ covered + medicalPremium`; **error** if `> ceiling` (FR-C03).
- **Full-time** only: **error** if any non-medical line's `covered > floor(ceiling × 0.5)` (FR-C04).
- **error** if selection count `> maxSelect` where `maxSelect = 5` (FT) / `3` (PT) (FR-C05).
- Medical: premium capped at ceiling; cap-exempt (FR-C06).
- Steps: cost coerced to multiples of 1,000; covered not re-rounded (DC-2).
- On `submit`, any error blocks; on draft, saved with warnings (unchanged pattern).

## Claimed-benefit lock (FR-C10, unchanged mechanism, now covered)
A line's covered `amount` may not drop below the sum already claimed (PENDING+RELEASED) for that benefit —
the existing check in `saveBasket` compares claimed sum vs the incoming line `amount` (= covered).

## Claims (FR-C08)
- The claim proves a full spend but reimburses the **covered portion**, capped at the line's covered `amount`.
- Tracker allocated/reimbursed/pending/left stay in **covered** terms (allocation = amount = covered).

## Display (selector, DC-3)
Per selected benefit: **cost**, **company share** (= covered, from pool), **your share** (= out-of-pocket).
The running meter/total tracks the **company share** only (+ medical premium).

## Admin (this spec)
`updateCatalogItem`-style action in the existing Configuration tab accepts `coverageRate` (0–100, clamped);
server-authoritative; applies to subsequent basket math (FR-C01, US3).
