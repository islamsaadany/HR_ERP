# Contracts: Departments server actions

All actions live in `src/app/(app)/admin/departments/actions.ts`, are `"use server"`, and start with
`requireAdmin()` (HR Admin + Super User). All return a small result the client renders; all revalidate
the departments page (and the employees grid path) on success. Names are trimmed server-side;
duplicate checks are case-insensitive. None of these trust client-sent role or validity.

## `addDepartment(name: string)`
- **Input**: raw name (from a form field).
- **Rejects**: empty/whitespace → `"Enter a department name."`; case-insensitive duplicate →
  `"That department already exists."`
- **Success**: inserts `{ name: trimmed, order: max+1 }`; returns `{ ok: true }`.

## `renameDepartment(id: string, newName: string)`
- **Input**: department id + new name.
- **Rejects**: missing row → `"Department not found."`; empty/whitespace → `"Enter a department name."`;
  case-insensitive duplicate of **another** row → `"Another department already has that name."`
- **Success**: transaction — update `Department.name`; `User.updateMany({ where: { department: oldName }, data: { department: newName } })`. Returns `{ ok: true, moved: <count> }`.

## `removeDepartment(id: string)`
- **Input**: department id.
- **Rejects**: missing row → `"Department not found."`; in-use →
  `{ ok: false, error: "N employee(s) are still in this department. Move them first." }` where N is the
  live count.
- **Success**: deletes the row; returns `{ ok: true }`.

## Read path (not an action)
- `getDepartments()` in `src/lib/departments.ts` returns the ordered list for server components to pass
  into forms/filters. Client components receive the list as props (no client DB access).

## Access-control contract
- Every action redirects/denies for non-admin callers via `requireAdmin()` **before** any mutation —
  a forged client request cannot add/rename/remove (FR-006).
