# Tasks: HR-Managed Departments

**Feature**: 014-departments-management | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Tests are not requested for this feature (no TDD); validation is via `tsc` + `build` + a throwaway
Postgres proof, per [quickstart.md](./quickstart.md). Paths are repo-relative.

## Phase 1: Setup & Foundational (blocking prerequisites)

- [ ] T001 Add `model Department` (id, name @unique, order, createdAt) to `prisma/schema.prisma` per data-model.md.
- [ ] T002 Create `prisma/sql/022_departments.sql` — idempotent `CREATE TABLE IF NOT EXISTS "Department"` + seed the five current departments (with order 1..5) via `INSERT ... ON CONFLICT DO NOTHING`, wrapped in BEGIN/COMMIT (mirror `017_brand_settings.sql`).
- [ ] T003 Create `src/lib/departments.ts` — `getDepartments()` (ordered by order, then name) and normalization helpers (`normalizeDeptName` = trim; case-insensitive compare). Keep `DEPARTMENTS` in `src/lib/labels.ts` only as the seed reference.

## Phase 2: US1 — Add a department (P1)

**Goal**: HR/Super User adds a department from a new Admin screen; it becomes selectable everywhere.
**Independent test**: Add "People & Culture" → appears in the employee edit form dropdown.

- [ ] T004 [US1] Create `src/app/(app)/admin/departments/actions.ts` with `addDepartment(name)` — `requireAdmin()`, trim, reject empty + case-insensitive duplicate, insert `order = max+1`, revalidate. (Contract: contracts/server-actions.md.)
- [ ] T005 [US1] Create `src/components/admin/DepartmentsManager.tsx` — client component: read-first list (name column), an **Add** row/input, per-row **Edit** button that opens rename mode, and a **Remove** button. Navy/gold, mirrors the `/admin/modules` list styling. (Rename/remove wired in US2/US3.)
- [ ] T006 [US1] Create `src/app/(app)/admin/departments/page.tsx` — server component: `requireAdmin()`, load departments + per-department in-use counts, render `DepartmentsManager`, with the `← Admin` back link + uppercase eyebrow + serif H1 (mirror `admin/modules/page.tsx`).
- [ ] T007 [US1] Add a **Departments** card to the Admin index `src/app/(app)/admin/page.tsx` (HR+Super User visible), linking `/admin/departments`.

## Phase 3: US4 — Whole app reads the managed list (P1)

**Goal**: Every department choice/filter reads `getDepartments()`; display-only surfaces unchanged.
**Independent test**: A newly added department shows in the create form, edit form, grid filter, and directory filter.

- [ ] T008 [US4] Update `src/components/admin/EmployeeForm.tsx` — stop importing `DEPARTMENTS`; accept a `departments: string[]` prop and render the dropdown from it.
- [ ] T009 [US4] Update `src/app/(app)/admin/employees/new/page.tsx` and `src/app/(app)/admin/employees/[id]/page.tsx` — pass `getDepartments()` into `EmployeeForm`.
- [ ] T010 [US4] Update `src/app/(app)/admin/employees/page.tsx` — build the grid's department list from `getDepartments()` ∪ stray values already on records (replacing the `...DEPARTMENTS` union).
- [ ] T011 [US4] Update `src/app/(app)/directory/page.tsx` — feed the managed list to the directory filter (union with data values so legacy labels remain filterable).
- [ ] T012 [US4] Update the CSV import known-set — `src/lib/import/employees.ts` / `src/app/(app)/admin/employees/import/actions.ts`: use `getDepartments()` for a soft "unknown department" flag in the review report; import stays tolerant (still imports any value).

## Phase 4: US2 — Rename a department (P1)

**Goal**: Rename cascades to every employee in that department.
**Independent test**: Rename "Data Management Unit" → "Data & Analytics"; the assigned employee now reads the new name; zero left on the old.

- [ ] T013 [US2] Add `renameDepartment(id, newName)` to `src/app/(app)/admin/departments/actions.ts` — `requireAdmin()`, trim, reject empty + case-insensitive duplicate of another row (allow case/whitespace-only self-rename); transaction: update `Department.name` + `User.updateMany({ where: { department: oldName }, data: { department: newName } })`; revalidate departments + employees paths; return `{ ok, moved }`.
- [ ] T014 [US2] Wire rename mode in `src/components/admin/DepartmentsManager.tsx` — the Edit button opens an inline input; save calls `renameDepartment`; show the moved-count/result and errors.

## Phase 5: US3 — Remove a department (P2)

**Goal**: Remove only when empty; block with a clear message otherwise.
**Independent test**: Remove an empty department (gone from dropdowns); removing a non-empty one is blocked with the count.

- [ ] T015 [US3] Add `removeDepartment(id)` to `src/app/(app)/admin/departments/actions.ts` — `requireAdmin()`, count `User where department = name`; if `> 0` return blocking error with the count; else delete; revalidate.
- [ ] T016 [US3] Wire the Remove button in `src/components/admin/DepartmentsManager.tsx` — confirm, call `removeDepartment`, surface the in-use block message.

## Phase 6: Polish, verify & docs

- [ ] T017 UI snapshots: before editing existing UI files, snapshot `EmployeeForm.tsx` (and any other edited existing component) to `ui-versions/<component>/2026-08-07_departments.tsx`.
- [ ] T018 Verify: `npx tsc --noEmit` and `npm run build` both green.
- [ ] T019 DB proof on a throwaway local Postgres per quickstart.md — apply `022` (idempotent), seed employees, prove add/duplicate-reject, rename cascade (zero stale), remove-guard block/allow, trim + case-only rename.
- [ ] T020 Docs (same commit as code): update `PROJECT_DETAILS.md` (Department entity + managed list) and `IMPLEMENTATION_PROGRESS.md` (build-log entry); note migration `022` in the progress log.

## Dependencies & order

- Phase 1 (T001–T003) blocks everything.
- US1 (T004–T007) delivers the screen + add — the MVP.
- US4 (T008–T012) can proceed in parallel with US2/US3 once the list read (T003) exists; it depends only on `getDepartments()`.
- US2 (T013–T014) and US3 (T015–T016) depend on the page/component from US1.
- Polish (T017–T020) last. T017 must precede any edit of an existing UI file (do it before T008).

## Parallel opportunities

- T008–T012 (US4 read-site rewires) touch different files and can be done together after T003.
- T004/T013/T015 all edit the same `actions.ts` — keep sequential.
- T005/T014/T016 all edit `DepartmentsManager.tsx` — keep sequential.

## MVP scope

**US1 + Phase 1** (add a department from the new admin screen, seeded with today's five) is the minimum
viable slice. US4 makes it useful across the app; US2/US3 complete the add/rename/remove trio.
