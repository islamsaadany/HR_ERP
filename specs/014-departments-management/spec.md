# Feature Specification: HR-Managed Departments

**Feature Branch**: `014-departments-management`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "HR-managed departments. Today the list of departments is hard-coded in the app and each employee has a free-text `department` label chosen from that fixed dropdown. HR Admin and Super User should be able to add, rename, and remove departments from a new Departments screen in the Admin area — without a developer/redeploy. Simple storage model: the department stays a text label on each employee, but the LIST of valid departments is managed. Renaming updates every employee in that department; removing is blocked while anyone is assigned. Every department dropdown across the app reads from the managed list. Seed the list with the current 5 departments."

## Clarifications

### Decisions already made (do not re-open)

- **Simple storage model (Option A).** The department remains a **text label** on each employee. What becomes managed is the **list of valid departments** — a lookup HR maintains. Departments are **not** turned into a linked/foreign-key entity, and carry no extra attributes (no head, no budget). That is a possible future upgrade, explicitly out of scope.
- **Rename cascades by value.** Renaming a department updates **every employee currently carrying that department name** to the new name, in one server-side operation.
- **Remove only when empty.** A department can be removed **only when no employee is assigned to it**. If anyone is assigned, removal is blocked with a clear message telling HR to move those people first.
- **Access:** **HR Admin and Super User** (same as the other admin configuration screens).
- **Single source of truth.** Every place that currently lists departments — the employee create/edit form, the employee grid filter, the directory filter, CSV-import validation, and the benefits-release column picker — reads from the managed list instead of a hard-coded constant.
- **Seed with today's five.** The managed list is seeded with the current departments (Consulting Department, Financial Department, Top Management, Marketing & Community, Data Management Unit) so nothing changes on day one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a new department (Priority: P1)

An HR Admin or Super User opens a **Departments** screen in the Admin area and adds a new department (e.g. "People & Culture"). It immediately becomes selectable everywhere an employee's department is set or filtered.

**Why this priority**: The core gap today — HR cannot introduce a new department without a code change and redeploy. Adding is the most common need and unblocks the rest.

**Independent Test**: On the Departments screen, add "People & Culture", then open the employee edit form and confirm "People & Culture" now appears in the department dropdown.

**Acceptance Scenarios**:

1. **Given** an HR Admin on the Departments screen, **When** they add a department with a new name, **Then** it is saved and appears in the managed list and in every department dropdown across the app.
2. **Given** a department name that already exists (case-insensitive), **When** HR tries to add it again, **Then** the duplicate is rejected with a clear message and the list is unchanged.
3. **Given** an empty or whitespace-only name, **When** HR tries to add it, **Then** it is rejected with a clear message.

### User Story 2 - Rename a department (Priority: P1)

An HR Admin or Super User renames an existing department (e.g. "Data Management Unit" → "Data & Analytics"). Every employee who was in the old department now shows the new name, everywhere.

**Why this priority**: Departments get renamed as the org evolves; without a cascading rename, employee records drift from the managed list and filters break.

**Independent Test**: With at least one employee in "Data Management Unit", rename it to "Data & Analytics" on the Departments screen, then confirm that employee's department reads "Data & Analytics" in the directory and grid, and the old name no longer appears anywhere.

**Acceptance Scenarios**:

1. **Given** a department with N employees assigned, **When** HR renames it, **Then** all N employees are updated to the new name in one operation and the managed list shows only the new name.
2. **Given** a rename whose target name already exists (case-insensitive) as another department, **When** HR tries to save, **Then** it is rejected to avoid merging two departments by accident.
3. **Given** a rename to an empty/whitespace name, **When** HR tries to save, **Then** it is rejected with a clear message.

### User Story 3 - Remove a department (Priority: P2)

An HR Admin or Super User removes a department that is no longer used. Removal is allowed only when the department is empty.

**Why this priority**: Cleanup matters, but it is lower-frequency than adding/renaming and must be safe — removing a department that still has people would orphan their records.

**Independent Test**: Create a spare department with no employees, remove it, and confirm it disappears from every dropdown. Then attempt to remove a department that has employees and confirm the removal is blocked with a message.

**Acceptance Scenarios**:

1. **Given** a department with **no** employees assigned, **When** HR removes it, **Then** it is deleted from the managed list and disappears from every dropdown.
2. **Given** a department with **one or more** employees assigned, **When** HR attempts to remove it, **Then** the removal is blocked and a clear message states how many people must be moved first.

### User Story 4 - The whole app reads the managed list (Priority: P1)

Wherever a department is chosen or filtered, the options come from the managed list — not a hard-coded set. Adding, renaming, or removing a department is reflected consistently across the app.

**Why this priority**: A managed list that only the admin screen honors would be worse than today — the value is that every surface stays in sync from one place.

**Independent Test**: Add a new department, then confirm it appears in: the employee create form, the employee edit form, the employee grid's department filter, the directory's department filter, and the benefits-release column picker.

**Acceptance Scenarios**:

1. **Given** a change to the managed list, **When** a user opens any department dropdown or filter in the app, **Then** the options reflect the current managed list.
2. **Given** a CSV import that references a department, **When** the row is validated, **Then** the department is checked against the managed list (consistent with how the form validates it).

### Edge Cases

- **An employee already carries a department name not in the managed list** (legacy/imported data) — the value is preserved on that employee; the managed list is the source for *choices*, not a retroactive purge. HR can add that name to the list to make it official, or re-assign the employee. (This tolerance keeps imports from breaking; a future slice could reconcile stray values.)
- **Rename that only changes capitalization/whitespace** (e.g. "top management" → "Top Management") — treated as a valid rename of the same department, cascading to employees; it is not a duplicate of itself.
- **Two admins edit the list at once** — last write wins on a per-department basis; the list is small and low-contention. Duplicate-name and empty-name guards still apply on each save.
- **Removing the last department** — allowed if it is empty; the app tolerates an empty managed list (dropdowns show only the blank/"—" option), though in practice the seed keeps five.
- **Leading/trailing spaces in a typed name** — trimmed before saving so "  Finance " and "Finance" are the same department.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain a **managed list of departments** that is the single source of department choices across the app, seeded with the current five departments.
- **FR-002**: HR Admin and Super User MUST be able to **add** a department by name from an Admin **Departments** screen; the list MUST reject empty/whitespace names and case-insensitive duplicates.
- **FR-003**: HR Admin and Super User MUST be able to **rename** a department; the rename MUST **cascade to every employee** currently carrying the old name, in one server-side operation, and MUST reject a target name that duplicates another existing department (case-insensitive) or is empty.
- **FR-004**: HR Admin and Super User MUST be able to **remove** a department **only when no employee is assigned to it**; an attempted removal of a non-empty department MUST be blocked with a message stating how many employees must be moved first.
- **FR-005**: Every department **dropdown, filter, and validation** in the app — employee create form, employee edit form, employee grid filter, directory filter, CSV-import validation, and benefits-release column picker — MUST read its options from the managed list.
- **FR-006**: All add / rename / remove operations MUST be **enforced server-side** and restricted to HR Admin and Super User; a non-privileged request MUST be denied regardless of client state.
- **FR-007**: Department names MUST be **trimmed** of leading/trailing whitespace before saving; comparison for duplicates MUST be case-insensitive.
- **FR-008**: The employee's `department` MUST remain a **text label** (no schema relationship introduced); existing employee department values MUST be preserved even if not present in the managed list.
- **FR-009**: The Departments screen MUST show, per department, its **name** and enough context to act safely — at minimum a way to see that a department is **in use** (so HR understands why a remove is blocked).

### Key Entities *(include if feature involves data)*

- **Department (managed list entry)**: represents a valid department choice. Attributes: a unique **name** (trimmed, case-insensitively unique) and an ordering/display position. No head, budget, or employee relationship — it is a lookup value. Employees reference a department by its **name string**, unchanged from today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can add a new department and see it available in every department dropdown/filter **without any code change or redeploy**.
- **SC-002**: Renaming a department updates **100% of employees** previously in that department to the new name, with **zero** employees left on the old name.
- **SC-003**: A department that still has employees **cannot** be removed — 100% of such attempts are blocked with a message naming the count to move.
- **SC-004**: On day one, the managed list contains exactly the **five existing departments** and no employee's department value changes.
- **SC-005**: Every department selector/filter in the app (employee form, grid filter, directory filter, CSV import, benefits-release column picker) shows the **same** current list, with no divergence from a hard-coded set.

## Assumptions

- **Reuses existing admin access control** — HR Admin / Super User gating already used by other admin configuration screens applies unchanged.
- **Department stays a text label** — no foreign-key migration of employee records; the managed list is a lookup only (Option A, confirmed).
- **Legacy/stray department values are tolerated**, not purged — an employee keeps whatever department string they have; the managed list governs *new* choices. Reconciling stray values is a possible later slice.
- **The current five departments are the seed** and continue to work exactly as before on day one.
- **Out of scope**: department heads, budgets, per-department permissions, org-chart grouping, and converting `department` into a linked entity — all explicitly deferred.
