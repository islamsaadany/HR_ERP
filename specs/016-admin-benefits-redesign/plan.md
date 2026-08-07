# Implementation Plan: Admin Benefits Redesign + Manual Claim/Release Entry

**Branch**: `claude/hr-erp-benefits-coverage-rates-hnaox1` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

## Summary

Restructure `/admin/benefits` into **three tabs — Submissions & Claims · Benefits Catalogue · Amounts**
(default first). Fold the old *Claim requirements* editing and the coverage-% control into a **single
Catalogue table** (Name · Category · Order · Claim requirement · Coverage %). Group ceilings + guaranteed
amounts + medical rate card under **Amounts**. Make every config table **view-first** (read-only until an
**Edit** toggle, back to read-only on Save). Add HR/Super-User **manual entry** of an already-approved
claim/release (a `BenefitClaim` created directly `RELEASED` with a back-dated decision date + reviewer,
bounded by the benefit's remaining allocation). No employee-facing or money-rule change.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 App Router, React 19
**Primary Dependencies**: Prisma, Tailwind
**Storage**: No schema change — reuses `BenefitClaim` (status/decidedAt/reviewedById already exist)
**Testing**: `tsc` + `build`; throwaway Postgres proof of the manual-entry action (released state, allocation cap, future-date + no-allocation rejection)
**Project Type**: Web application
**Constraints**: Server-authoritative (HR+Super User); preserve all existing behavior; navy/gold; mirror the existing `AdminBenefitsTabs`/`BenefitsTabs` pattern
**Scale/Scope**: One admin page recomposed; ~5 config tables get a view-first wrapper; one new server action + one manual-entry form

## Constitution Check

- **I. Align Before Building** — ✅ All decisions confirmed; a layout mockup is shown before implementation.
- **II. UI Changes Require Explicit Approval** — ⚠️ Notable admin-layout change (tab reorder, one-table catalogue, view-first tables, manual-entry form). Reuses the existing tab/table styling (no new visual language). Snapshot `AdminBenefitsTabs.tsx` + the admin `benefits/page.tsx` to `ui-versions/` before editing. **Mockup approval gate before build.**
- **III. Benefits Money & Rules Server-Authoritative** — ✅ Manual entry is server-validated (allocation cap, target required, not future); catalog/amounts edits keep their server actions. No rule changes.
- **IV. Spec-Driven & Docs Move With Code** — ✅ Docs + spec statuses updated in the implementing commit.
- **V. Engineered Enough** — ✅ View-first toggle is a small reusable client wrapper (one component, reused per table). Edge cases enumerated (cap, target, future date, tab-switch discards).

**Result: PASS** (UI mockup approval gate under II).

## Design

### Tabs (reorder + split)
`AdminBenefitsTabs` already defaults to `tabs[0]`. New array order:
1. **Submissions & Claims** (`submissionsPanel`, unchanged + manual-entry form + keeps the pending-claims badge).
2. **Benefits Catalogue** (`cataloguePanel` — new: the basket-catalog table extended with a **Claim requirement** control per row + the **Coverage %** field, absorbing `requirementsPanel`'s catalog rows).
3. **Amounts** (`amountsPanel` — pool ceilings + guaranteed amounts + medical rate card, the money half of the old `configPanel`).

The old `configPanel` and `requirementsPanel` are removed; their pieces move as above. Guaranteed-benefit
**claim requirement** (the non-catalog half of the old requirements panel) moves into the guaranteed-amounts
area of the **Amounts** tab (guaranteed benefits are amounts, not catalog rows).

### View-first wrapper
A small client component `EditableSection`: renders a **read-only** view; an **Edit** button swaps to the
provided form; server-action submit persists and (via revalidate) returns to read-only. Each config table
(catalogue, ceilings, guaranteed FT, guaranteed PT, rate card) is wrapped independently, so they toggle
separately (FR-004). Unsaved edits vanish on tab switch because inactive panels are hidden and re-rendered
from server state.

### Manual claim/release entry (Submissions & Claims)
New server action `recordManualRelease(formData)`:
- `requireAdmin()`.
- Inputs: employee, benefit (guaranteed or catalog line), **amount**, **approval date**.
- Guards: approval date not in the future; a valid **allocation target** exists (guaranteed benefit the
  employee is eligible for, or a submitted basket line); `amount ≤ remaining allocation` (existing
  RELEASED+PENDING vs allocation, covered terms per spec 012).
- Creates a `BenefitClaim` `{ status: RELEASED, decidedAt: <approval date>, reviewedById: actor, amount, note?: "Recorded by HR" }` — not pending.
- Revalidates `/admin/benefits` + `/benefits`.

A compact form in the submissions panel (employee picker → benefit picker → amount + date → Record).

## Project Structure

```text
src/
├── components/admin/
│   ├── AdminBenefitsTabs.tsx        # (snapshot) tabs unchanged; page passes the new array
│   ├── EditableSection.tsx          # NEW — view-first read-only ⇄ edit wrapper
│   ├── BenefitCatalogueTable.tsx    # NEW — one-table catalogue (name/category/order/claim-req/coverage%) + hide/add, view-first
│   └── ManualReleaseForm.tsx        # NEW — record an already-approved claim/release
└── app/(app)/admin/benefits/
    ├── page.tsx                     # (snapshot) recompose into 3 panels: submissions(+manual) · catalogue · amounts
    ├── config-actions.ts            # catalogue edit incl. claimType + coverageRate in one action; unchanged validation
    └── manual-actions.ts            # NEW — recordManualRelease (server-authoritative)
```

**Structure Decision**: No schema change. The catalogue table needs a per-row claim-requirement control
(reuse the existing `setClaimType`/typeSelect logic, moved into the row) and the coverage-% field (already
added in 012). `EditableSection` is the one reusable view-first primitive. Manual entry is a released
`BenefitClaim`.

## Complexity Tracking

> No violations. Reuses `BenefitClaim` (no new entity). The only nuance: guaranteed claim-requirement
> editing lives under Amounts (guaranteed benefits aren't catalog rows) while catalog claim-requirement
> moves into the Catalogue table — both absorbing the retired Claim-requirements tab.
