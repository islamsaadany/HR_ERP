# Tasks: Age-Banded Per-Person Medical Rate Card (Tier 1)

**Feature dir**: `specs/023-medical-age-rate-card/` · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

**Inputs**: plan.md, spec.md, data-model.md, contracts/medical-pricing.md, research.md, quickstart.md

**Conventions**: `[P]` = parallelizable (different file, no incomplete dep). Story labels map to spec user
stories. Money is server-authoritative; the UI mockup is **already approved** (2026-08-11), satisfying the
Constitution II gate — snapshot each UI file to `ui-versions/` before editing.

**Delivery order (from plan)**: Setup (schema/migration/seed) → Foundational (pure pricing) → US1 admin
card → US3 dependant/DOB data → US2 premium sum → US4 proration → US5 locked/exempt → Polish (verify + docs).
US2 depends on US3's covered-dependant selection, so US3 lands just before US2.

---

## Phase 1: Setup — schema, migration, seed (blocking)

- [ ] T001 Add `MedicalRateBand` model (tier Int default 1, minAge Int, maxAge Int?, annualPremium Decimal @db.Decimal(10,2), order Int, @@unique([tier,minAge]), @@index([tier])) to `prisma/schema.prisma`
- [ ] T002 Add `enum DependantKind { CHILD SPOUSE }` and `kind DependantKind @default(CHILD)` to the `Dependant` model in `prisma/schema.prisma`
- [ ] T003 Add `MedicalCoveredPerson` model (commitmentId FK cascade, dependantId String? FK setNull, label String, ageAtCommit Int, premiumEGP Int, @@index([commitmentId])) and the `coveredPeople MedicalCoveredPerson[]` relation on `MedicalCommitment` in `prisma/schema.prisma`
- [ ] T004 Make `MedicalCommitment.spouse/childrenUnder18/children18Plus` nullable (legacy) and remove the `MedicalRateCard` model from `prisma/schema.prisma`
- [ ] T005 Write the numbered Neon migration `prisma/sql/0NN_medical_age_rate_card.sql` in the exact order from data-model.md §Migration ordering (create DependantKind + Dependant.kind → create MedicalRateBand + seed 12 Tier-1 rows → create MedicalCoveredPerson + relation → nullable legacy columns → drop MedicalRateCard). Determine `0NN` as the next number after the latest file in `prisma/sql/`
- [ ] T006 Update `prisma/seed.ts` to seed the 12 Tier-1 `MedicalRateBand` rows (values from data-model.md) and stop seeding the old `MedicalRateCard`
- [ ] T007 Run `npx prisma generate`; apply `prisma/sql/000…0NN` to a throwaway local Postgres and verify per quickstart §2 (12 bands with decimals intact, old card dropped, `Dependant.kind`=CHILD, `MedicalCoveredPerson` + nullable legacy columns)

**Checkpoint**: schema compiles, migration applies cleanly on throwaway Postgres, Tier-1 seeded.

---

## Phase 2: Foundational — pure pricing helpers (blocking for US1/US2/US4)

- [ ] T008 Create `src/lib/benefits/rates.ts` with `ageAt(dob, refDate)` (completed years, birthday-aware) and `bandFor(age, bands)` (minAge≤age≤maxAge; age>top→{topBand, overTop:true}) per contracts/medical-pricing.md
- [ ] T009 Add `annualPremiumForPerson(dob, refDate, bands)` and `sumMedicalPremium(people, bands, refDate)` to `src/lib/benefits/rates.ts` — per-person **truncated to whole EGP (`Math.trunc`, drop the cents — NOT rounded)**, summed to `annualEGP`, returning per-person lines + `anyOverTop`
- [ ] T010 [P] Add `getMedicalRateBands(tier=1)` to `src/lib/benefits/config.ts` (ordered) and remove `getMedicalRate()`; export a `Band` type
- [ ] T011 Remove `computeMedicalPremium`, `MedicalRate`, `MedicalConfig` (self/spouse/child) from `src/lib/benefits/rules.ts`
- [ ] T012 Write `scratchpad/verify-medical-rates.ts` and run via `tsx` to prove the quickstart worked examples (7,181 personal; 16,879 family; 5,626 mid-cycle 4/12; 12,889 minus child; boundary 18→18–24=5,173; age 80→top band+overTop). All figures truncated (cents dropped)

**Checkpoint**: `rates.ts` math verified against every quickstart figure via `tsx`.

---

## Phase 3 (US1, P1): HR manages the age-banded rate card

**Goal**: Admin edits the 12-band card on Amounts; independently testable by editing a band and seeing it in a preview.

- [ ] T013 [US1] Add `updateMedicalRateBand(id, annualPremium)` (HR/Admin-gated, ≥0, two-decimal) to `src/app/(app)/admin/benefits/actions.ts`
- [ ] T014 [US1] Snapshot then replace the medical rate-card block in the Amounts tab (`src/app/(app)/admin/benefits/page.tsx` + `AdminBenefitsPage`/`EditableSection`) with the 12-band editor (age band → annual premium, two decimals) per the approved mockup; save snapshot to `ui-versions/AdminBenefitsPage/`
- [ ] T015 [US1] Remove the old self/spouse/child rate-card reads/props from the admin Amounts UI and any `MedicalRateCard` references

**Checkpoint**: Amounts tab shows the 12 editable bands; editing persists.

---

## Phase 4 (US3, P1): DOB for everyone priced — spouse entered like kids

**Goal**: Spouse/children entered as dependants (with a type) in the employee form; DOB gating enforced.

- [ ] T016 [US3] Add a dependant **type** selector (Child/Spouse) to the dependant rows in `src/components/admin/EmployeeForm.tsx` (extend the `Dep` type with `kind`; default CHILD; snapshot to `ui-versions/`), and enforce at most one Spouse
- [ ] T017 [US3] Persist `Dependant.kind` in the employee create/edit path `src/app/(app)/admin/employees/actions.ts` (+ `src/lib/validation.ts` dependant schema); default CHILD; one-spouse guard server-side
- [ ] T018 [P] [US3] Surface the dependant `kind` (Spouse vs Child) read-only on the employee profile view `src/app/(app)/profile/page.tsx`
- [ ] T019 [US3] In `commitMedical` (`src/app/(app)/benefits/actions.ts`) block commit when the employee has no `dateOfBirth`, or when a selected covered dependant is missing/foreign/DOB-less — clear, actionable messages (FR-005, FR-007)

**Checkpoint**: HR can mark a dependant as Spouse; committing medical without the required DOBs is blocked.

---

## Phase 5 (US2, P1): Premium = sum of each covered person's age-band price

**Goal**: The committed premium equals the whole-EGP sum over the employee + selected dependants.

- [ ] T020 [US2] Rewrite `commitMedical` in `src/app/(app)/benefits/actions.ts` per contracts/medical-pricing.md: refDate=commit date; people = employee + selected dependant IDs; `sumMedicalPremium` → whole-EGP annual; persist `MedicalCommitment` + one `MedicalCoveredPerson` per line (dependantId null = employee); attach HR-review flag when `anyOverTop`
- [ ] T021 [US2] Change the medical commit input to **selected dependant IDs** (replace spouse-bool/child-counts) in `src/app/(app)/benefits/actions.ts` and the `commitMedical` signature
- [ ] T022 [US2] Feed the board its new medical context in `src/app/(app)/benefits/page.tsx` (both the main and sub-6-month branches): the Tier-1 bands + the employee's dependants (with kind/DOB/derived age/whole-EGP price) instead of the self/spouse/child rate prop
- [ ] T023 [US2] Snapshot then rework `MedicalModal` in `src/components/benefits/BenefitsBoard.tsx` to **select** existing dependants (spouse + children, each showing age→band→whole-EGP price) with a live per-person breakdown summing to the whole-EGP annual; remove the `Counter`/spouse-checkbox model and `computeMedicalPremium` import; link "add/edit dependants" to the profile
- [ ] T024 [US2] Update the committed `MedicalRow` summary (`BenefitsBoard.tsx`) to list covered people from the commitment snapshot and show the whole-EGP premium

**Checkpoint**: an employee's committed premium equals the summed whole-EGP per-person figures; breakdown reconciles.

---

## Phase 6 (US4, P2): Mid-cycle joiner premium is prorated

**Goal**: A mid-cycle medical joiner's age-banded premium is prorated ÷12 (spec 019 rule reused).

- [ ] T025 [US4] In `commitMedical`, apply `classifyEligibility(startDate, 3, planYearWindow).fraction` to the whole-EGP annual and **`Math.trunc`** the result (drop cents, contracts §5); keep the pool-ceiling cap + over-pool warning
- [ ] T026 [US4] Show the prorated premium + "N of 12 mo" indicator (struck-through full annual) in the `MedicalModal` preview and the sub-6-month medical-only view (`BenefitsBoard.tsx`, `benefits/page.tsx`) using the whole-EGP figures

**Checkpoint**: mid-cycle commit stores `annual × months ÷ 12` rounded; full-year commit stores the full annual.

---

## Phase 7 (US5, P2): Committed medical stays locked, exempt, pool-drawing

**Goal**: Preserve the once-and-locked, 50%-exempt, pool-drawing behavior through the pricing change.

- [ ] T027 [US5] Verify/keep the once-per-plan-year + locked-to-employee guards and HR edit/remove path (`editMedicalCommitment`/`removeMedicalCommitment`) work against the new commit shape (`src/app/(app)/admin/benefits/actions.ts`, `benefits/actions.ts`); HR edit re-selects covered dependants
- [ ] T028 [US5] Confirm the pool-ceiling draw + 50%-cap exemption still hold with the new premium in `src/lib/benefits/rules.ts` / `evaluateClaim` context (medical premium excluded from the 50% cap, included in pool total)

**Checkpoint**: commit is locked, HR-editable, exempt from the 50% cap, and draws from the pool.

---

## Phase 8: Polish & cross-cutting — verify + docs (before hand-off)

- [ ] T029 Run `npx tsc --noEmit` and `npm run build`; fix any type/build fallout from the rate-card and commit-shape changes
- [ ] T030 Re-run the throwaway-Postgres check end-to-end (seed + a simulated commit writing `MedicalCoveredPerson` rows) per quickstart §2–3
- [ ] T031 [P] Update steering docs in the same commit: `PROJECT_DETAILS.md` (medical pricing), `IMPLEMENTATION_PROGRESS.md` (spec 023 built), `IMPLEMENTATION_PLAN.md` decisions log, `CLAUDE.md` medical-rule note; set spec 023 Status to Implemented
- [ ] T032 [P] Confirm `ui-versions/` snapshots exist for every touched UI file (EmployeeForm, AdminBenefitsPage, BenefitsBoard) and the `prisma/sql/0NN_*.sql` hand-off note tells HR which file to paste into Neon and after which number

---

## Dependencies & MVP

- **Phase 1 → Phase 2 → (US1 ‖ US3) → US2 → US4 → US5 → Polish.** US1 (admin card) is independent of US3/US2 and can run in parallel with US3.
- **US2 depends on US3** (covered-dependant selection) and Phase 2 (`rates.ts`).
- **MVP** = Phase 1 + Phase 2 + US1 + US3 + US2 (a working age-banded premium end-to-end). US4/US5 preserve proration and enforcement.

## Parallel opportunities

- Phase 1 model edits (T001–T004) are one file (`schema.prisma`) → sequential; T010 [P] vs T011 are different files.
- US1 (admin) and US3 (employee form/DOB) touch different files → parallelizable after Phase 2.
- Polish T031/T032 [P] are docs/snapshots → parallel.

## Independent test criteria

- **US1**: edit a band on Amounts → persists → shows in an employee preview.
- **US2**: known DOBs → committed premium = whole-EGP sum; remove a person → premium drops by that person's figure.
- **US3**: mark a dependant Spouse in the form → appears selectable in medical; commit blocked when a required DOB is missing.
- **US4**: mid-cycle joiner → premium = annual × months ÷ 12 (rounded).
- **US5**: committed election is locked (HR-only), excluded from the 50% cap, draws from the pool.
