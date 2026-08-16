# Tasks: Medical Premium Recoveries

**Gates closed**: mockup approved; spec has no open questions.

## Phase 1: Foundational

- [x] T001 Add `expectedRecovery(policy, coverEndedOn, premium)` to `src/lib/benefits/policy-year.ts` — pure, built on `recoverablePeriod` + `wholeMonthsBetween`
- [x] T002 Add `MedicalRecovery` + `MedicalRecoveryStatus` to `prisma/schema.prisma` per plan Phase 1
- [x] T003 Write `prisma/sql/048_medical_recoveries.sql` — additive, idempotent, no backfill of past leavers

## Phase 2: US1 — Finance sees what is owed back (P1) 🎯 MVP

- [x] T004 [US1] Create a recovery when a charge is cancelled, in `applyScheduledMedicalCharges` (`src/app/(app)/admin/benefits/actions.ts`)
- [x] T005 [US1] Add an idempotent `syncMedicalRecoveries()` in `src/lib/benefits/recoveries.ts` for leavers whose date was recorded after the cycle opened
- [x] T006 [US1] Render the recoveries section on `src/app/(app)/finance/page.tsx` per the approved mockup, open items first
- [x] T007 [US1] Show "Needs leave date" instead of a computed figure when `coverEndedOn` is null (FR-014)

## Phase 3: US2 — Finance closes the loop (P1)

- [x] T008 [US2] `recordRecovery` and `writeOffRecovery` server actions in `src/app/(app)/finance/recovery-actions.ts`, `requireFinance`-gated, refusing a second settlement
- [x] T009 [US2] Settle form + settled display in `src/components/finance/RecoveriesTable.tsx`
- [x] T010 [US2] Record `shortfall`, never below zero, including when more than expected is recovered

## Phase 4: US3 — The pattern is visible (P3)

- [x] T011 [US3] Totals row: expected, recovered, shortfall, still open

## Phase 5: Verify & polish

- [x] T012 Pure checks: expected amount over the live case, a null leave date, cover ending after the term, and a partial month
- [x] T013 Database checks: creation on cancellation, sync idempotency, settle/write-off, shortfall floor, no re-settle
- [x] T014 Chromium pass over `/finance` as a Finance user
- [x] T015 `tsc` + `build`; UI snapshot; docs (`PROJECT_DETAILS`, progress tracker, decisions log)
- [ ] T016 Tell the user to paste `048` — with the wrong-database guard query first

## Progress

**Complete** except T016 (the handover instruction). Verification: 22 checks — 8 on the expected
amount (including that it is *not* the cancelled charge), 10 on creation and sync idempotency, 4 on
settling — plus `048` applied twice from the file and a Chromium pass settling a recovery partially
and seeing the shortfall land.
