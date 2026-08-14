# Quickstart / Validation: Multi-Brand by Business Unit

Runnable checks that prove the feature end-to-end. Assumes the migration
`prisma/sql/0NN_business_units.sql` has been applied (locally or on Neon) and the app is running.

## Prerequisites

- `npx tsc --noEmit` and `npm run build` pass.
- Migration applied; the three units exist: Forefront Consulting, Visual Shift Consulting,
  Omnisight Analytics (verify: `SELECT name FROM "BusinessUnit" ORDER BY "order";`).
- A Super User account; at least two employee accounts (e.g. the demo persona Ahmed Ali + one more).

## Scenario 1 — Per-BU look & feel (US1, US2, US3)

1. As Super User → **Admin → Business Units** → give *Visual Shift Consulting* a distinct primary
   color (paste a hex) and *Omnisight Analytics* another. Save each.
2. **Admin → Employees** → assign Ahmed Ali to *Visual Shift Consulting*; assign the other employee to
   *Omnisight Analytics*.
3. Sign in as each employee (or impersonate — Scenario 3): confirm the sidebar name, page `<title>`,
   and theme colors match that employee's unit, and neither sees the other's brand.
- **Expected**: each employee sees only their unit's brand; a user with no unit still sees today's
  default. (SC-001, SC-003.)

## Scenario 2 — Admin function unchanged (US2, FR-007)

1. As an HR Admin whose own unit is themed, open **Admin → Employees**.
- **Expected**: you still see and can edit **every** employee across all units (no filtering), salary
  gating unchanged; only your own screen's colors/name follow your unit. (SC-004.)

## Scenario 3 — Impersonation shows the target's brand (US4, FR-008)

1. As Super User → **Admin → View as Employee** → view as Ahmed (Visual Shift).
- **Expected**: the app shows Visual Shift's brand with the impersonation banner; **Exit** restores
  your own brand. Repeat for an Omnisight employee. (SC-005.)

## Scenario 4 — Management guards (US2)

1. Try to remove a unit that has employees assigned → **blocked** with a clear reason.
2. Try to add a unit whose name duplicates an existing one (any case) → **rejected**.
3. As HR Admin (not Super User), open `/admin/business-units` → **denied**.

## Scenario 5 — CSV round-trip (US3, FR-004)

1. **Admin → Employees → Export CSV**; confirm a "Business Unit" column with each employee's unit.
2. Edit the column (including one unknown name), **re-import**.
- **Expected**: valid names update the assignment; the unknown name is **flagged in the report**, not
  silently dropped; re-theming follows on next load. (SC-006.)

## Data-layer verification (constitution §3a)

On a throwaway Postgres: apply the schema DDL + `0NN_business_units.sql`, then confirm the three units
exist, a `User.businessUnitId` assignment persists and reads back, and deleting a referenced unit is
prevented by the app guard (the FK itself is `SetNull` as a safety net). No benefits table or figure
is touched.
