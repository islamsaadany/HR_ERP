# Data Model: HR-Managed Departments

## New entity: `Department` (managed lookup list)

| Field       | Type      | Notes |
|-------------|-----------|-------|
| `id`        | string (cuid) | Primary key. |
| `name`      | string    | The department name shown everywhere. **Unique** (DB index on exact value; case-insensitive uniqueness enforced in the server action). Stored **trimmed**. |
| `order`     | int       | Display/sort position on the admin screen and in dropdowns. Default 0; ties broken by name. |
| `createdAt` | datetime  | Default now(). |

No relationship to `User` (Option A). The employee's `department` remains a **`text` label** on
`User` (unchanged schema). `Department` is a lookup that governs *choices*, not a foreign key.

### Prisma sketch

```prisma
/// Managed list of valid department names (HR-editable). The employee's
/// `department` stays a text label; this table is the source of choices/filters.
model Department {
  id        String   @id @default(cuid())
  name      String   @unique
  order     Int      @default(0)
  createdAt DateTime @default(now())
}
```

### Seed (day-one parity)

Seed exactly the current five, in their present order:
1. Consulting Department
2. Financial Department
3. Top Management
4. Marketing & Community
5. Data Management Unit

## Operations & invariants (server-authoritative)

### `addDepartment(name)`
- Access: HR Admin + Super User.
- Normalize: `trim`. Reject empty/whitespace.
- Reject if a department with the same name exists **case-insensitively**.
- Insert with `order = max(order)+1`.

### `renameDepartment(id, newName)`
- Access: HR Admin + Super User.
- Normalize: `trim`. Reject empty/whitespace.
- Reject if `newName` matches **another** department case-insensitively (a case/whitespace-only change
  of the same row is allowed).
- In one transaction: read the old name → update the `Department.name` → `updateMany` on `User`
  where `department = oldName` set `department = newName`.
- Invariant after commit: **zero** users left on the old name (SC-002).

### `removeDepartment(id)`
- Access: HR Admin + Super User.
- Guard: `count(User where department = name)`; if `> 0`, **block** and return the count (SC-003).
- Else delete the row.

## Read helper: `getDepartments()`
- Returns the managed list ordered by `order`, then `name`.
- Consumers:
  - **Choices/filters** (rewired to this): employee form dropdown, employee grid filter (∪ stray
    values already on records, so legacy labels remain filterable), directory filter, CSV-import
    known-set (soft warning).
  - **Display-only** (unchanged): directory cells, benefits-release department column, grid cells.

## Edge-case handling
- **Stray legacy value** on an employee (not in the list): preserved; the grid filter unions stray
  values so those employees stay filterable. The managed list governs new choices only.
- **Case/whitespace-only rename**: treated as a valid rename of the same row (cascades), not a dupe.
- **Trim**: applied on add and rename before persistence and comparison.
- **Empty managed list**: tolerated (dropdowns show only the blank "—"); the seed keeps five.
