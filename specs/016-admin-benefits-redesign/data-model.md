# Data Model: Admin Benefits Redesign

**No schema change.** The redesign is a recomposition of existing data plus one new use of an existing model.

## Reused: `BenefitClaim` (manual release)
A manual entry creates a `BenefitClaim` with:
| Field | Value |
|-------|-------|
| `userId` | the employee |
| `planYearId` | the active plan year |
| `guaranteedBenefitId` **or** `catalogItemId` | the benefit being credited (exactly one) |
| `amount` | the recorded amount (≤ remaining allocation, covered terms) |
| `status` | `RELEASED` (not `PENDING`) |
| `decidedAt` | the entered **approval date** (not now; not future) |
| `reviewedById` | the acting HR/Super User |
| `note` | e.g. "Recorded by HR (back-filled)" |

All other consumers (tracker in `lib/benefits/claims.ts`, submissions view, CSV export) already treat
`RELEASED` claims as reimbursed against the allocation — no change needed.

## Reused: `BenefitCatalogItem`
The Catalogue table edits existing fields only: `name`, `category`, `order`, `claimType`, `coverageRate`,
`active` (hide/show). `createCatalogItem` unchanged (derived unique key).

## Reused: pool ceilings / guaranteed amounts / medical rate card
The Amounts tab edits the existing `PoolCeiling`, `GuaranteedBenefit` (per band; Loans null), and
`MedicalRateCard` via their existing server actions — only the presentation becomes view-first.

## Invariants (server-authoritative)
- Manual release: valid allocation target required; `decidedAt` not in the future; total
  RELEASED+PENDING (incl. the new one) ≤ allocation.
- Everything else: unchanged from specs 007/012/013.
