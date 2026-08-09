---
description: "Task list for Benefits Claim-Based Living Allowance"
---

# Tasks: Benefits Claim-Based Living Allowance

**Input**: Design documents from `/specs/018-benefits-claim-allowance/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No unit/integration test framework exists in this repo. Per plan.md, verification is
`npx tsc --noEmit` + `npm run build` + the manual quickstart scenarios (A–G). No formal test tasks
are generated; each user-story phase ends with a quickstart verification task.

**Organization**: Grouped by user story (US1–US6 from spec.md) for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task → can run in parallel
- **[Story]**: US1–US6; Setup/Foundational/Polish carry no story label
- Exact file paths included

## Conventions & obligations (apply throughout)

- **Server-authoritative**: every money rule enforced server-side; client mirrors for display only.
- **UI snapshot rule (constitution II)**: before editing ANY file under `src/components/**` or a
  page with UI, copy it to `ui-versions/<component>/<YYYY-MM-DD>_<desc>.tsx` FIRST. Each UI task
  below assumes this snapshot step.
- **Docs move with code (constitution IV)**: the docs tasks in Polish ship in the implementation commit(s).
- **DB (constitution)**: schema reaches Neon only via `prisma/sql/025_*.sql`; validate on a throwaway
  local Postgres first. Never `prisma db push` from a session.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prep the ground; no new project scaffolding needed.

- [ ] T001 Confirm baseline builds green before changes: run `npx tsc --noEmit` and `npm run build` and record they pass.
- [ ] T002 [P] Create a working list of files to be removed/retired so nothing is missed: grep for `BenefitSelection`, `SelectionLine`, `evaluateBasket`, `saveBasket`, `reopenOwnSelection`, `reopenSelection`, `resetSelection`, `MAX_SELECT`, `coerceAmount`, `STEP` across `src/` and paste the hit list into this task's notes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + rule engine that BOTH the claim flow (US1) and medical commitment (US2) depend on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [ ] T003 Update `prisma/schema.prisma`: remove `model BenefitSelection` and `model SelectionLine`; remove the `SelectionStatus` enum if now unused; remove `BenefitCatalogItem.lines`; replace `User.benefitSelections` and `PlanYear.selections` relations with `medicalCommitments MedicalCommitment[]`.
- [ ] T004 Add `model MedicalCommitment` to `prisma/schema.prisma` per data-model.md (fields: userId, planYearId, spouse, childrenUnder18, children18Plus, premium, committedAt, committedById?, timestamps; `@@unique([userId, planYearId])`; FKs to User/PlanYear, and committedBy → User onDelete SetNull).
- [ ] T005 Run `npx prisma generate` and fix all resulting TypeScript references to the removed models so `npx tsc --noEmit` compiles (expect breakages in benefits page/actions/claim-actions/components; they are addressed in later tasks — get the client generated first).
- [ ] T006 Write `prisma/sql/025_claim_based_allowance.sql`: `DROP TABLE IF EXISTS "SelectionLine"; DROP TABLE IF EXISTS "BenefitSelection";` (drop the `SelectionStatus` type if unused), and `CREATE TABLE "MedicalCommitment" (...)` with the unique index + FKs. Leave `BenefitClaim` intact. Include a header comment noting it is a clean wipe (test data).
- [ ] T007 Validate `025_*.sql` on a throwaway local Postgres (per CLAUDE.md §3a): apply it, confirm the two tables are gone, `MedicalCommitment` exists with the unique constraint, and `BenefitClaim` is intact. Record the result.
- [ ] T008 Rewrite the rule core in `src/lib/benefits/rules.ts`: add `evaluateClaim(input, proposedClaim)` per contracts/evaluate-allowance.md (50%-of-pool per-benefit cap for FULL_TIME **and** PART_TIME; whole-pool ceiling incl. medical premium; returns covered/benefitRemaining/poolRemaining + errors). Keep `computeMedicalPremium`. Add `export const COUNT_LIMIT_ENABLED = false;` and keep `MAX_SELECT_*` consulted only when it is true. Remove `STEP`/`coerceAmount` rounding from the cost path; delete `evaluateBasket`.
- [ ] T009 [P] Add `getMedicalCommitment(userId, planYearId)` to `src/lib/benefits/config.ts`.
- [ ] T010 [P] Add a per-benefit 50%-cap allocation helper to `src/lib/benefits/claims.ts` (reuse `tracker()`; `allocated = floor(ceiling*0.5)`).

**Checkpoint**: `npx tsc --noEmit` passes with the new schema + rule core; migration validated locally.

---

## Phase 3: User Story 1 - Claim a flexible benefit as you spend (Priority: P1) 🎯 MVP

**Goal**: Employees file reimbursement claims against any active flexible benefit, multiple times, bounded by the 50% per-benefit cap and the pool ceiling — no basket, no submit.

**Independent Test**: Quickstart scenarios A & B pass (covered computed from full cost; 50% and ceiling rejections with actionable messages).

- [ ] T011 [US1] Rework `src/app/(app)/benefits/claim-actions.ts` for catalog claims per contracts/create-flexible-claim.md: remove the "must be in a SUBMITTED basket" precondition; resolve the item as any `active`, non-medical catalog item; reject medical ("doesn't need a claim"); enforce the 50% per-benefit cap and the whole-pool ceiling via `evaluateClaim`; store `covered` in `BenefitClaim.amount`; keep PROOF upload + NOTE behavior. Return actionable messages.
- [ ] T012 [US1] Update `src/app/(app)/benefits/page.tsx` to compute, per active flexible benefit: coverage %, per-benefit remaining (50% cap − claimed), and pool remaining (ceiling − medical premium − Σ covered); pass these to the claim UI. Remove all `BenefitSelection`/basket reads.
- [ ] T013 [US1] Update `src/components/benefits/BenefitClaims.tsx` (snapshot first) to be the flexible-claim surface: each benefit shows coverage %, remaining claimable, and an inline claim form (exact full cost + proof) with inline success/error (mirror the interactive pattern used in the incentive upload).
- [ ] T014 [US1] Verify US1: run quickstart Scenarios A & B on local PG; confirm covered math, the 50%-cap rejection message with remaining, and the ceiling "contact HR" rejection. Run `npx tsc --noEmit`.

**Checkpoint**: Flexible claim-as-you-go works end-to-end (MVP).

---

## Phase 4: User Story 2 - Commit medical insurance once (Priority: P1)

**Goal**: Employee commits medical once per plan year; locked after (HR-only edits); premium drawn from pool, exempt from 50%, capped at ceiling.

**Independent Test**: Quickstart Scenario C passes.

- [ ] T015 [US2] Add `commitMedical(payload)` to `src/app/(app)/benefits/actions.ts` per contracts/commit-medical.md: create `MedicalCommitment` (reject if one exists), compute premium, cap at ceiling with a "contact HR" warning when it exceeds, `revalidatePath`. Remove the obsolete `saveBasket`, `reopenOwnSelection`, and `markOrientationSeen` stays.
- [ ] T016 [US2] Build the medical commitment UI in `src/components/benefits/BenefitsSelector.tsx` (snapshot first) OR a focused new `MedicalCommitmentCard.tsx`: configure self + spouse + dependant counts → commit; after commit show a locked, read-only summary with a "Contact HR to change" note (no deselect/reduce).
- [ ] T017 [US2] Wire the medical card into `src/app/(app)/benefits/page.tsx`: show the commit card (uncommitted) or the locked committed summary; reflect the premium in pool-remaining used by US1.
- [ ] T018 [US2] Verify US2: quickstart Scenario C (commit, locked-after, premium in pool, over-ceiling cap+message). `npx tsc --noEmit`.

**Checkpoint**: Medical commitment works and is locked to the employee; US1 pool math includes the premium.

---

## Phase 5: User Story 3 - Use as many benefits as the budget allows (Priority: P2)

**Goal**: No count-based rejection; only 50% + ceiling bound spend.

**Independent Test**: Quickstart Scenario D passes.

- [ ] T019 [US3] Confirm `evaluateClaim` and `claim-actions.ts` never reject on benefit count while `COUNT_LIMIT_ENABLED` is false; remove any residual "max N benefits" enforcement/branches from the claim path.
- [ ] T020 [US3] Remove/replace stale count-limit copy in the benefits UI (`page.tsx`, `BenefitClaims.tsx`, terms text) — no "max 5/3" or "X of N benefits chosen" language remains in the flexible flow.
- [ ] T021 [US3] Verify US3: quickstart Scenario D (six benefits within budget all accepted). `npx tsc --noEmit`.

**Checkpoint**: Count limit is dormant; variety is governed by the 50% rule + pool only.

---

## Phase 6: User Story 4 - HR manages committed medical & automatic benefits (Priority: P2)

**Goal**: Only HR can change/remove a committed medical / automatic benefit (exception path).

**Independent Test**: Quickstart Scenario E passes.

- [ ] T022 [US4] Add HR override actions in `src/app/(app)/admin/benefits/actions.ts`: edit an employee's `MedicalCommitment` (dependants → recompute premium, cap at ceiling) and remove it; record `committedById` = acting admin. Remove the now-obsolete `reopenSelection`/`resetSelection` (BenefitSelection is gone).
- [ ] T023 [US4] Update `src/app/(app)/admin/benefits/page.tsx` (snapshot first): replace the basket-reopen UI with a medical-commitment view/edit/remove control per employee; keep the existing manual claim-entry (spec 016) as the path for prior claims.
- [ ] T024 [US4] Verify US4: quickstart Scenario E (HR edits/removes medical; employee pool updates; employee still can't self-edit). `npx tsc --noEmit`.

**Checkpoint**: HR exception path works; employee-side lock intact.

---

## Phase 7: User Story 5 - Orientation tour reflects the new model (Priority: P3)

**Goal**: Orientation explains claim-as-you-go, full-price + %, claim-again up to 50%, medical is the one commitment; final button "Got it".

**Independent Test**: Quickstart Scenario F passes.

- [ ] T025 [US5] Rewrite `src/components/benefits/BenefitsOrientation.tsx` (snapshot first): update steps 3 & 4 and add the medical-commitment line per the approved copy; change the final button to "Got it"; remove the `maxSelect` prop usage and any "pick up to N"/"submit your basket" language.
- [ ] T026 [US5] Update the orientation props passed from `src/app/(app)/benefits/page.tsx` (drop `maxSelect`; adjust `autoOpen`/`submitted` logic now that there's no submitted basket — e.g. auto-open until orientation seen).
- [ ] T027 [US5] Verify US5: quickstart Scenario F (copy correct; no forbidden phrases; "Got it"). `npx tsc --noEmit`.

**Checkpoint**: Orientation matches the new model.

---

## Phase 8: User Story 6 - Admin cannot configure a 0%-coverage benefit (Priority: P3)

**Goal**: Reject saving a catalog benefit at 0% coverage.

**Independent Test**: Quickstart Scenario G passes.

- [ ] T028 [US6] Add server-side validation in `src/app/(app)/admin/benefits/actions.ts` for `createCatalogItem` and `updateCatalogItem`: coverageRate must be an integer 1–100; reject 0 with "Coverage must be between 1% and 100%."
- [ ] T029 [US6] Reflect the 1–100 constraint in the admin catalog form UI in `src/app/(app)/admin/benefits/page.tsx` (min/max on the input + inline error). (Snapshot first.)
- [ ] T030 [US6] Verify US6: quickstart Scenario G (0% rejected). `npx tsc --noEmit`.

**Checkpoint**: 0%-coverage benefits cannot be created.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, docs, and the final verification gate.

- [ ] T031 [P] Remove dead code surfaced in T002 that remains after all stories (old basket helpers, `evaluateBasket`, unused imports/props); confirm no references to `BenefitSelection`/`SelectionLine` remain in `src/`.
- [ ] T032 [P] Update `specs/007-benefits/`, `specs/012-benefits-coverage/`, and `specs/017-benefits-orientation/` to reflect the claim-based model (note where superseded by spec 018).
- [ ] T033 [P] Update `PROJECT_DETAILS.md` and `IMPLEMENTATION_PROGRESS.md` (new data model, claim-based flow, medical commitment, dormant count limit).
- [ ] T034 [P] Update `.specify/memory/constitution.md` Principle III wording: count limit is "configurable, default off" (still server-side when enabled) — keep it in sync with `CLAUDE.md`.
- [ ] T035 Final gate: `npx tsc --noEmit` and `npm run build` both pass; re-run quickstart Scenarios A–G end-to-end on local PG.
- [ ] T036 Prepare the Neon hand-off: confirm `prisma/sql/025_claim_based_allowance.sql` is committed with the schema change and tell the user exactly which file to paste (and that it is destructive/clean-wipe of selection data).
- [ ] T037 Confirm every edited UI file has a matching `ui-versions/` snapshot, and request the user's visual sign-off before merge (constitution II).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **BLOCKS all user stories** (schema + rules).
- **US1 (P3)** and **US2 (P4)** → after Foundational; both are P1. US1 pool math reads the medical premium, so if both are in flight, land T015 before finalizing T012's pool-remaining calc (or stub premium=0 until US2). They share `benefits/page.tsx` → serialize edits to that file.
- **US3 (P5)**, **US4 (P6)**, **US5 (P7)**, **US6 (P8)** → after Foundational; US3/US5 touch `benefits/page.tsx`/components (serialize with US1/US2 edits); US4/US6 touch the admin benefits files (can run parallel to the employee-side stories).
- **Polish (P9)** → after all targeted stories.

### Shared-file serialization (NOT [P] with each other)

- `src/app/(app)/benefits/page.tsx`: T012, T017, T026 (and reads from US3 copy changes) — edit sequentially.
- `src/app/(app)/admin/benefits/page.tsx`: T023, T029 — sequential.
- `src/app/(app)/admin/benefits/actions.ts`: T022, T028 — sequential.
- `src/components/benefits/BenefitClaims.tsx`: T013, T020 — sequential.

### Parallel opportunities

- T009, T010 [P] (different lib files) after T005.
- Admin-side stories (US4, US6) can proceed in parallel with employee-side (US1/US2/US3/US5) since they touch different files — mind the two shared admin files above.
- Polish T031–T034 are [P] (different files).

---

## Implementation Strategy

### MVP first

1. Phase 1 Setup → 2. Phase 2 Foundational (schema + rules + migration validated locally) → 3. Phase 3 US1 (claim-as-you-go) → **STOP & validate Scenarios A/B**. This is a demoable MVP (claims work) even before medical commitment UI is polished.

### Incremental delivery

US1 (MVP) → US2 (medical commit) → US3 (no count limit) → US4 (HR override) → US5 (orientation) → US6 (0% guard) → Polish. Each story is independently verifiable via its quickstart scenario.

### Notes

- Commit after each phase (or logical group); keep schema + `prisma/sql/025` + docs in the same commit as the code that needs them.
- Every UI edit: snapshot to `ui-versions/` first; get visual sign-off before merge.
- Nothing runs against Neon from a session — hand the user the `025_*.sql` to paste.
