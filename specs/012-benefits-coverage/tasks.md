# Tasks: Benefits — Company Coverage Rates

**Feature**: 012-benefits-coverage | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Validation: `tsc` + `build` + `scripts/verify-coverage.mts` on a throwaway Postgres (per quickstart.md).
UI approved via the coverage mockup (2026-08-07).

## Phase 1: Data + shared math (blocking)

- [x] T001 Schema: add `BenefitCatalogItem.coverageRate Int @default(100)` and `SelectionLine.cost Int @default(0)` to `prisma/schema.prisma`.
- [x] T002 Migration `prisma/sql/023_benefits_coverage.sql` (idempotent): add `coverageRate` (default 100) + set 80% keys (gym, sports, schooling, childcare, caregiver, learning) and 50% keys (mobile, homeoffice); add `SelectionLine.cost` + backfill `cost = amount`.
- [x] T003 `src/lib/benefits/coverage.ts`: pure `coveredAmount(cost, rate)` and `outOfPocket(cost, rate)` (integer covered; medical cost=covered). Shared by client + server.

## Phase 2: Server rules (US2 — money math)

- [x] T004 [US2] `src/lib/benefits/rules.ts`: `MAX_SELECT_FULL_TIME = 5`, `MAX_SELECT_PART_TIME = 3`. `evaluateBasket` lines carry `{ key, name, cost, coverageRate }`; compute covered per line via coverage.ts; pool total = Σ covered + medical; over-pool + FT 50% cap run on covered; keep medical/step behavior. Expose per-line covered/out-of-pocket in the result for the client.
- [x] T005 [US2] `src/app/(app)/benefits/actions.ts` (`saveBasket`): payload items = `{ key, cost }`; look up `coverageRate`; store `SelectionLine { cost, amount: covered }`; evaluate on covered; claimed-lock compares claimed vs covered `amount` (unchanged mechanism). Medical line unchanged (cost=amount=premium).

## Phase 3: Selector UI (US1 — see cost/company/your share) — snapshot first

- [x] T006 Snapshot `BenefitsSelector.tsx` → `ui-versions/BenefitsSelector/2026-08-07_before-coverage.tsx`.
- [x] T007 [US1] `src/components/benefits/BenefitsSelector.tsx`: the stepper edits **cost**; render per selected benefit the `Cost · Company pays (r%) · You pay` line (per the approved mockup); coverage badge per benefit (`r% covered`, medical keeps `50% exempt`); meter/labels track the **company share** ("company share of … pool"); "Selected" panel shows company share as headline + cost/you-pay subtext. Uses coverage.ts for the client mirror. Wire to the new payload shape.
- [x] T008 [US1] `src/app/(app)/benefits/page.tsx`: pass each catalog item's `coverageRate` and existing line `cost` into the selector; ensure initial values are costs (not covered).

## Phase 4: Claims wording (US4 — reimburse covered portion)

- [x] T009 [US4] `src/components/benefits/BenefitClaims.tsx`: wording clarifies claims reimburse the **covered portion** (proof shows full spend). Figures already in covered terms (allocation = covered `amount`); confirm the cap uses the covered allocation.

## Phase 5: Admin coverage-rate editing (US3 — existing Configuration tab)

- [x] T010 [US3] `src/app/(app)/admin/benefits/config-actions.ts` + the Configuration catalog editor in `page.tsx`: add a `coverageRate` field per catalog item (0–100, clamped), server-authoritative; save alongside name/category/order.

## Phase 6: Policy + docs + verify

- [x] T011 `src/app/(app)/benefits/policy/page.tsx`: explain coverage in words (rates by benefit; covered vs out-of-pocket; claims reimburse covered).
- [x] T012 Verify: `npx tsc --noEmit` + `npm run build`; `scripts/verify-coverage.mts` on a throwaway Postgres (US1/US2/US4 scenarios + DC-2 + migration idempotent/backfill).
- [x] T013 Docs (same commit): update `PROJECT_DETAILS.md §5` (coverage model) + `IMPLEMENTATION_PROGRESS.md` (build log, spec 012 → implemented, migration 023); annotate spec 007's superseded FRs (max-4→5, PT max-2→3, pool-draw→covered). Update `IMPLEMENTATION_PLAN.md` decisions log.

## Dependencies
- T001–T003 block all. T004→T005 (same rules→action). T006 before T007. T007 needs T003/T004. Verify (T012) last before docs/commit.

## MVP
US2 (correct covered money math server-side) + US1 (selector shows it) is the core; US3 (HR edits rates) and US4 (claims wording) complete it.
