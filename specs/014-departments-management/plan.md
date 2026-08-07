# Implementation Plan: HR-Managed Departments

**Branch**: `claude/hr-erp-benefits-coverage-rates-hnaox1` (working branch) | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-departments-management/spec.md`

## Summary

Replace the hard-coded `DEPARTMENTS` constant with a **managed `Department` lookup table** that HR
Admin / Super User maintain from a new **Admin → Departments** screen (add / rename / remove). The
employee's `department` stays a **text label** (Option A); renaming a department **cascades** to
`User.department` for every matching employee in one server operation; removal is **blocked while any
employee is assigned**. Every place that offers department **choices or filters** reads the managed
list; display-only surfaces keep reading the employee's stored string (which the cascade keeps
correct). Seed the table with today's five departments so day-one behavior is identical.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router) + React 19
**Primary Dependencies**: Prisma (PostgreSQL/Neon), NextAuth v5, Tailwind CSS
**Storage**: PostgreSQL — new `Department` table (lookup); `User.department` stays `text`
**Testing**: `npx tsc --noEmit` + `npm run build`; throwaway local Postgres for the migration + cascade/guard proof
**Target Platform**: Vercel (server components + server actions)
**Project Type**: Web application (single Next.js app)
**Performance Goals**: N/A — a handful of departments, low-contention admin edits
**Constraints**: Server-authoritative access control (HR Admin + Super User); migration reaches Neon via a numbered `prisma/sql/` file applied by the deploy-time runner
**Scale/Scope**: ~5–15 departments; one new admin screen; ~5 read-sites rewired to the managed list

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Align Before Building** — ✅ All decisions pre-confirmed with the product owner (Option A, HR+Super User, cascade rename, remove-when-empty, seed five). No assumptions introduced.
- **II. UI Changes Require Explicit Approval** — ⚠️ One **new** admin screen (`/admin/departments`) and one **new** admin index card. Both follow the existing navy/gold admin patterns (mirrors `/admin/modules` layout — the `← Admin` back link, uppercase eyebrow, serif H1, bordered list). No existing screen is restyled. Snapshot any edited existing UI file to `ui-versions/` before touching it. New files need no snapshot.
- **III. Benefits Money & Rules Server-Authoritative** — ✅ Not a benefits-money change. (This does not touch pool/cap/rate logic.)
- **IV. Spec-Driven & Docs Move With Code** — ✅ Spec authored first; `PROJECT_DETAILS.md` + `IMPLEMENTATION_PROGRESS.md` updated in the implementing commit; `prisma/sql/022_*.sql` regenerated in the same commit as the schema change.
- **V. Engineered Enough** — ✅ Edge cases handled (empty/whitespace, case-insensitive dupes, trim, stray legacy values, remove-guard). `getDepartments()` centralizes the read (kills the duplicated constant). `tsc` + `build` gate before handover.

**Result: PASS** (no violations; the one UI addition is net-new and follows the established admin pattern).

## Project Structure

### Documentation (this feature)

```text
specs/014-departments-management/
├── spec.md              # done
├── plan.md              # this file
├── research.md          # Phase 0 — decisions/rationale
├── data-model.md        # Phase 1 — Department entity + cascade/guard rules
├── quickstart.md        # Phase 1 — how to validate end-to-end
├── contracts/
│   └── server-actions.md # Phase 1 — the add/rename/remove server-action contracts
└── checklists/
    └── requirements.md   # spec quality (passed)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                         # + model Department
└── sql/
    └── 022_departments.sql               # NEW — create table, seed five, idempotent

src/
├── lib/
│   ├── departments.ts                    # NEW — getDepartments(); helpers (normalize/trim/compare)
│   └── labels.ts                         # DEPARTMENTS constant retained ONLY as the seed source; consumers stop importing it directly
├── app/(app)/admin/
│   ├── page.tsx                          # + "Departments" admin card
│   └── departments/
│       ├── page.tsx                      # NEW — server component: requireAdmin(); render list + editor
│       └── actions.ts                    # NEW — addDepartment / renameDepartment / removeDepartment (requireAdmin, server-authoritative)
├── components/admin/
│   ├── DepartmentsManager.tsx            # NEW — client: read-first list, add row, per-row rename/remove (Edit opens edit mode)
│   ├── EmployeeForm.tsx                  # stop importing DEPARTMENTS; accept departments as a prop
│   └── EmployeeGrid.tsx                  # already prop-driven (departments) — source becomes the managed list
├── app/(app)/admin/employees/
│   ├── page.tsx                          # departments = getDepartments() ∪ stray values (grid)
│   ├── new/page.tsx                      # pass departments to EmployeeForm
│   └── [id]/page.tsx                     # pass departments to EmployeeForm
├── app/(app)/directory/page.tsx          # feed managed list to the directory filter
└── app/(app)/admin/employees/import/…    # known-set warning uses getDepartments() (import stays tolerant)
```

**Structure Decision**: Single Next.js app (Option 2 "web application" collapsed to one project, matching the repo). One new admin route + one client manager component + one lib module + one Prisma model + one SQL migration. Existing consumers are rewired from the constant to the managed-list read; **display-only** surfaces (directory rows, benefits-release department column, grid cells) are left untouched because the cascade keeps their stored strings correct.

## Complexity Tracking

> No constitution violations — table intentionally empty.
