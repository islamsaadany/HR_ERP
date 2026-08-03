# Feature Specification: Team Directory (V1)

**Feature Branch**: `003-team-directory`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Team Directory (V1, deliberately simple) — a browsable directory of active employees from the registry: cards with photo/name/title/department/email/phone, name search, department filter, a person view with public fields + contact actions. View-only; no org chart; no other filters; active employees only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse the team (Priority: P1)

A signed-in employee opens the Team Directory and sees all active colleagues as cards showing photo, name, job title, department, and contact details, so they can find and reach anyone.

**Why this priority**: The core purpose — a single place to see who's on the team and how to reach them.

**Independent Test**: Sign in, open the Directory, and confirm active employees are listed with photo, name, title, department, email, and phone.

**Acceptance Scenarios**:

1. **Given** a signed-in employee, **When** they open the Directory, **Then** they see all active employees as cards with photo, name, title, department, email, and phone.
2. **Given** an employee marked "Left", **When** the Directory renders, **Then** that person does not appear.
3. **Given** a colleague with a missing photo or phone, **When** their card renders, **Then** the missing field degrades gracefully (e.g., a placeholder avatar, no broken element).

---

### User Story 2 - Find a specific person (Priority: P1)

An employee searches by name and/or filters by department to quickly narrow the list to the person or team they want.

**Why this priority**: With a growing team, browsing alone isn't enough; search + department filter is the minimum to find someone fast.

**Independent Test**: Type part of a name and confirm the list narrows to matches; select a department and confirm only that department shows.

**Acceptance Scenarios**:

1. **Given** the Directory, **When** the employee types part of a name, **Then** the list narrows to matching people as they type.
2. **Given** the Directory, **When** the employee selects a department, **Then** only active employees in that department are shown.
3. **Given** an active name search and a selected department, **When** both apply, **Then** results match both conditions.
4. **Given** a search/filter with no matches, **When** it runs, **Then** a clear "no results" state is shown.

---

### User Story 3 - View a person and contact them (Priority: P2)

An employee opens a colleague's person view to see their public details and contact them with one click (email or phone).

**Why this priority**: Reaching someone is the payoff of finding them; contact actions make the directory actionable.

**Independent Test**: Open a person view, confirm only public fields show, and confirm the email/phone actions launch the correct contact.

**Acceptance Scenarios**:

1. **Given** a person view, **When** it renders, **Then** it shows only that employee's public fields (name, title, department, email, phone, photo).
2. **Given** a person view, **When** the employee clicks the email or phone action, **Then** the appropriate contact action is initiated.
3. **Given** any person view, **When** it renders, **Then** no HR-private fields (employment type, dates, date of birth, marital status, dependants, status) are shown.

---

### Edge Cases

- **Left employee**: excluded from all Directory listings, search, and person views.
- **Missing contact info** (no phone, or a placeholder email): the card/person view shows what exists and omits/greys the missing action rather than erroring.
- **Missing Google photo**: a placeholder avatar is shown.
- **No search/filter matches**: a clear empty state, not a blank screen.
- **New joiner not yet started** (future start date): appears if their status is active — team can see who's joining (unless a later rule hides pre-start joiners; not restricted in V1).
- **Directly requesting another employee's private fields** (e.g., via a crafted request): the system does not return them — visibility is enforced server-side, not by hiding in the UI.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST list all active employees in the Directory, each showing photo, full name, job title, department, email, and phone.
- **FR-002**: The system MUST exclude employees whose status is "Left" from all Directory listings, search results, and person views.
- **FR-003**: Employees MUST be able to search the Directory by name and see the list narrow to matches.
- **FR-004**: Employees MUST be able to filter the Directory by department (the only filter in V1).
- **FR-005**: The system MUST allow name search and department filter to apply together.
- **FR-006**: The system MUST provide a person view showing only the selected employee's public fields (name, title, department, email, phone, photo).
- **FR-007**: The system MUST provide contact actions (email, phone) on the person view (and/or card), initiating the appropriate action when used.
- **FR-008**: The system MUST NOT expose any HR-private field of another employee anywhere in the Directory, enforced server-side (not merely hidden in the UI).
- **FR-009**: The system MUST be read-only — no employee record can be created or edited from the Directory.
- **FR-010**: The system MUST show a clear empty state when a search/filter yields no results.
- **FR-011**: The system MUST render gracefully when optional fields are missing (photo, phone, placeholder email).
- **FR-012**: The Directory MUST be available to every signed-in employee.
- **FR-013**: The system MUST read employee data from the Foundation registry as the single source of truth (no separate directory data store).
- **FR-014**: The Directory MUST present employees as a read-only **list (table)** — the sole view (the earlier card view and card/list toggle were retired per product owner, 2026-08-03). It shows only the public fields (name, title, department, email, phone), remains read-only (FR-009), and honors the search + department filter. Editing employee records stays an HR-only capability in the admin registry (see spec 001, FR-020).
- **FR-015**: The list MUST let the employee sort **alphabetically** by the **Title** or **Department** column (clickable header, A→Z then Z→A), with blanks sorting last. Sorting is a read-only client convenience layered on top of the active search + department filter; the default order is by name.

### Key Entities *(include if feature involves data)*

- **Employee (read model)**: the public-facing projection of the Foundation registry record — photo, full name, job title, department, email, phone, and active/left status. The Directory consumes this; it does not own or modify it.
- **Department**: the grouping used by the filter (Consulting, Financial, Top Management, Marketing & Community, Data Management Unit).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in employee can open the Directory and see the active team within 3 seconds.
- **SC-002**: An employee can locate a specific colleague using name search or department filter in under 15 seconds.
- **SC-003**: 100% of "Left" employees are absent from the Directory.
- **SC-004**: 0 HR-private fields of other employees are ever exposed through the Directory (verified across the list, person view, and direct data requests).
- **SC-005**: Contact actions initiate the correct email/phone for the selected colleague in 100% of cases where that contact info exists.
- **SC-006**: The full active team (19 people at launch) renders correctly, including those with placeholder emails or missing photos.

## Assumptions

- **Reporting/org display is out of scope for V1**: no org chart and no "reports to / direct reports" in the Directory; reporting data lives in Foundation and may surface here later.
- **No filters other than department** in V1 (no role/employment-type/tenure filters); **no export**; **no editing**.
- **Photos** come from the employee's Google account picture; a placeholder is used when absent.
- **Placeholder external emails** still appear (with whatever contact info exists) until real company emails are set.
- **Visibility** follows the Foundation public/private split; the Directory only ever shows public fields of others.
- **Pre-start joiners**: active employees with a future start date are shown; hiding them is not a V1 requirement.
- **Depends on** the Foundation module (registry + public/private visibility) being in place.
