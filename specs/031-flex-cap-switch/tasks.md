# Tasks: Per-Cycle 50% Cap Switch

**Gate closed** — mockup approved 2026-08-16 (revised to show both toggle directions).

## Phase 1: Foundational

- [x] T001 `flexCapEnabled` + `flexCapChangedById` + `flexCapChangedAt` on `PlanYear` in `prisma/schema.prisma`
- [x] T002 `prisma/sql/050_flex_cap_switch.sql` — additive, idempotent, defaults to **on** so every existing cycle keeps today's behaviour

## Phase 2: US1 — HR disables the cap on a short cycle (P1)

- [x] T003 [US1] `flexCap(ceiling, capEnabled)` in `src/lib/benefits/rules.ts` — returns the full ceiling when off, never `Infinity` (research R1)
- [x] T004 [US1] `AllowanceContext.flexCapEnabled`, read from the claim's own plan year in `src/app/(app)/benefits/claim-actions.ts`
- [x] T005 [US1] Same setting at the manual-release call site (`admin/benefits/manual-actions.ts`, research R4)
- [x] T006 [US1] `setFlexCapEnabled` server action — `requireAdmin`, refuses a non-open plan year, stamps actor + time
- [x] T007 [US1] Mockup: the admin control and the employee notice → **approval gate**
- [x] T008 [US1] The control on the admin plan-year surface, showing who last changed it
- [x] T009 [US1] `ui-versions/` snapshot before T008

## Phase 3: US2 — Employees see the rule that applies (P1)

- [x] T010 [US2] Benefits page passes the setting through and states plainly when the limit is off
- [x] T011 [US2] Client claim preview mirrors the setting, so the previewed figure equals what the server pays
- [x] T012 [US2] `ui-versions/` snapshot before T010/T011

## Phase 4: Verify & polish

- [x] T013 Pure checks: cap off raises the per-benefit ceiling to the pool; the ceiling still binds; a fixed allowance stays bounded by its band amount; medical unchanged in both settings
- [x] T014 DB checks: the setting is per plan year and independent; a non-open year refuses the change; the actor and time are stamped; **re-enabling changes no existing claim** and leaves a past-cap benefit at zero, never negative
- [x] T015 Chromium pass: HR disables it, an employee claims past 50% on one benefit, HR re-enables it, the earlier claim is untouched and further claims on that benefit are refused
- [x] T016 `tsc` + `build`; docs; tell the user to paste `050` (guard query first)

## Verified

- `npx tsc --noEmit` and `npm run build` clean.
- `050` applied to a **fresh** throwaway Postgres through `scripts/apply-sql.mjs`, then
  `prisma migrate diff` against the schema reported no drift.
- `scripts/verify-flex-cap-switch.mts` — 36/36, importing the shipped `flexCap`/`evaluateClaim`
  rather than a copy: the cap off raises the per-benefit ceiling to the pool (never `Infinity`),
  the ceiling still binds, a fixed allowance pays the same either way, medical is untouched, and a
  benefit past a re-enabled cap has **zero** remaining, never negative.
- Chromium round trip on a five-month cycle (30,000 → 12,500): HR turns the limit off, the employee
  sees "None this cycle" with the reason, claims **9,000** on one benefit through the real action
  (above the 6,250 cap it would have had), HR turns the limit back on, and the 9,000 stands
  unchanged with the cap row restored. 0 console errors.

### Environment note

Gym is a `PROOF` benefit and Vercel Blob has no credentials in a throwaway environment, so the
upload step would refuse the claim before the rule ran. The browser fixture flipped that one item
to `NOTE` **in the throwaway DB only** so the pass exercised the rule path; nothing in the product
changed.

## Deferred

- **Extending a cycle's dates** to restore the full ceiling — re-prorates every ceiling and requires
  recomputing the spec-027 medical cycle charges, including ones already applied. Its own spec; the
  arithmetic that makes re-enabling safe after an extension is recorded in the spec's Assumptions.
