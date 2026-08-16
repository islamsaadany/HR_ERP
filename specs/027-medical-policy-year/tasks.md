# Tasks: Medical Policy Year

**Input**: Design documents from `/specs/027-medical-policy-year/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: No test runner exists in this project. Verification follows the house pattern (specs 018/023/028): pure-function and database assertions executed with `tsx` against a throwaway Postgres, plus a Chromium pass. Those verification tasks are included below and are **not optional** — house rule §3a forbids handing over unverified work.

**Gates already closed**: UI design approved 2026-08-16; per-cycle capping confirmed by the product owner's choice of full overlap-charging.

**Organization**: Tasks are grouped by user story. US1 alone is a shippable increment.

---

## Phase 1: Setup

- [x] T001 Start a throwaway Postgres and apply the current schema per the Prerequisites section of `specs/027-medical-policy-year/quickstart.md`
- [x] T002 Seed the live shape into it — Jan–Dec 2026 plan year, pool ceilings, medical rate bands, and one employee with a committed medical premium — as the baseline the migration must not disturb

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: The pure calculation and the schema everything else reads. Nothing below this line can proceed without it.

- [x] T003 Add `wholeMonthsBetween(from, to)` — uncapped — to `src/lib/benefits/proration.ts`, leaving `remainingWholeMonths` capped at 12 (research D4)
- [x] T004 Clamp `poolCycleFraction` to a maximum of 1 explicitly in `src/lib/benefits/proration.ts`, so the pool no longer depends on a loop bound to stay under 100% (research D4)
- [x] T005 [P] Create `src/lib/benefits/policy-year.ts` with `overlapWholeMonths(policy, cycle)` — pure, no I/O
- [x] T006 Add `splitPremium(premium, policy, cycles)` to `src/lib/benefits/policy-year.ts`: `floor(premium × overlap ÷ policyMonths)` per cycle, remainder to the final cycle (research D3)
- [x] T007 Add `MedicalPolicyYear` and `MedicalCycleCharge` models plus `MedicalCommitment.policyYearId` to `prisma/schema.prisma`, changing commitment uniqueness to `(userId, policyYearId)` per `data-model.md`
- [x] T008 Write `prisma/sql/047_medical_policy_year.sql`: create both tables, add the column, backfill a policy year from the open plan year, attach existing commitments, and give each a single charge equal to its premium against its original plan year. Idempotent, non-destructive, no premium recomputed (research D2)
- [x] T009 Add `getActivePolicyYear()` and `getCycleCharge(commitmentId, planYearId)` to `src/lib/benefits/config.ts`, falling back to the active plan year's window when no policy year exists (research D6)

**Checkpoint**: `npx tsc --noEmit` clean; `047` applies twice from the file with no change on the second run; every existing commitment's premium is untouched.

---

## Phase 3: User Story 1 — The pool absorbs only this cycle's share (P1) 🎯 MVP

**Goal**: An employee committing to a Jun–May policy has only the Jun–Dec share charged to their calendar-year pool; the rest is charged when the next cycle opens.

**Independent test**: Commit a 40,000 premium against the 2026 cycle → pool falls by 23,333, not 40,000; a 16,667 charge sits scheduled against 2027.

- [x] T010 [US1] Rewrite `commitMedical` in `src/app/(app)/benefits/actions.ts` to resolve the policy year, prorate a mid-term joiner against the **policy term**, split across overlapping cycles, cap each charge at that cycle's ceiling, and write the commitment plus its charges
- [x] T011 [US1] Point the pool total in `src/app/(app)/benefits/page.tsx` at the current cycle's charge instead of `commitment.premium`
- [x] T012 [US1] Point `AllowanceContext.medicalPremium` in `src/app/(app)/benefits/claim-actions.ts` at the same cycle charge, so claim-time enforcement and the displayed pool agree
- [x] T013 [US1] Apply scheduled charges when a plan year opens, in `src/app/(app)/admin/benefits/plan-year-actions.ts` — `APPLIED` for an active employee, `CANCELLED` for anyone who has left (research D7)
- [x] T014 [US1] Add the carry note to the pool card in `src/components/benefits/BenefitsBoard.tsx`, per the approved mockup; it must not render when the term sits inside one cycle
- [x] T015 [US1] Save a `ui-versions/BenefitsBoard/` snapshot before editing T014, per CLAUDE.md
- [x] T016 [US1] Verify the exact-sum invariant with `tsx` against the throwaway database, over the spread in `quickstart.md` §1 — uneven division, single-cycle term, zero overlap, one-month and 24-month terms, zero premium
- [x] T017 [US1] Verify the month-counting guard per `quickstart.md` §2 — a 13-month window counts 13, and `poolCycleFraction` still returns 1 for it
- [x] T018 [US1] Verify migration `047` per `quickstart.md` §3, applied from the file against the T002 baseline, twice
- [x] T019 [US1] Verify cycle-open behaviour per `quickstart.md` §4, including the leaver whose charge must be cancelled and never shown as owed
- [x] T020 [US1] Verify the steady state per `quickstart.md` §5 — the 2027 pool absorbs exactly 12 months of premium, matching a naive full-premium charge. This is the check that the model is right rather than merely different

**Checkpoint**: US1 is shippable. Medical charges correctly, the transition year is fixed, and the model settles.

---

## Phase 4: User Story 2 — HR sets and sees the policy window (P2)

**Goal**: HR configures the policy term and can reconcile a committed premium against per-cycle charges.

**Independent test**: Set a Jun–May term, commit an employee, and see the full premium, both cycle charges, and the term on one screen.

- [ ] T021 [P] [US2] Add policy-year create/edit to `src/app/(app)/admin/benefits/config-actions.ts`, rejecting `endDate <= startDate` and a second `OPEN` term
- [ ] T022 [US2] Add the policy-year control to the admin Benefits page beside the existing Plan year dialog in `src/app/(app)/admin/benefits/page.tsx`
- [ ] T023 [US2] Add the per-cycle charge table to the commitment list in `src/app/(app)/admin/benefits/page.tsx` per the approved mockup — months, charge, status, and a reconciling total
- [ ] T024 [US2] Show the recoverable period on a cancelled charge, starting at the **leave date** rather than the cycle boundary (research D7)
- [ ] T025 [US2] Save a `ui-versions/admin-benefits-page/` snapshot before editing T022–T024
- [ ] T026 [US2] Re-split on premium edit in `src/app/(app)/admin/benefits/actions.ts`, touching open cycles only and preserving the exact-sum invariant (FR-014)
- [ ] T027 [US2] Flag commitments that predate a policy-window change rather than silently re-splitting them (FR-015)

**Checkpoint**: HR can configure the term and audit every split against insurer invoices.

---

## Phase 5: User Story 3 — The term's real length prices it (P2)

**Goal**: A misconfigured term of any length is split by its true length, never silently rounded to twelve months.

**Independent test**: Configure a 13-month and a 6-month term; both count and split by their real length.

- [ ] T028 [US3] Verify a term of other than 12 months splits by its true length, with the sum still exact, per `quickstart.md` §2 and spec US3
- [ ] T029 [US3] Confirm no pool anywhere can exceed its ceiling under a longer-than-year window — the money bug T004 guards against

---

## Phase 6: Polish & cross-cutting

- [x] T030 Verify the no-policy-year fallback per `quickstart.md` §6 — results identical to today, so the change is invisible until HR opts in (FR-002, SC-005)
- [ ] T031 Browser pass per `quickstart.md` §7 — employee pool card and HR commitment list, as both roles, no console errors
- [x] T032 Run `npx tsc --noEmit` and `npm run build`; both clean
- [ ] T033 [P] Update `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, and the `IMPLEMENTATION_PLAN.md` decisions log in the implementing commit (CLAUDE.md)
- [ ] T034 Tell the user to paste `prisma/sql/047_medical_policy_year.sql` into Neon — **and to run the wrong-database guard query first**, after the 046 incident

---

## Dependencies

- **Setup (T001–T002)** → everything
- **Foundational (T003–T009)** → blocks all stories. T003/T004 precede T005/T006 (the split uses the uncapped helper); T007 precedes T008 (schema before SQL); T008 precedes T009 (tables before reads)
- **US1 (T010–T020)** → no dependency on US2 or US3
- **US2 (T021–T027)** → needs Foundational; independent of US1's employee-facing work, though T023 is only meaningful once T010 writes charges
- **US3 (T028–T029)** → pure verification of Foundational; can run any time after T006
- **Polish (T030–T034)** → last

## Parallel opportunities

- T005 with T003/T004 — different files
- T021 with T010 — admin and employee paths don't touch the same files
- T016–T020 are separate verification scripts and can be written in parallel, though each needs its subject task done
- T033 with T031 — docs and browser pass are independent

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone fixes the transition year and makes the money correct; HR can live without the configuration screen for one cycle because the fallback (research D6) keeps behaviour sane.

Ship US1, verify against the quickstart, then add US2. US3 is verification of work already done in Phase 2 and costs almost nothing once the helpers exist.

**Do not** start T014 or T022–T024 without re-reading the approved mockup — the design is signed off, and drifting from it silently is the failure `ui-versions/` exists to catch.

## Progress

**Done**: Setup, all of Foundational, and **all of US1** — the MVP. Commit writes per-cycle charges,
the pool and claim context both read this cycle's charge, opening a cycle applies or cancels what
was scheduled, and the pool card carries the approved note. Also T030 (no-policy-year fallback) and
T032 (tsc + build), which fell out of the same verification pass.

Verification: 40 pure-function checks, 18 database checks, and a Chromium pass on the pool card —
pool 21,667 not 5,000, "Used this cycle EGP 23,333", carry note naming the 16,667.

**Next**: US2 (T021–T027) — HR configures the policy term and audits the split. US3 (T028/T029) is
verification of Phase 2 work and is nearly free. Then T031/T033/T034.

**Note for the next session**: re-keying `MedicalCommitment` to the policy year broke four call
sites that asked `findUnique({ userId_planYearId })`. All four are updated to ask the question the
feature actually poses — *the commitment CHARGING this cycle*, which may have been made in the
previous one — with a `planYearId` fallback for rows predating the migration. That pattern repeats
in four files; if a fifth appears, extract it.

## Open questions (carried, not blocking)

1. **Does the platform compute a leaver's recoverable amount, or only state the period?** Computing it means asserting a figure the insurer actually determines; if their proration differs, HR reconciles two disagreeing numbers. Currently specced as period-only (T024).
2. **The pre-existing React key warning on `/admin/benefits`** (`CatalogueGrid`) is unrelated to this feature and deliberately untouched. T023 adds markup to that page — confirm the warning neither worsens nor gets blamed on this work.
