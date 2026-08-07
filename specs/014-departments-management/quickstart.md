# Quickstart / Validation: HR-Managed Departments

How to prove the feature end-to-end. Uses a throwaway local Postgres for the migration + cascade/guard
proof (per the house rule for schema/data changes), plus the standard type/build gates.

## Gates
```bash
npx tsc --noEmit
npm run build
```

## Migration proof (throwaway local Postgres)
1. Start a local Postgres 16 (initdb/pg_ctl under `/usr/lib/postgresql/*/bin`, socket in `/tmp`).
2. Apply the current schema + `prisma/sql/022_departments.sql`.
3. Assert:
   - `Department` table exists with the **five** seeded rows in order.
   - Re-applying `022` is a no-op (idempotent — `IF NOT EXISTS` + `ON CONFLICT DO NOTHING`).

## Behavior proof (against the throwaway DB)
Seed a couple of employees with departments, then exercise the actions and assert:

- **Add**: `addDepartment("People & Culture")` → row present; case-insensitive duplicate
  (`"people & culture"`) rejected; empty/whitespace rejected.
- **Rename cascade (SC-002)**: with ≥1 employee in "Data Management Unit",
  `renameDepartment(id, "Data & Analytics")` → the `Department` row is renamed **and** every such
  employee now reads "Data & Analytics"; **zero** employees left on the old name. Renaming to an
  existing other name is rejected.
- **Remove guard (SC-003)**: `removeDepartment` on a department with employees → blocked, error names
  the count. On an empty department → deleted.
- **Trim / case-only rename**: `"  Finance "` saves as `"Finance"`; `"top management"` → `"Top Management"`
  is accepted as a rename of the same row (not a duplicate) and cascades.

## Single-source proof (SC-005)
After adding "People & Culture" via the admin screen, confirm it appears in:
- the employee **create** form dropdown,
- the employee **edit** form dropdown,
- the employee **grid** department filter,
- the **directory** department filter.

And confirm a display-only surface stays correct after a rename: an employee shown in the **directory
table** and the **benefits-release** department column reflects the new name (because the cascade
updated their stored label).

## Access proof (FR-006)
- Signed in as an `EMPLOYEE`, `/admin/departments` redirects to `/dashboard`; the server actions deny.
- Signed in as `HR_ADMIN` or `SUPER_USER`, the screen loads and the actions succeed.

## Expected outcome
All gates green; migration idempotent; cascade leaves zero stale labels; in-use remove blocked;
managed list drives every department choice/filter; day-one list = the five existing departments.
