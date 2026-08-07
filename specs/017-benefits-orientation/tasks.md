# Tasks: Benefits Orientation Tour

**Feature**: 017-benefits-orientation | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Validation: `tsc` + `build` + throwaway Postgres (migration + seen-flag action). **UI mockup approval gate first.**

## Phase 1: Approve the layout
- [x] T001 Build a navy/gold mockup of the stepped orientation (~4 personalized steps) and get approval.

## Phase 2: Data + action
- [x] T002 Schema: add `User.benefitsOrientationSeenAt DateTime?` to `prisma/schema.prisma`.
- [x] T003 Migration `prisma/sql/024_benefits_orientation.sql` — `ADD COLUMN IF NOT EXISTS` (idempotent, runner-applied).
- [x] T004 Add `markOrientationSeen()` to `src/app/(app)/benefits/actions.ts` — `requireUser()`, set the flag if null, revalidate.

## Phase 3: Component + wiring (US1–US4)
- [x] T005 [US1][US2] Create `src/components/benefits/BenefitsOrientation.tsx` — client stepped-cards overlay: ~4 steps (pool · guaranteed · flexible basket · rules), Back/Next, Skip/Finish, dots; personalized props; last step links to `/benefits/policy`; calls `markOrientationSeen()` on close when auto-opened; graceful when figures missing.
- [x] T006 [US1][US3] Wire into `src/app/(app)/benefits/page.tsx`: snapshot first; compute `hasSubmitted`, `seen`, `selectorAvailable`, `autoOpen`; build personalized props (type/band/ceiling/maxSelect/guaranteed amounts/categories); render `BenefitsOrientation` + a **"How it works"** button in the header.

## Phase 4: Verify & docs
- [x] T007 `tsc` + `build` green.
- [x] T008 Throwaway Postgres: migration 024 idempotent; `markOrientationSeen` sets the flag once (no-op when already set).
- [x] T009 Docs: `PROJECT_DETAILS.md` (orientation), `IMPLEMENTATION_PROGRESS.md` (build log + spec 017 row, migration 024), `IMPLEMENTATION_PLAN.md` decisions log (orientation built).

## Dependencies
- T001 gate. T002/T003 before T004. T005 before T006. Verify/docs last.
