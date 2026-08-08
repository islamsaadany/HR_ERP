# Contract: `createClaim` for flexible benefits (server action, extended)

Extends the existing `createClaim` (spec 007/016). The change: a flexible (catalog) claim no
longer requires a SUBMITTED basket, and the per-benefit cap becomes 50% of the pool with a
whole-pool ceiling check. Guaranteed-benefit claims are unchanged.

## Input (FormData)

- `kind`: `"guaranteed" | "catalog"`
- `benefitId`: catalog item id (for `catalog`) or guaranteed benefit id
- `amount`: **full price paid** (exact, integer; matches proof) — for PROOF claims
- `note`: optional (for NOTE claims)
- `proof`: file (required for PROOF claim type)

## Preconditions (catalog / flexible)

- Authenticated employee with `employmentType` + `tenureBand` → a `PoolCeiling` (`ceiling`).
- OPEN plan year; else reject "not open."
- `benefitId` is an `active`, non-medical `BenefitCatalogItem`. Medical → reject "Medical cover doesn't need a claim." (FR-012)
- Claim type resolved from the catalog item (`PROOF` requires a file; `NONE` → reject "paid automatically").
- **No submitted-basket requirement** (removed).

## Money rules (server-authoritative)

Let `rate` = item.coverageRate, `covered = coveredAmount(fullPrice, rate)`.

1. **Per-benefit 50% cap**: `Σ covered(pending+released for this item) + covered ≤ floor(ceiling × 0.5)`.
   Else reject: `"That exceeds the amount left to claim on <name> (EGP <remaining>)."` (FR-005/FR-007) — FT **and** PT.
2. **Pool ceiling**: `medicalPremium + Σ covered(all pending+released flexible claims) + covered ≤ ceiling`.
   Else reject: `"Your pool is fully used — contact HR."` (FR-006)
3. **Count limit**: if `COUNT_LIMIT_ENABLED`, reject when this would exceed max-N distinct claimed benefits. Default off (FR-016).
4. `covered` (not the full price) is stored in `BenefitClaim.amount`, recorded at claim time (FR-003; not retroactively recomputed).

## Behavior

- On pass: create `BenefitClaim{ userId, planYearId, catalogItemId, amount: covered, note, proofUrl?, status: PENDING }`, upload proof to Blob if PROOF, `revalidatePath('/benefits')` + `/admin/benefits`.
- Rejection of a filed claim by HR (existing flow) frees its reserved covered amount (FR-008) — no change needed since rejected claims are excluded from the pending+released sums.

## Output

Existing redirect-based UX may be kept, **or** returned inline (recommended, consistent with the interactive pattern). Success → claim visible as pending with covered amount; failure → actionable message above.

## Guaranteed claims

Unchanged: allocation = `amountForBand(...) ?? monthlySalary`; partial PROOF up to remaining; NOTE takes full remaining.
