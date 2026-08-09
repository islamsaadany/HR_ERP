# Phase 0 Research: Benefits Claim-Based Living Allowance

All Technical Context items were resolvable from the existing codebase and the clarify session; no open `NEEDS CLARIFICATION` remain. Decisions below.

## D1 — Where the medical commitment lives

- **Decision**: New `MedicalCommitment` table (one row per user × plan year): `spouse`, `childrenUnder18`, `children18Plus`, computed `premium` (covered = premium, 100%), `committedAt`, `committedById` (nullable — set when HR commits/edits on the employee's behalf). Remove `BenefitSelection` and `SelectionLine`.
- **Rationale**: Clarify Q3=B. Flexible benefits no longer have any per-benefit selection/allocation record, so the only durable per-employee benefits state is medical. A dedicated, single-purpose table is clearer than repurposing the old basket table and drops the now-meaningless `status`/lines columns.
- **Alternatives considered**: (A) Reuse `BenefitSelection` for medical only — rejected by the user in clarify (leaves dead columns/relations). (C) Keep structure, change rules only — rejected (leaves the basket concept the redesign removes).

## D2 — Claims without a basket

- **Decision**: `BenefitClaim` already links to `catalogItemId` (or `guaranteedBenefitId`) directly, **not** to a selection line. Remove the `claim-actions` precondition "must be in a SUBMITTED basket." A flexible claim is valid for any `active`, non-medical `BenefitCatalogItem` while the plan year is open.
- **Rationale**: The direct link already exists; only the guard changes. No claim schema change needed.
- **Alternatives considered**: Adding a claim→selectionLine FK — rejected (selection lines are being removed).

## D3 — Per-benefit allocation = 50% of pool (no stored allocation)

- **Decision**: There is no stored per-benefit allocation. The claim tracker's `allocated` for a flexible benefit is computed as `floor(ceiling × 0.5)`. Remaining-to-claim = `50%-cap − Σ covered(pending+released) for that benefit`. A claim is rejected if its covered amount exceeds that remainder (message states the remainder).
- **Rationale**: Matches spec FR-005/FR-007; reuses existing `tracker()` semantics (pending+released count against allocation).
- **Alternatives considered**: Storing an allocation per benefit — rejected (the whole point of the redesign is no pre-allocation).

## D4 — Ceiling check across everything

- **Decision**: Total covered = committed medical premium + Σ covered flexible claims (pending+released). A new claim is rejected if it would push total over `ceiling` ("pool fully used — contact HR"). Medical premium is capped at the ceiling and exempt from the 50% cap.
- **Rationale**: spec FR-006/FR-013; user confirmed "company committed to the ceiling; over → contact HR."
- **Open detail for implement**: whether an over-ceiling *medical* commit is **blocked** or **capped + message**. Spec FR-013 says cap + "contact HR" message; will implement cap + message and confirm visually at UI sign-off (low-risk, reversible copy/logic choice).

## D5 — Cost is the exact receipt value (no rounding)

- **Decision**: Remove `coerceAmount`'s 1,000-step rounding from the cost path; the employee enters the exact full price (matches proof). Covered = `coveredAmount(cost, rate)` (already rounds covered to a whole number). `STEP` and the "steps of 1,000" warning are removed from the claim/commit entry path.
- **Rationale**: spec FR-002/FR-003 and the team's "the cost is a cost, must match the receipt." Also fixes the earlier "server silently re-rounds" bug from the stress test.
- **Alternatives considered**: Keep stepping as a convenience — rejected (conflicts with receipt-exact requirement).

## D6 — 50% rule now applies to part-time too

- **Decision**: Drop the `isFT` gate on the 50% cap; enforce for all employment types.
- **Rationale**: spec FR-005; with the count limit gone, the 50% rule is the primary variety guard for everyone (clarify context).

## D7 — Count limit dormant, not deleted

- **Decision**: Keep `MAX_SELECT_*` constants and add a single `COUNT_LIMIT_ENABLED = false` flag (module constant). Enforcement code stays but is gated off. No admin UI (clarify Q2=A).
- **Rationale**: Team wants the option back later without a rebuild.

## D8 — Cutover migration (clean wipe)

- **Decision**: `prisma/sql/025_claim_based_allowance.sql`: `DROP TABLE "SelectionLine"; DROP TABLE "BenefitSelection";` (removes all selection/allocation data), `CREATE TABLE "MedicalCommitment" (...)` with the unique `(userId, planYearId)` and FKs, and drop the `SelectionStatus` enum if unused. `BenefitClaim` is left intact. Employees re-commit medical; HR re-enters any real prior claims via the manual claim-entry flow (spec 016).
- **Rationale**: Clarify Q1=B + user confirmation that all current data is test data. Applied to Neon by pasting the numbered file (constitution data-ops rule); validated first on a throwaway local Postgres per CLAUDE.md §3a.
- **Alternatives considered**: Data-preserving migration mapping old lines → nothing — unnecessary given test data.

## D9 — UI approach

- **Decision**: Restructure the benefits page into: (1) a **Medical commitment** card (configure self+dependants → commit; locked after, HR-only edits), (2) the unchanged **guaranteed benefits** band, (3) a **claimable flexible list** — each benefit shows coverage %, remaining claimable (50% cap) and pool remaining, with an inline claim action (full cost + proof). Reuse `BenefitClaims` for the claim surface; retire the allocate/submit parts of `BenefitsSelector`. Rewrite `BenefitsOrientation` copy.
- **Rationale**: Removes the basket/submit ceremony while preserving the navy/gold look and the live-meter idea (now "pool remaining"). Each file snapshotted + user-approved at implement time (constitution II).
