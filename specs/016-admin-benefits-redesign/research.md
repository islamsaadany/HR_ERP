# Research: Admin Benefits Redesign

Decisions were pre-confirmed; this records the design rationale.

## R1 — Manual entry reuses `BenefitClaim` (no new table)
- **Decision**: A manual release is a `BenefitClaim` created directly with `status = RELEASED`,
  `decidedAt = <entered approval date>`, `reviewedById = actor`, and either `guaranteedBenefitId` or
  `catalogItemId` set.
- **Rationale**: The claim model already carries decided date + reviewer + status; the tracker already
  counts RELEASED toward the allocation. So a back-dated release "just works" in every existing view
  (tracker, submissions, CSV export) with no schema change.
- **Alternatives**: A separate "adjustment" table (rejected — duplicates claim semantics, needs its own
  tracker wiring).

## R2 — Allocation cap in covered terms (spec 012)
- **Decision**: `amount ≤ allocation − (existing RELEASED + PENDING)`, where allocation is the covered
  amount (`SelectionLine.amount`) for a basket line, or the band-derived figure for a guaranteed benefit.
- **Rationale**: Consistent with the existing claim cap and FR-006; covered terms after spec 012.

## R3 — View-first is a display state, not persistence
- **Decision**: One reusable `EditableSection` client wrapper toggles a table between a read-only view and
  its existing server-action form. No stored "mode".
- **Rationale**: Minimal, reuses the existing forms/actions; tab switch re-renders from server state so
  unsaved edits discard naturally (edge case).

## R4 — Where the retired tabs' content goes
- **Decision**: Catalog rows' claim-requirement → the Catalogue table (per-row control). Guaranteed
  benefits' claim-requirement → the Amounts tab beside guaranteed amounts. Coverage-% → the Catalogue
  table (moved from the old Configuration catalog editor).
- **Rationale**: Guaranteed benefits are amounts, not catalog items; keeping their claim-requirement with
  their amounts is clearer than forcing them into the catalogue table.

## R5 — Tab default
- **Decision**: Submissions & Claims first (the tabs component already activates `tabs[0]`).
- **Rationale**: Most-used; FR-001.
