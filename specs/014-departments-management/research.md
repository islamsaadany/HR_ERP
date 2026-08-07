# Research: HR-Managed Departments

All feature decisions were pre-confirmed with the product owner; this records the design choices
and their rationale so `/speckit-tasks` and `/speckit-implement` have no open unknowns.

## D1 — Storage model: lookup table vs. foreign key

- **Decision**: A `Department` **lookup table** holding the valid names; `User.department` stays a **text label**.
- **Rationale**: Option A, explicitly chosen. Keeps the change small and reversible, avoids a risky
  data migration of every employee record onto a foreign key, and matches the "engineered enough"
  principle for a list of ~5–15 values.
- **Alternatives considered**: `User.departmentId → Department.id` (rejected now — bigger migration,
  backfill, and touches every read; deferred as a possible future upgrade). Keeping the hard-coded
  constant (rejected — the whole point is HR self-service without redeploy).

## D2 — Rename semantics

- **Decision**: Renaming a department updates the `Department` row **and** every `User` whose
  `department` equals the old name, in one server action (a transaction).
- **Rationale**: With a text label, the employee's stored value is the source for display; a rename
  must cascade or records drift from the list (SC-002 requires zero employees left on the old name).
- **Alternatives**: Rename the row only and reconcile lazily (rejected — leaves stale labels and
  breaks filters until every employee is re-saved).

## D3 — Remove guard

- **Decision**: Removal is allowed only when **no** `User.department` equals that name; otherwise the
  action returns a blocking error naming the count to move.
- **Rationale**: Prevents orphaning employee records (SC-003). Simple, safe, matches the spec.
- **Alternatives**: Cascade-clear employees' department on remove (rejected — silent data loss);
  soft-delete/hide (rejected — over-engineered for a lookup value).

## D4 — Uniqueness & normalization

- **Decision**: Names are **trimmed** before save; duplicate detection is **case-insensitive**. A
  rename that only changes case/whitespace of the same row is allowed (not a self-duplicate).
- **Rationale**: Avoids "Finance" vs "finance " splitting one department into two; FR-007.
- **Implementation note**: Enforce in the server action (normalize + case-insensitive existence check
  excluding the row being edited). A DB unique index on `name` guards exact duplicates; case-insensitive
  uniqueness is enforced in code (no need for a `citext` extension on Neon).

## D5 — Which surfaces read the managed list

- **Decision**: Rewire only the surfaces that offer **choices or filters**:
  employee create/edit **form dropdown**, employee **grid filter**, **directory filter**, and the CSV
  **import known-set** (for a soft "unknown department" warning; import stays tolerant and still
  imports any value). **Display-only** surfaces — directory table cells, the benefits-release
  department **column**, grid cells — are left as-is; they render the employee's stored string, which
  the rename cascade keeps correct.
- **Rationale**: Single source of truth for choices (FR-005/SC-005) without needless churn on
  read-only displays. The benefits-release "column picker" chooses *which columns show*; the
  department column's value is the stored label, so it needs no managed-list wiring.
- **Alternatives**: Feed the managed list everywhere including display (rejected — unnecessary; the
  cascade already guarantees consistency and it adds coupling).

## D6 — Access control

- **Decision**: `requireAdmin()` (HR Admin + Super User) on the page and every server action.
- **Rationale**: Matches the confirmed access decision and mirrors the other admin config screens.

## D7 — Migration delivery

- **Decision**: `prisma/sql/022_departments.sql` — `CREATE TABLE IF NOT EXISTS "Department"` + seed the
  five current names (`ON CONFLICT DO NOTHING`), idempotent, wrapped in `BEGIN/COMMIT`. Applied by the
  existing deploy-time runner (`scripts/apply-sql.mjs`); no manual Neon paste required, though the user
  can also run it by hand.
- **Rationale**: Follows the established migration pattern (e.g. `017_brand_settings.sql`); the runner
  tracks applied files in `_sql_migrations`.
