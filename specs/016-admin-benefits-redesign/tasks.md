# Tasks: Admin Benefits Redesign + Manual Claim/Release Entry

**Feature**: 016-admin-benefits-redesign | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

No schema change. Validation: `tsc` + `build` + a throwaway-Postgres proof of the manual-entry action.
**UI mockup approval gate before implementing (Phase 2+).**

## Phase 1: Approve the layout
- [x] T001 Build a navy/gold mockup of the redesigned admin (3 tabs, view-first tables, one-table catalogue, manual-entry form) and get product-owner approval before touching code.

## Phase 2: View-first primitive + snapshots
- [x] T002 Snapshot `AdminBenefitsTabs.tsx` and `admin/benefits/page.tsx` to `ui-versions/admin-benefits-redesign/2026-08-07/`.
- [x] T003 Create `src/components/admin/EditableSection.tsx` — client wrapper: read-only view + Edit toggle → renders the provided edit form; returns to read-only after a server-action save (revalidate).

## Phase 3: US1/US2/US3 — tabs + catalogue + amounts
- [x] T004 [US2] Create `src/components/admin/BenefitCatalogueTable.tsx` — one table (Name · Category · Order · Claim requirement · Coverage %) per benefit, view-first (wrapped in EditableSection), with hide/show + add; per-row claim-requirement control (reuse `setClaimType`) and coverage-% (reuse `updateCatalogItem`). Medical coverage locked at 100%.
- [x] T005 [US1][US3] Recompose `src/app/(app)/admin/benefits/page.tsx`: build `submissionsPanel` (existing + manual form), `cataloguePanel` (BenefitCatalogueTable), `amountsPanel` (ceilings + guaranteed amounts + guaranteed claim-requirement + rate card, each view-first). Pass the new 3-tab array (Submissions & Claims · Benefits Catalogue · Amounts) to `AdminBenefitsTabs`. Remove the old `configPanel`/`requirementsPanel`.
- [x] T006 [US3][US4] Wrap the Amounts tables (pool ceilings, guaranteed FT, guaranteed PT, medical rate card) in `EditableSection` (view-first). Keep the existing server actions/validation.

## Phase 4: US5 — manual claim/release entry
- [x] T007 [US5] Create `src/app/(app)/admin/benefits/manual-actions.ts` — `recordManualRelease(formData)`: `requireAdmin()`; resolve allocation target (guaranteed or catalog line); guards (future-date reject, target required, amount ≤ remaining allocation in covered terms); create a RELEASED `BenefitClaim` with `decidedAt` = approval date + `reviewedById` = actor; revalidate.
- [x] T008 [US5] Create `src/components/admin/ManualReleaseForm.tsx` — employee picker → benefit picker → amount + approval date → Record; surfaces server errors; place it in the Submissions & Claims panel.

## Phase 5: Verify & docs
- [x] T009 `tsc` + `build` green; grep confirms no Configuration/Claim-requirements tab remains.
- [x] T010 Throwaway Postgres: `scripts/verify-manual-release.mts` — released state + back-dated decision, allocation cap, future-date reject, no-target reject.
- [x] T011 Docs (same commit): `PROJECT_DETAILS.md` (admin Benefits tabs + manual entry), `IMPLEMENTATION_PROGRESS.md` (build log, spec 016 → implemented), `IMPLEMENTATION_PLAN.md` decisions log. Note the everyone×benefits master table as the next future item.

## Dependencies
- T001 (approval) gates everything. T003 before T004/T006. T007 before T008. Verify/docs last.
