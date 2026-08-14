# Contract: Business Unit Administration & Assignment

## A. Manage business units + brands (Super User only)

Surface: `/admin/business-units` (`requireSuperUser`). Server actions in
`src/app/(app)/admin/business-units/actions.ts`. Mirrors the Departments admin plus per-unit brand
editing (reusing `BrandColorField` and the existing logo-upload flow).

| Action | Input | Rules | Result |
|--------|-------|-------|--------|
| Add unit | name | trim; reject empty; reject case-insensitive duplicate | new unit, colors default navy/gold, no logo |
| Edit brand | unitId, companyName, shortName, primaryColor, accentColor, logo?/removeLogo? | both colors valid hex `^#[0-9a-fA-F]{6}$`; name/shortName non-empty; logo ≤ 2MB image | unit brand updated; members re-themed next load |
| Rename | unitId, name | same dedupe rule as Add | unit renamed (FK unaffected; it's by id) |
| Remove | unitId | **blocked while any `User.businessUnitId` references it** — clear message | unit deleted only when unused |

Guards: every action re-checks `requireSuperUser` server-side. HR Admin is denied (brand governance is
Super-User, like the Brand screen).

## B. Assign an employee to a business unit (HR)

Three input paths, all mirroring how `department` is handled today:

1. **Create/Edit form** (`/admin/employees/new`, `/admin/employees/[id]`): a single-select of managed
   business units (plus "— none —"). Persisted via the existing employee create/update action.
2. **Registry grid** (`EmployeeGrid`): an inline select column "Business Unit", saved via
   `updateEmployeeField` under the same governance as other fields (HR-only, no self-restrictions
   relevant here).
3. **CSV import/export**: a "Business Unit" column. Export includes each employee's unit name; import
   matches by name (trimmed, case-insensitive), assigns the FK, and **flags an unknown name in the
   per-row report** (does not drop the row) — identical to department's tolerant handling. Role,
   status, and salary remain excluded from CSV.

Invariants: assignment is HR-managed (never employee-self-set); a null/blank value clears the unit
(→ default brand); changing the unit re-themes the employee on next load (FR-009). No effect on any
benefits figure or permission.

## C. Admin home

Add a Super-User-only **"Business Units"** card on `/admin` linking to `/admin/business-units`
(alongside Brand / Modules / Notifications).
