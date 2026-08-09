# Tasks: Mid-Year Starter Proration

**Feature**: `specs/019-mid-year-proration/` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

**Branch**: developed on session branch `claude/claude-md-repo-fixes-yx8sbm`

No automated test framework exists in this repo; verification is via `npx tsc --noEmit`, `npm run build`, applying SQL to a throwaway local Postgres, and the `quickstart.md` scenarios. No test tasks are generated (none requested); a verification phase covers it.

**Constitution gate (II)**: tasks that edit UI components (T014, T017, T022, T025) are BLOCKED on the mockup sign-off task **T013** and each requires a `ui-versions/` snapshot. The medical-only view is already mockup-approved; T013 covers only the plan-year date inputs and the "prorated / unlocks at 6 months" indicators.

---

## Phase 1: Setup

- [x] T001 Confirm baseline builds green before changes: run `npx tsc --noEmit` (deps already installed) and record the result in the PR/commit notes.

---

## Phase 2: Foundational (blocking prerequisites for ALL user stories)

- [x] T002 Add `startDate DateTime?` and `endDate DateTime?` to `model PlanYear`, and `prorated Boolean @default(false)` to `model GuaranteedBenefit`, in `prisma/schema.prisma`.
- [x] T003 Create migration `prisma/sql/027_plan_year_window.sql` (idempotent): `ADD COLUMN IF NOT EXISTS` for `PlanYear.startDate`, `PlanYear.endDate`, `GuaranteedBenefit.prorated`; then `UPDATE "GuaranteedBenefit" SET "prorated" = true WHERE "id" IN ('gb_ft_profdev','gb_pt_profdev')`.
- [x] T004 [P] Add a `monthsSince(start, now?)` / add-months helper to `src/lib/derive.ts` (whole-month arithmetic, null-safe), reusing the existing derive conventions.
- [x] T005 [P] Create the pure module `src/lib/benefits/proration.ts` per `contracts/proration.md`: `PlanYearWindow`, `Eligibility`, `eligibilityDate`, `remainingWholeMonths`, `classifyEligibility`, `prorate`. Handle null window / null start date → `FULL` fallback; boundary rules exactly as the contract test table.
- [x] T006 Extend `src/lib/benefits/config.ts`: widen `getActivePlanYear` to include `startDate`/`endDate`; add `planYearWindow(planYear)` → `{start,end}|null`; add `poolCeilingFor(employmentType, band|null)` with the `BAND_6MO_2Y` entry-tier fallback when `band` is null.

**Checkpoint**: proration math + window + ceiling lookup exist and typecheck. No behavior wired yet.

---

## Phase 3: User Story 1 — Admin defines the plan-year window (Priority: P1) 🎯 MVP

**Goal**: HR/Admin can set a start and end date on a plan year; they persist and display.

**Independent test**: Open Admin → Benefits, create/edit a plan year with dates, confirm they save, and that end-before-start is rejected.

- [x] T007 [US1] Extend `createPlanYear` in `src/app/(app)/benefits/actions.ts` to accept optional `startDate`/`endDate`, validate `endDate > startDate` when both present, and persist them.
- [x] T008 [US1] Add `editPlanYearWindow(formData)` server action in `src/app/(app)/benefits/actions.ts` (HR_ADMIN/SUPER_USER only) to set/adjust an existing plan year's `startDate`/`endDate` with the same validation.
- [ ] T013 [US1] ⛔ MOCKUP GATE: build a static navy/gold mockup under `design-mockups/proration/2026-08-09_planyear-dates-and-prorated-indicators.html` showing (a) the plan-year dialog with start/end date inputs and (b) the employee "prorated for mid-year start / unlocks at 6 months" indicators; publish as an Artifact and get explicit sign-off. Blocks T014, T017, T022, T025.
- [ ] T014 [US1] After T013 sign-off: snapshot `src/components/admin/PlanYearDialog.tsx` to `ui-versions/PlanYearDialog/`, then add start/end date inputs to the create form and expose window editing per the approved mockup.
- [ ] T009 [US1] In `src/app/(app)/admin/benefits/page.tsx`, display the active plan year's window and show a clear "dates missing — proration off" warning when the window is unset (FR-016).

**Checkpoint**: plan years carry a window; admin can set/see it; missing-window warning shows.

---

## Phase 4: User Story 2 — Prorated flexible pool (Priority: P1)

**Goal**: A 6-month mid-year starter's flexible pool ceiling is prorated; over-ceiling claims are rejected server-side.

**Independent test**: quickstart S2 — start `2026-04-01`, window `2026-01-01..12-31` → ceiling 5,000; a claim over 5,000 covered is rejected.

- [x] T010 [US2] In `src/app/(app)/benefits/claim-actions.ts` (catalog path), compute `poolEligibility = classifyEligibility(startDate, 6, window)` and set `ctx.ceiling = prorate(annualCeiling, poolEligibility.fraction)` before `evaluateClaim` (server-authoritative; 50% cap + pool total then run against the prorated pool).
- [ ] T011 [US2] In `src/app/(app)/benefits/page.tsx`, compute the same pool eligibility and pass the prorated ceiling (and status) into the board data so displayed figures match the server.
- [ ] T022 [US2] After T013 sign-off: snapshot `src/components/benefits/BenefitsBoard.tsx` to `ui-versions/BenefitsBoard/`, then show the "prorated (mid-year start)" indicator on the pool summary per the approved mockup (display only).

**Checkpoint**: flexible pool prorates and is enforced; UI reflects it.

---

## Phase 5: User Story 3 — Professional development prorated (Priority: P2)

**Goal**: The prof-dev guaranteed allocation prorates by the same rule; other guaranteed benefits do not.

**Independent test**: quickstart S2 — prof-dev claimable = 1,250; a proof claim above it is rejected; Marriage/Summer/etc. stay full.

- [x] T012 [US3] In `src/app/(app)/benefits/claim-actions.ts` (guaranteed path), when `gb.prorated === true` set `allocated = prorate(amountForBand(band, gb), poolEligibility.fraction)`; leave all `prorated === false` benefits at their full band amount.
- [ ] T015 [US3] In `src/app/(app)/benefits/page.tsx`, mirror the prorated prof-dev allocation in the guaranteed display (read `prorated` flag; show prorated amount only for prof-dev).

**Checkpoint**: prof-dev prorates; event/season gifts unaffected.

---

## Phase 6: User Story 4 — Medical at 3 months, prorated, medical-only view (Priority: P2)

**Goal**: Medical unlocks at 3 months (entry-tier ceiling for sub-6-month), premium prorated; sub-6-month employees see a medical-only view.

**Independent test**: quickstart S3 — start `2026-08-01` → medical committable, premium 1,333; basket shown as unlocking at 6 months.

- [x] T016 [US4] In `commitMedical` (`src/app/(app)/benefits/actions.ts`): add the 3-month eligibility gate via `classifyEligibility(startDate, 3, window)`; allow commit when `tenureBand` is null but medical-eligible, using `poolCeilingFor(type, null)`; set `premium = min(prorate(rawAnnualPremium, medicalEligibility.fraction), proratedCeiling)`; keep single-commit lock + 50%-cap exemption.
- [ ] T017 [US4] Adjust the gate in `src/app/(app)/benefits/page.tsx`: allow an employee with no `tenureBand` but medical-eligible (≥3mo) to reach a **medical-only** render; keep the block only when `employmentType` is missing or the employee is not medical-eligible. (Snapshot page already covered under T011/T015 edits; ensure `ui-versions/BenefitsPage/` snapshot exists before structural change.)
- [ ] T025 [US4] In `src/components/benefits/BenefitsBoard.tsx`, render the medical-only view (approved mockup) — medical available; flexible basket + guaranteed benefits shown as "unlocks at 6 months" — and mirror the prorated medical premium (display only).

**Checkpoint**: medical @ 3 months works, prorates, medical-only view shows; server enforces.

---

## Phase 7: User Story 5 — Event/season gifts unaffected (Priority: P2)

**Goal**: Marriage/Summer/Special events/Loans remain full for mid-year starters.

**Independent test**: quickstart S5 — those four show/release full band amounts.

- [x] T018 [US5] Verify (trace + quickstart S5) that the guaranteed path prorates ONLY when `gb.prorated === true`; confirm Marriage/Summer/Special events/Loans (`prorated=false`) and the manual-release/bulk-release paths use full band amounts, unchanged. Fix if any path reads a prorated value.

**Checkpoint**: gifts confirmed un-prorated.

---

## Phase 8: User Story 6 — Full amounts from the next plan year (Priority: P3)

**Goal**: A prior mid-year starter gets full amounts once eligible from day one of a plan year.

**Independent test**: quickstart S6 — advance to next plan year → full pool/prof-dev/medical.

- [x] T019 [US6] Verify (quickstart S6, no code expected — classification is stateless) that an employee whose eligibility date precedes the plan-year start resolves to `FULL` for pool, prof-dev, and medical. Add a code comment near `classifyEligibility` if the self-clearing behavior is non-obvious.

**Checkpoint**: proration self-clears next year.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T020 [P] Run `quickstart.md` scenarios S1–S7 against a throwaway local Postgres (apply `000..027` SQL), confirming each expected figure and every server rejection (house rule 3a).
- [ ] T021 [P] Run `npx tsc --noEmit` and `npm run build`; resolve any type/build errors introduced.
- [ ] T023 [P] Update steering docs in the same change: `PROJECT_DETAILS.md` (plan-year window + proration rules + medical @ 3mo), `IMPLEMENTATION_PROGRESS.md` (spec 019 status), and this spec if behavior shifted during build.
- [ ] T024 [P] Confirm `prisma/sql/027_plan_year_window.sql` matches the final `schema.prisma` (Constitution IV / house rule) and note in the handoff exactly which SQL files to paste into Neon and in what order.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T006)** blocks everything.
- **T013 (mockup gate)** blocks all UI-component tasks: **T014, T022, T025** (and the structural page change in T017).
- **US1 (T007–T009, T014)** is the MVP — the window must exist before any proration is observable.
- **US2 (T010–T011, T022)**, **US3 (T012, T015)**, **US4 (T016–T017, T025)** depend on Foundational; US3/US4 also touch `page.tsx` (T011/T015/T017) and `BenefitsBoard.tsx` (T022/T025) — **serialize edits to these two shared files** (not parallel across stories).
- **US5 (T018)** and **US6 (T019)** are verification, run after US2–US4.
- **Polish (T020–T024)** last.

## Parallel opportunities

- Foundational: **T004** and **T005** are parallel (`derive.ts` vs new `proration.ts`); **T006** depends on T005.
- Server-logic tasks in different files can overlap: **T010** (`claim-actions.ts` catalog) and **T016** (`actions.ts` medical) are parallel; **T012** shares `claim-actions.ts` with T010 → serialize.
- Polish: **T020, T021, T023, T024** are parallel.
- Shared-file caution: `page.tsx` (T009 admin vs T011/T015/T017 employee — different files, OK; but T011/T015/T017 all edit the *employee* page → serialize) and `BenefitsBoard.tsx` (T022/T025 → serialize).

## Implementation strategy

**MVP = US1** (plan-year window) — foundational and independently useful. Then layer US2 (flexible pool) as the first money outcome, US3 (prof-dev), US4 (medical @ 3mo). US5/US6 are confirmations. Ship server logic first; the UI-component tasks wait behind the T013 mockup sign-off.

**Task count**: 25 · **US1**: 5 (incl. mockup gate) · **US2**: 3 · **US3**: 2 · **US4**: 3 · **US5**: 1 · **US6**: 1 · Foundational: 5 · Setup: 1 · Polish: 4.
