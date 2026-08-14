# Tasks: Multi-Brand by Business Unit

**Input**: Design documents from `specs/024-multi-brand-business-units/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: No automated test suite requested — verification is `tsc` + `build` + throwaway-Postgres
checks + the quickstart click-throughs (constitution §3a / §V). Test tasks are therefore not generated.

**Organization**: Grouped by user story. US1 is the MVP (the theming payoff); US2/US3 add the
management + assignment UI; US4 is the impersonation enhancement.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different file, no incomplete dependency)
- Story label on user-story tasks only

---

## Phase 1: Setup

- [X] T001 Build navy/gold static HTML mockups for the two new UI surfaces — (a) the Business Units admin (`/admin/business-units`) and (b) the employee-form + registry-grid Business Unit field — save under `design-mockups/business-units/2026-08-14_*.html`, publish as Artifacts, and get explicit user sign-off. **Blocks every UI task (T010–T016).** (Constitution II — MOCKUP-FIRST.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + data + the shared business-units library that all stories build on. No user story can be verified until this is done.

- [X] T002 Add `model BusinessUnit` (id, name @unique, shortName, logoUrl?, primaryColor @default "#0f2444", accentColor @default "#c9a227", order, timestamps) and `User.businessUnitId String?` FK + relation + `@@index([businessUnitId])` to `prisma/schema.prisma`; run `npx prisma generate`.
- [X] T003 Create `prisma/sql/0NN_business_units.sql` (idempotent): create the `BusinessUnit` table, add the nullable `businessUnitId` FK column on `User` (`ON DELETE SET NULL`), seed the three units (Forefront Consulting / Visual Shift Consulting / Omnisight Analytics, navy/gold colors, no logo, no employee auto-assignment). Apply to a throwaway Postgres 16 with the full schema DDL and verify: units exist, a `User.businessUnitId` assignment persists + reads back, re-run is idempotent. (Commit the SQL in the same commit as T002 — Constitution IV.)
- [X] T004 [P] Create `src/lib/business-units.ts`: `getBusinessUnits()` (ordered list of {id,name,shortName,...}), `getBusinessUnitsWithUsage()` (grouped member counts, one extra query), `normalizeBuName()`/`sameBuName()` (trim + case-insensitive dedupe), and a `getBusinessUnitBrand(id)` helper returning the unit's brand attributes. Null-safe/try-catch for an un-migrated DB.

---

## Phase 3: User Story 1 — Employee sees their own company's brand (Priority: P1) 🎯 MVP

**Goal**: The app's theme, name, logo, and title follow the effective user's business unit; fall back to today's default when unset.
**Independent test**: Seed a BU with distinct colors + assign a test employee (direct SQL if US2/US3 not built yet); sign in as them → their brand shows; sign in as a no-BU user → today's default shows, unbroken.

- [X] T005 [US1] Make `getBrand()` in `src/lib/brand.ts` viewer-aware: resolve the effective user (session via `auth()`, honoring the impersonation cookie with the same Super-User/non-Super-target guard as `requireUser`); if the effective user has a `businessUnitId`, return that unit's brand **per-attribute merged** over the `BrandSettings` default (per `contracts/brand-resolution.md`); else the default. Keep it request-cached; try/catch → default on any error or no session.
- [X] T006 [US1] Confirm `src/app/layout.tsx` themes from the effective brand: `generateMetadata`, `generateViewport`, and the injected `brandThemeCss(<style>)` all read the updated `getBrand()` — verify no pre-auth crash on `/signin` (no session → default). Adjust only if a call bypasses `getBrand()`.
- [X] T007 [US1] Confirm `src/app/(app)/layout.tsx` passes the effective brand's `companyName`/`shortName`/`logoUrl` to `AppShell` (it already calls `getBrand()` — verify the source now flows through the effective resolution; no component redesign).
- [X] T008 [US1] Manual end-to-end verification: assigned employee sees their unit's colors/name/logo/title across pages; no-BU user + fresh/un-migrated DB see byte-for-byte today's default (SC-001, SC-003).

**Checkpoint**: With a BU + assignment present, the per-company look works. This alone is a demoable MVP.

---

## Phase 4: User Story 2 — Super User manages business units + brands (Priority: P1)

**Goal**: A Super User can add / edit-brand / rename / remove (blocked while in use) business units.
**Independent test**: create a unit, set its colors/logo/name, confirm dedupe + delete-blocked-while-assigned + HR-Admin denied.

- [X] T009 [US2] Create `src/app/(app)/admin/business-units/actions.ts`: `addBusinessUnit`, `updateBusinessUnitBrand` (name, shortName, primaryColor, accentColor with `^#[0-9a-fA-F]{6}$`, logo upload/removeLogo via existing Vercel Blob `put`), `renameBusinessUnit`, `removeBusinessUnit` (blocked while any `User.businessUnitId` references it). Every action `requireSuperUser`; case-insensitive dedupe; `revalidatePath("/", "layout")` so brands re-apply.
- [X] T010 [US2] Create `src/components/admin/BusinessUnitsManager.tsx` (client): list units with per-unit brand editor reusing `BrandColorField` (primary + accent), name/shortName inputs, logo upload/remove, add-unit row, and remove with in-use guard messaging. Mirror the Departments admin interaction.
- [X] T011 [US2] Create `src/app/(app)/admin/business-units/page.tsx` (`requireSuperUser`, `force-dynamic`): `BackLink`, heading, render `BusinessUnitsManager` with `getBusinessUnitsWithUsage()`; surface `?saved`/`?error`.
- [X] T012 [US2] Add a Super-User-only **"Business Units"** card to `src/app/(app)/admin/page.tsx` (snapshot to `ui-versions/admin-home/` first).

**Checkpoint**: Brands are fully manageable in-app.

---

## Phase 5: User Story 3 — HR assigns an employee to a business unit (Priority: P1)

**Goal**: Set an employee's business unit via form, grid, and CSV — mirroring department.
**Independent test**: assign via form; change via grid; export→edit→re-import round-trips; unknown name flagged not dropped.

- [X] T013 [US3] Employee create/edit form: add a "Business Unit" single-select (managed list from `getBusinessUnits()`, plus "— none —") to the shared employee form + `src/app/(app)/admin/employees/new/page.tsx` and `[id]/page.tsx`; persist `businessUnitId` in the create/update employee action. Snapshot edited UI files to `ui-versions/` first.
- [X] T014 [US3] Registry grid: add an inline "Business Unit" enum-style column to `src/components/admin/EmployeeGrid.tsx` (options from managed units) and handle it in `updateEmployeeField` (`src/app/(app)/admin/employees/actions.ts`) under existing HR governance. Snapshot `EmployeeGrid.tsx` first; add the column to the default/persisted column config.
- [X] T015 [P] [US3] CSV export: add a "Business Unit" column (unit name) to `src/app/api/admin/employees/export/route.ts`.
- [X] T016 [US3] CSV import: parse a "Business Unit" column in `src/app/(app)/admin/employees/import/actions.ts`, match by trimmed case-insensitive name → set FK, and **flag an unknown name in the per-row report** (do not drop). Keep role/status/salary excluded.
- [X] T017 [US3] Manual verification: assignment persists across all three paths; changing a unit re-themes the employee on next load (SC-006).

**Checkpoint**: End-to-end — a Super User themes a unit, HR assigns employees, employees see their brand.

---

## Phase 6: User Story 4 — Impersonation shows the target's brand (Priority: P2)

**Goal**: Viewing as an employee also shows that employee's business-unit brand.
**Independent test**: impersonate employees across the three units; each shows its brand + banner; exit restores the actor's brand.

- [X] T018 [US4] Verify the effective-user path in `getBrand()` (T005) resolves the impersonation target's `businessUnitId`, so "View as" themes to the target while the banner stays; exit restores the actor's brand (SC-005). Add a fix only if the impersonation cookie isn't reflected in resolution.

---

## Phase 7: Polish & Cross-Cutting

- [X] T019 [P] Update docs in the same commit as the code: `PROJECT_DETAILS.md` (BusinessUnit + effective-brand model), `IMPLEMENTATION_PROGRESS.md` (feature built), `IMPLEMENTATION_PLAN.md` (decisions log: multi-brand interim toward 022), `CLAUDE.md` (if a new pattern), and set `specs/024-multi-brand-business-units/spec.md` status to Implemented.
- [X] T020 Run `npx tsc --noEmit` and `npm run build`; resolve all errors.
- [X] T021 Final throwaway-Postgres verification of `0NN_business_units.sql` + a `businessUnitId` assignment; confirm no benefits figure, money rule, or permission changed (OOS-002, FR-007).

---

## Dependencies & Execution Order

- **Phase 1 (T001 mockups)** gates all UI tasks (T010, T011, T012, T013, T014).
- **Phase 2 (T002→T003, T004)** blocks everything. T002 before T003 (schema before SQL); T004 [P] alongside.
- **US1 (T005–T008)** depends only on Phase 2 → this is the MVP and can ship/demoed first (with a hand-seeded assignment).
- **US2 (T009–T012)** depends on Phase 2 + T001; independent of US1/US3.
- **US3 (T013–T017)** depends on Phase 2 + T001; independent of US1/US2.
- **US4 (T018)** depends on T005.
- **Polish (T019–T021)** last.

## Parallel Opportunities

- T004 [P] runs alongside T002/T003.
- Once Phase 2 + T001 are done, **US1, US2, and US3 can proceed in parallel** (different files): e.g. one stream on `getBrand()`/layouts (US1), one on `admin/business-units/*` (US2), one on employee form/grid/CSV (US3).
- Within US3, T015 [P] (export) is independent of T013/T014/T016.
- T019 [P] (docs) can be drafted alongside implementation, finalized at commit.

## Implementation Strategy

- **MVP = Phase 2 + US1**: the effective-brand resolution + a seeded unit + one hand-assigned employee proves the whole idea and is demoable.
- **Increment 2 = US2 + US3**: make it operable by HR/Super User without SQL.
- **Increment 3 = US4 + Polish**: impersonation theming, docs, final verification.
- Honor the MOCKUP-FIRST gate (T001) before any UI; snapshot every edited UI file to `ui-versions/`.

## Summary

- **Total tasks**: 21 (T001–T021)
- **Per story**: Setup 1 · Foundational 3 · US1 4 · US2 4 · US3 5 · US4 1 · Polish 3
- **MVP**: US1 (T005–T008) on top of Foundational
- **Parallel**: US1/US2/US3 streams after Foundational + mockups; T004, T015, T019 marked [P]
