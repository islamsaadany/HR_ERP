# Tasks: Per-Cycle 50% Cap Switch

**Gate open**: mockup approval before any component work (T008+).

## Phase 1: Foundational

- [ ] T001 `flexCapEnabled` + `flexCapChangedById` + `flexCapChangedAt` on `PlanYear` in `prisma/schema.prisma`
- [ ] T002 `prisma/sql/050_flex_cap_switch.sql` — additive, idempotent, defaults to **on** so every existing cycle keeps today's behaviour

## Phase 2: US1 — HR disables the cap on a short cycle (P1)

- [ ] T003 [US1] `flexCap(ceiling, capEnabled)` in `src/lib/benefits/rules.ts` — returns the full ceiling when off, never `Infinity` (research R1)
- [ ] T004 [US1] `AllowanceContext.flexCapEnabled`, read from the claim's own plan year in `src/app/(app)/benefits/claim-actions.ts`
- [ ] T005 [US1] Same setting at the manual-release call site (`admin/benefits/manual-actions.ts`, research R4)
- [ ] T006 [US1] `setFlexCapEnabled` server action — `requireAdmin`, refuses a non-open plan year, stamps actor + time
- [ ] T007 [US1] Mockup: the admin control and the employee notice → **approval gate**
- [ ] T008 [US1] The control on the admin plan-year surface, showing who last changed it
- [ ] T009 [US1] `ui-versions/` snapshot before T008

## Phase 3: US2 — Employees see the rule that applies (P1)

- [ ] T010 [US2] Benefits page passes the setting through and states plainly when the limit is off
- [ ] T011 [US2] Client claim preview mirrors the setting, so the previewed figure equals what the server pays
- [ ] T012 [US2] `ui-versions/` snapshot before T010/T011

## Phase 4: Verify & polish

- [ ] T013 Pure checks: cap off raises the per-benefit ceiling to the pool; the ceiling still binds; a fixed allowance stays bounded by its band amount; medical unchanged in both settings
- [ ] T014 DB checks: the setting is per plan year and independent; a non-open year refuses the change; the actor and time are stamped; **re-enabling changes no existing claim** and leaves a past-cap benefit at zero, never negative
- [ ] T015 Chromium pass: HR disables it, an employee claims past 50% on one benefit, HR re-enables it, the earlier claim is untouched and further claims on that benefit are refused
- [ ] T016 `tsc` + `build`; docs; tell the user to paste `050` (guard query first)

## Deferred

- **Extending a cycle's dates** to restore the full ceiling — re-prorates every ceiling and requires
  recomputing the spec-027 medical cycle charges, including ones already applied. Its own spec; the
  arithmetic that makes re-enabling safe after an extension is recorded in the spec's Assumptions.
