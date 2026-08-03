# Feature Specification: Dashboard (Home)

**Feature Branch**: `006-dashboard`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Dashboard — the home screen after sign-in. An adaptive summary that pulls from the other modules: onboarding progress, my time-off status, benefits status, quick links to modules, and company announcements. Manager and HR see a few extra tiles (pending approvals; post announcements)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what needs my attention (Priority: P1)

An employee signs in and lands on a home dashboard that summarizes their world: onboarding progress (if still onboarding), their time-off status, their benefits status, and the latest announcements — each linking to the relevant module.

**Why this priority**: The dashboard is the front door; its value is orienting the employee and routing them to what matters in one glance.

**Independent Test**: Sign in as an employee with an in-progress onboarding and a pending time-off request; confirm the dashboard shows both with correct summaries and working links.

**Acceptance Scenarios**:

1. **Given** a signed-in employee, **When** they land on the dashboard, **Then** they see summary tiles for onboarding progress, time-off, and benefits, plus announcements and quick links.
2. **Given** an onboarding-in-progress employee, **When** the dashboard renders, **Then** the onboarding tile shows their progress percentage and links to Onboarding.
3. **Given** an employee who has completed onboarding, **When** the dashboard renders, **Then** the onboarding tile is hidden or shown as complete (not a broken/empty tile).
4. **Given** any tile, **When** the employee clicks it, **Then** they are taken to the corresponding module.

---

### User Story 2 - Quick links to everything (Priority: P2)

The dashboard offers quick links to the main modules (Directory, Handbook & Resources, My Documents, Benefits, Onboarding, Time-Off) so an employee can jump anywhere from home.

**Why this priority**: Fast navigation is useful but secondary to the at-a-glance summaries.

**Independent Test**: Confirm each quick link navigates to the correct module.

**Acceptance Scenarios**:

1. **Given** the dashboard, **When** the employee uses a quick link, **Then** they arrive at that module.
2. **Given** a module that is a placeholder (e.g., Learning Track), **When** its link is used, **Then** it opens the placeholder gracefully.

---

### User Story 3 - Company announcements (Priority: P2)

Employees see the latest company announcements on the dashboard; HR / Super User can post, edit, and remove announcements.

**Why this priority**: A lightweight comms channel adds value, but the dashboard functions without it.

**Independent Test**: As HR, post an announcement; confirm employees see it on their dashboard; edit/remove it and confirm the change.

**Acceptance Scenarios**:

1. **Given** an HR / Super User, **When** they post an announcement, **Then** it appears on employees' dashboards.
2. **Given** existing announcements, **When** an employee views the dashboard, **Then** they see the most recent ones (newest first).
3. **Given** an announcement, **When** HR edits or removes it, **Then** the change is reflected for employees.

---

### User Story 4 - Manager & HR see extra tiles (Priority: P3)

A manager sees a tile for their team's pending time-off approvals; HR / Super User see an entry point to post announcements (and light org stats). Tiles adapt to the viewer's role/capability.

**Why this priority**: Role-adaptive extras improve efficiency but aren't required for the core home experience.

**Independent Test**: As a manager with pending approvals, confirm the approvals tile shows a count and links to Time-Off; as a plain employee, confirm that tile is absent.

**Acceptance Scenarios**:

1. **Given** a manager (has direct reports) with pending requests, **When** they view the dashboard, **Then** a "pending approvals" tile shows the count and links to Time-Off.
2. **Given** an employee with no direct reports, **When** they view the dashboard, **Then** no approvals tile is shown.
3. **Given** HR / Super User, **When** they view the dashboard, **Then** they see an announcement-management entry point.

---

### Edge Cases

- **No announcements**: the announcements area shows a friendly empty state.
- **Benefits window closed / not configured**: the benefits tile reflects the actual state ("selection not open") rather than erroring.
- **A source module has no data** (no time-off requests, onboarding complete): each tile degrades to a sensible empty/complete state.
- **A dependent module isn't built yet**: its tile/link shows a coming-soon state, not a broken element.
- **Manager with reports but zero pending approvals**: the approvals tile shows zero (or is hidden) rather than erroring.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a home dashboard as the landing screen after sign-in.
- **FR-002**: The dashboard MUST show the employee's onboarding progress (percentage) with a link to Onboarding when onboarding is incomplete, and a complete/hidden state otherwise.
- **FR-003**: The dashboard MUST show the employee's time-off status (e.g., pending/upcoming requests) with a link to Time-Off.
- **FR-004**: The dashboard MUST show the employee's benefits status (window open/closed; draft) with a link to Benefits **while action is still needed, and MUST hide the Benefits tile once the basket is submitted for the year**.
- **FR-004a**: The dashboard MUST respect the module release switch — a **disabled module contributes no tile and no quick link**. Time-Off and Team Directory are the always-on **primary cards** (shown first) whenever their modules are enabled.
- **FR-005**: The dashboard MUST provide quick links to the main modules the employee can access.
- **FR-006**: The dashboard MUST show recent company announcements (newest first).
- **FR-007**: HR / Super User MUST be able to post, edit, and remove announcements.
- **FR-008**: The dashboard MUST show a manager (an employee with direct reports) a pending-approvals tile with a count and a link to Time-Off.
- **FR-009**: The dashboard MUST adapt tiles to the viewer's role/capability (employee vs. manager vs. HR/Super User) and never show a tile the viewer isn't entitled to.
- **FR-010**: The dashboard MUST read summaries from the underlying modules and MUST NOT duplicate or diverge from their source data.
- **FR-011**: Every tile MUST degrade gracefully to an empty/complete/coming-soon state when its source has no data or isn't built yet.

### Key Entities *(include if feature involves data)*

- **Announcement**: a short company message with a title, body, author (HR/Super User), and publish time. Shown newest-first on the dashboard.
- **Dashboard summary (read model)**: a composed, read-only view over Onboarding progress, Time-Off status, Benefits status, and (for managers) pending approvals — sourced from those modules, not stored separately.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The dashboard loads and shows the employee's key summaries within 3 seconds of sign-in.
- **SC-002**: Onboarding, time-off, and benefits tiles reflect the true current state from their source modules (no stale/incorrect summaries).
- **SC-003**: 100% of tiles/links route to the correct module or a graceful placeholder.
- **SC-004**: Role-adaptive tiles never appear for a viewer who isn't entitled to them (e.g., approvals tile only for managers).
- **SC-005**: An HR/Super User can post an announcement that appears on employees' dashboards without developer involvement.
- **SC-006**: Every tile renders a sensible state when its source has no data (no broken/empty errors).

## Assumptions

- **One adaptive dashboard** for everyone; tiles appear/disappear by role/capability rather than separate dashboards.
- **Announcements are company-wide** in v1 (no targeting/segmentation); newest-first; no scheduling.
- **The dashboard is composition-only** — it reads from Onboarding, Time-Off, Benefits, and the registry; it owns only Announcements.
- **No personalization/customization** of tile layout in v1.
- **No email digests** (v1) — the dashboard is the in-app summary.
- **Depends on** Foundation (auth/roles) and reads from Onboarding, Time-Off, and Benefits as those exist; tiles for not-yet-built modules show coming-soon.
