# Feature Specification: Onboarding — Role-Aware New-Joiner Journey

**Feature Branch**: `002-onboarding-journey`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Onboarding — a guided, role-aware new-joiner journey built on the employee registry, and the guided front door into the rest of the app. Timeline stages (Day 1 / Week 1 / First month / 30-60-90), activities typed as Policy (acknowledge) or Action (complete), a common core plus role tracks (Consulting first), progress tracking, HR authoring, and cross-module links."

## Clarifications

### Session 2026-07-27

- **Q: Completion model — self-attested or verified?** → All items are **self-attested** by the joiner. Acknowledging a policy or completing an action is done by the employee; no HR/manager sign-off is required for an item to count.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New joiner works through their onboarding (Priority: P1)

A new employee signs in and sees an onboarding journey organized into stages (Day 1, Week 1, First month, 30/60/90). Each item is either a **Policy** to read and acknowledge or an **Action** to complete. They work through the items, acknowledge policies, complete actions, and watch an overall progress percentage climb. They can leave and return; progress is saved.

**Why this priority**: This is the core value of the module — a new hire is guided through everything they need, in one place, without losing a slide deck.

**Independent Test**: Sign in as a joiner with an assigned journey, acknowledge a policy and complete an action, refresh, and confirm both remain done and progress reflects them.

**Acceptance Scenarios**:

1. **Given** a joiner with an assigned journey, **When** they open Onboarding, **Then** they see their activities grouped by timeline stage, each labeled Policy or Action.
2. **Given** a Policy item, **When** the joiner acknowledges it, **Then** it is marked acknowledged (with a timestamp) and counts toward progress.
3. **Given** an Action item, **When** the joiner completes it, **Then** it is marked done (with a timestamp) and counts toward progress.
4. **Given** partial completion, **When** the joiner leaves and returns, **Then** their acknowledged/completed items and progress percentage are preserved.
5. **Given** all assigned items are done, **When** the last one is completed, **Then** the journey shows as complete (100%).

---

### User Story 2 - The right journey is assigned by role (Priority: P1)

Every joiner receives the **common core** activities; joiners in a role that has a track (Consulting first) additionally receive that track's activities. Assignment is derived from the joiner's registry record (role/department).

**Why this priority**: Onboarding "differs by role but shares a core" is a defining requirement; without correct assignment, joiners see the wrong tasks.

**Independent Test**: Create a Consulting joiner and a non-Consulting joiner; confirm the Consulting joiner has core + Consulting track and the other has core only.

**Acceptance Scenarios**:

1. **Given** any new joiner, **When** their journey is assigned, **Then** it includes all common-core activities.
2. **Given** a joiner whose registry role/department maps to the Consulting track, **When** their journey is assigned, **Then** it also includes the Consulting-track activities.
3. **Given** a joiner in a role with no defined track, **When** their journey is assigned, **Then** it includes the common core only.

---

### User Story 3 - HR authors the onboarding content (Priority: P1)

An HR Admin creates and maintains the onboarding content: the timeline stages, the activities, each activity's type (Policy/Action), its links/resources, and which track it belongs to (common core or a role track). HR can also see who has completed what.

**Why this priority**: The journey has to be editable by HR without a developer; content changes over time.

**Independent Test**: As HR, add a new Action to Week 1 in the common core with a resource link; confirm it appears for a joiner's journey and can be completed.

**Acceptance Scenarios**:

1. **Given** an HR Admin, **When** they add an activity with a type, stage, track, and optional link, **Then** it appears in the journeys of joiners assigned that track.
2. **Given** an HR Admin, **When** they edit or remove an activity, **Then** journeys reflect the change without affecting already-recorded completions inappropriately.
3. **Given** an HR Admin, **When** they open the completion overview, **Then** they can see each joiner's progress and which items are done.

---

### User Story 4 - Onboarding routes joiners into the rest of the app (Priority: P2)

Activities link into other modules: HR profile/emergency contact → Registry; upload documents → HR Documents; benefit basket → Benefits; meet the team → Team Directory; policy content → Handbook; leave info → Time-Off. Onboarding is the guided front door.

**Why this priority**: The cross-module links are what make onboarding a hub rather than a static list, but they depend on those modules existing.

**Independent Test**: From an Action that links to another module, follow the link and confirm it lands on the correct destination for that joiner.

**Acceptance Scenarios**:

1. **Given** a Policy item tied to a Handbook section, **When** the joiner opens it, **Then** they are taken to that Handbook section.
2. **Given** the "Make your benefit basket selection" Action, **When** the joiner opens it while the benefits window is open, **Then** they are routed to the Benefits selector; **When** the window is closed, **Then** they see that selection isn't currently available.
3. **Given** the "Upload required documents" Action, **When** the joiner opens it, **Then** they are routed to the HR Documents upload for their own file.

---

### User Story 5 - Manager touchpoints (Priority: P3)

The joiner's manager (derived from the org chart) is the counterpart for the intro 1:1 (Day 1) and the 30/60/90 check-in that closes onboarding.

**Why this priority**: Human touchpoints matter for onboarding quality, but the journey still functions without special manager tooling in v1.

**Independent Test**: For a joiner with a manager set, confirm the intro 1:1 and 30/60/90 items reference the correct manager.

**Acceptance Scenarios**:

1. **Given** a joiner with a manager in the registry, **When** they view the intro 1:1 activity, **Then** it identifies their manager as the counterpart.
2. **Given** a joiner with no manager (e.g., top of org chart), **When** they view manager-touchpoint activities, **Then** those activities degrade gracefully (no broken reference).

---

### Edge Cases

- **Joiner with no manager** (e.g., Managing Director): manager-touchpoint items still render without a broken reference.
- **Benefits window closed** when the joiner reaches the benefit-basket Action: the item indicates the selection isn't currently open rather than erroring.
- **HR edits an activity mid-journey**: already-recorded acknowledgements/completions are preserved; newly added items appear as not-yet-done and adjust the progress denominator.
- **HR removes an activity** a joiner already completed: it no longer appears and no longer counts; the completion record is retained for history but not shown as outstanding.
- **A dependent module isn't ready** (e.g., Time-Off not built yet): the linking Action still exists but its link is inert/marked coming-soon rather than broken.
- **Re-onboarding / role change**: out of scope for v1 (a journey is assigned once at join); note for later.
- **Progress with zero assigned items**: shows a sensible empty/complete state rather than dividing by zero.

## Requirements *(mandatory)*

### Functional Requirements

**Journey structure & assignment**
- **FR-001**: The system MUST organize onboarding activities into ordered timeline stages: Day 1, Week 1, First month, and 30/60/90.
- **FR-002**: The system MUST classify every activity as exactly one type: Policy (read & acknowledge) or Action (do & complete).
- **FR-003**: The system MUST support a common-core set of activities assigned to every joiner, plus role tracks (Consulting first) assigned additionally.
- **FR-004**: The system MUST assign a joiner's journey from their registry record (role/department): common core always, plus any matching role track(s).
- **FR-005**: The system MUST include the agreed common-core activities and their stage placements, and the Consulting-track activities, as the seeded starting content.

**Employee progress**
- **FR-006**: Employees MUST be able to acknowledge a Policy item, recording the acknowledgement with a timestamp.
- **FR-007**: Employees MUST be able to mark an Action item complete, recording completion with a timestamp.
- **FR-008**: The system MUST compute and display an overall progress percentage across the joiner's assigned items.
- **FR-009**: The system MUST persist progress so a joiner can leave and return without losing state.
- **FR-010**: The system MUST show the journey grouped by stage, with each item's type and completion state visible.

**HR authoring**
- **FR-011**: HR Admin MUST be able to create, edit, reorder, and remove stages and activities.
- **FR-012**: HR Admin MUST be able to set each activity's type (Policy/Action), stage, track membership (common core or a specific role track), and optional link/resource.
- **FR-013**: The system MUST preserve prior completion records when HR edits or removes activities, and adjust each affected joiner's progress denominator accordingly.
- **FR-014**: HR Admin MUST be able to view a completion overview across joiners (who has done what, and overall progress).

**Cross-module links**
- **FR-015**: The system MUST let an activity link to another module or an external resource, and route the joiner to that destination.
- **FR-016**: The system MUST handle a link to a module that is unavailable (not built yet, or a closed benefits window) gracefully — indicating the destination isn't currently available rather than erroring.

**Manager touchpoints**
- **FR-017**: The system MUST identify the joiner's manager (from the org chart) as the counterpart for the intro 1:1 and 30/60/90 activities, and render gracefully when no manager exists.

**Access & scope**
- **FR-018**: The system MUST show a joiner only their own journey and progress; HR Admin / Super User may view any joiner's.
- **FR-019**: Completion is **self-attested** by the employee for all items — acknowledging a Policy or marking an Action done is done by the joiner themselves; no HR or manager sign-off is required for an item to count (confirmed 2026-07-27).

### Key Entities *(include if feature involves data)*

- **Onboarding Track**: a named set of activities — the common core, or a role track (e.g., Consulting). Determines who receives which activities.
- **Onboarding Stage**: an ordered timeline bucket (Day 1, Week 1, First month, 30/60/90) that groups activities.
- **Onboarding Activity**: a single item with a title, a type (Policy or Action), a stage, a track membership, and an optional link/resource. Belongs to a track and a stage.
- **Journey Assignment**: the set of activities assigned to a specific joiner (derived from their registry role/department at join).
- **Activity Completion**: a record that a joiner acknowledged a Policy or completed an Action, with a timestamp. Drives the progress percentage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new joiner can see their full assigned journey within 10 seconds of opening Onboarding for the first time.
- **SC-002**: A Consulting joiner receives common core + Consulting track; a non-Consulting joiner receives common core only — 100% correct assignment.
- **SC-003**: Acknowledgements and completions survive leaving and returning in 100% of cases (no lost progress).
- **SC-004**: The progress percentage always equals completed-items ÷ assigned-items and updates immediately on each acknowledgement/completion.
- **SC-005**: An HR Admin can add a new activity (type, stage, track, link) and have it appear in the correct joiners' journeys without developer involvement.
- **SC-006**: 90% of joiners reach 100% completion of the common core within their first 90 days (measured via the completion overview).
- **SC-007**: Every cross-module link routes to the correct destination for the joiner, or shows a graceful "not available yet" state — no broken links.

## Assumptions

- **Stages are organizational, not hard-gated**: a joiner can act on any assigned item regardless of stage; stages guide pacing rather than lock later work.
- **A journey is assigned once at join** based on the registry record; re-onboarding on role change is out of scope for v1.
- **Policy acknowledgement is a recorded, timestamped "I have read/understood"** — not a legal e-signature flow in v1.
- **The Handbook, Benefits, HR Documents, Team Directory, and Time-Off modules are the link destinations**; this feature only links into them and does not implement their content.
- **Learning Track** is a placeholder in v1; any onboarding item pointing to it is informational.
- **Only the Consulting role track is defined now**; Marketing & Community, Data Management, and Finance tracks are added later and start from the common core.
- **No email notifications** (v1) — reminders/nudges are in-app only if present at all.
