# Feature Specification: Profile Data Request Campaigns

**Feature Branch**: `claude/user-data-edit-attributes-eom3zv`

**Created**: 2026-08-17

**Status**: Built 2026-08-17 (migration 054)

**Input**: User description: "HR or Finance request profile data from the team; a popup appears on login / opening the platform showing the exact fields — empty ones to fill or prefilled ones to verify — and stays in the sidebar as a notification until filled. Everyone fills according to the field requirements, saves, and it lands on the user profile, the employee registry, and the CSV download."

## Context

HR keeps discovering holes in the employee registry — a missing national ID here, an unverified date of birth there — and today the only tools are chasing people by message or waiting for each person to wander to My Profile. The registry recently gained employee-entered fields (legal names, national ID, strict phone formats — spec 029 rounds 1–5), which makes the gap sharper: the fields exist, the validation exists, but there is no way to ASK sixty people to fill them.

This feature gives HR Admins and Finance a **campaign**: pick fields, pick people, and every targeted employee is met with a popup on their next visit showing exactly those fields — empty ones to fill, prefilled ones to confirm or correct — validated by the same rules as My Profile. Answers write **directly** to the employee record (HR asked for the data; there is no approval queue to re-approve it through), so the registry, My Profile, and the CSV export reflect them immediately. A sidebar notification with a pending count persists until the employee finishes, and HR watches completion per person, per field, on a tracker.

Decisions locked at alignment (2026-08-17): creators are **HR Admins and Finance** (Super Users implicitly); targeting is **everyone, departments, or hand-picked employees**; answers **write directly** with HR reviewing a report rather than an approval queue; the popup is **dismissible** with a persistent sidebar badge (nobody is locked out of working); prefilled values are **confirmed or corrected per field**, and the tracker records which.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An employee answers a data request (Priority: P1)

An employee opens the platform and a popup lists the fields HR asked for: their empty national ID to fill, their prefilled date of birth to confirm. They fill the empty ones, press Confirm on the correct prefilled ones (or edit the wrong ones), save, and the popup is gone for good. If they press "Later" instead, the sidebar keeps a notification with the pending count and the popup returns next visit.

**Why this priority**: This is the half that produces the data. Without it a campaign is a memo.

**Independent Test**: Seed a campaign requesting one empty and one prefilled field, sign in as a targeted employee, complete the popup, and confirm the values landed on the employee record and the popup does not reappear.

**Acceptance Scenarios**:

1. **Given** a targeted employee with an open campaign, **When** they load any page of the platform, **Then** a popup shows exactly the requested fields — no others — with current values prefilled where they exist.
2. **Given** the popup is open, **When** the employee enters values, **Then** each field enforces the same rules as My Profile (14-digit national ID, per-country phone with digits only, Arabic name right-to-left, dependant rows needing a date of birth, one spouse max), with clear inline errors.
3. **Given** a prefilled field, **When** the employee presses Confirm, **Then** the field is recorded as confirmed with its value unchanged; **When** they edit it instead, **Then** the new value is recorded as corrected.
4. **Given** the employee saves a completed popup, **Then** the answers are written to their employee record immediately and are visible on My Profile, the admin registry, and the CSV export.
5. **Given** the employee presses "Later", **Then** the popup closes, a sidebar notification shows the number of pending fields, and the popup reappears on the next visit.
6. **Given** the employee completes every requested field, **Then** the sidebar notification disappears and the popup never returns for that campaign.
7. **Given** a partially filled popup is saved (some fields answered, some left), **Then** the answered fields are written and recorded, and only the remaining fields stay pending.

---

### User Story 2 - HR composes a campaign and tracks completion (Priority: P1)

An HR Admin (or Finance) opens the campaign composer, picks the fields they need (e.g. national ID + emergency contact), picks the audience (everyone / a department / named people), gives it a short title, and launches it. On the tracker they watch who has completed, who is pending, and per person per field what was entered — filled, confirmed, or corrected.

**Why this priority**: Equal to Story 1 — a popup nobody can create never appears. Together these two are the minimum viable feature.

**Independent Test**: As HR, create a campaign targeting one employee and one field; confirm the employee sees it, and after they answer, the tracker shows the person as complete with the entered value marked filled/confirmed/corrected.

**Acceptance Scenarios**:

1. **Given** an HR Admin or Finance user, **When** they open the composer, **Then** they can select any combination of the requestable registry fields, an audience (all active employees, one or more departments, or hand-picked employees), and a title shown to employees.
2. **Given** a Super User or HR Admin or Finance user, **When** a campaign is created, **Then** only active employees in the audience are targeted, and employees hired later are NOT silently added.
3. **Given** a running campaign, **When** HR opens its tracker, **Then** they see per employee: completed / pending, and per field the outcome (filled, confirmed, corrected, still pending) with the entered value.
4. **Given** a non-admin employee, **When** they attempt to open the composer or tracker, **Then** access is refused server-side.
5. **Given** a campaign has served its purpose, **When** HR closes it, **Then** its popups and sidebar notifications disappear for everyone, and its tracker remains readable.

---

### User Story 3 - Several campaigns at once (Priority: P2)

Finance requests national IDs while HR separately requests emergency contacts. A targeted employee sees ONE popup with both sets of fields (each labelled with its campaign title); completing everything clears both. The sidebar count is the total of pending fields across campaigns.

**Why this priority**: Multiple open campaigns will happen in practice, but the feature is viable with one at a time.

**Independent Test**: Open two campaigns hitting the same employee, sign in as them, and confirm one merged popup that clears both when completed.

**Acceptance Scenarios**:

1. **Given** two open campaigns targeting the same employee, **When** they load the platform, **Then** one popup shows both campaigns' fields grouped under their titles, deduplicated so a field requested twice appears once (answering it satisfies both).
2. **Given** the employee completes only one campaign's fields, **Then** that campaign records them and the popup/sidebar continue showing only the other's remaining fields.

---

### Edge Cases

- An employee whose requested field is already filled AND was requested "to fill" still sees it prefilled for confirmation — the campaign asks about the field, the current state decides fill-vs-verify.
- A field the employee cannot answer (they don't know a dependant's exact DOB) can be left pending — saving is per-field, never all-or-nothing.
- HR edits an employee's field while a campaign is open: the popup shows the CURRENT value at open time, and a later confirmation confirms what the employee actually saw.
- An employee targeted by department who then changes department remains targeted (audience resolved at launch).
- An employee who leaves (status ≠ active) stops seeing popups; the tracker shows them as no longer targeted rather than eternally pending.
- Dependants requested in a campaign: the employee edits the same full list editor as the request flow; saving replaces the list directly (no approval queue), and the medical-commitment caveat stays HR's concern on the tracker (premiums are never recalculated automatically).
- A declined/cancelled campaign mid-fill: answers already saved stay saved (they were direct writes); only pending asks disappear.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: HR Admins, Finance users, and Super Users MUST be able to create a campaign selecting: one or more requestable fields (phone, legal name English, legal name Arabic, national ID, date of birth, marital status, emergency contact name/relationship/phone, dependants), an audience (all active employees, one or more departments, or hand-picked employees), and a title.
- **FR-002**: The audience MUST be resolved to a concrete list of active employees at launch time.
- **FR-003**: Targeted employees MUST see a popup on their next page load showing exactly the requested fields — prefilled where the record has a value, empty otherwise — and the popup MUST reappear on subsequent visits until all fields are resolved or the campaign is closed.
- **FR-004**: The popup MUST be dismissible ("Later"); dismissal MUST NOT mark anything answered.
- **FR-005**: A persistent sidebar notification MUST show the employee's total pending-field count across open campaigns, and MUST disappear when nothing is pending.
- **FR-006**: Every field input MUST enforce the same validation as My Profile, server-side: strict per-country phone format, 14-digit national ID, dependant rules (DOB required, one spouse max), marital status options, no future dates of birth.
- **FR-007**: For a prefilled field the employee MUST be able to either confirm the value unchanged or replace it; the outcome (confirmed vs corrected) MUST be recorded per field. An empty field that is filled records as filled.
- **FR-008**: Saving MUST write answered fields directly to the employee record immediately — no approval queue — so My Profile, the registry, and the CSV export reflect them at once. Partial saves MUST be possible; only unanswered fields stay pending.
- **FR-009**: Campaign creators MUST have a tracker per campaign showing, per targeted employee: completed/pending, and per field the outcome and entered value, updated as answers arrive.
- **FR-010**: Creators MUST be able to close a campaign at any time; closing removes all its popups/notifications, keeps the tracker readable, and never undoes written answers.
- **FR-011**: Composer and tracker access MUST be enforced server-side (HR Admin, Finance, Super User only). Employees MUST only ever be able to write their OWN record through a campaign, and only for fields that campaign requested from them.
- **FR-012**: When several campaigns request the same field from the same employee, the popup MUST show it once and one answer MUST satisfy all of them.
- **FR-013**: Employees with status other than active MUST NOT see popups or notifications, and MUST be excluded from completion percentages.
- **FR-014**: All notifications are in-app only — no email for any part of this feature.

### Key Entities

- **Campaign**: title, requested field keys, creator, created/closed timestamps, audience descriptor. Created by HR/Finance/Super User.
- **Campaign target**: one per (campaign × employee) resolved at launch — carries per-field state: pending, filled, confirmed, or corrected, with the recorded value and answered-at timestamp.
- **Requestable field registry** (existing): the single source of labels, inputs, validation and write rules — campaigns reuse it, they do not define their own field list.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An HR Admin can compose and launch a campaign (fields + audience + title) in under 2 minutes.
- **SC-002**: A targeted employee sees the popup on their very next page load after launch, and can complete a two-field request in under 1 minute.
- **SC-003**: 100% of answers appear on the employee record, My Profile, the admin registry, and the CSV export immediately after saving — zero re-typing by HR.
- **SC-004**: The tracker answers "who is still missing what" for a 60-person campaign at a glance (one screen, no per-person clicking for status).
- **SC-005**: No employee is ever blocked from using the platform by an unanswered campaign (dismiss always available).

## Assumptions

- Campaign audiences are resolved at launch; later hires are added by launching a follow-up campaign (keeps "who was asked" auditable).
- Answer values are recorded on the campaign target as text snapshots (what the tracker shows), while the live record stays the single source of truth for the registry/CSV.
- The employee-facing modal reuses the existing field editors (per-country phone input, RTL Arabic input, dependants list editor) rather than introducing new input patterns.
- Closing is the only campaign lifecycle action in v1 — no editing a launched campaign's fields or audience (launch a new one instead).
- The merged popup orders campaigns oldest-first; within a campaign, fields follow the registry order.

## Dependencies

- Spec 029 (rounds 1–5): the requestable-field registry, strict phone/national-ID validation, self-edit field editors, and the dependants list editor — all reused here.
- The admin employees registry and CSV export (spec 001/025 + round 5) — answers surface there with no changes needed beyond what exists.

## Out of Scope

- Email or push notifications (in-app only, per the standing email rule).
- Recurring/scheduled campaigns, reminders, or escalation.
- Requesting fields outside the requestable registry (e.g. employment type, salary — those stay HR-only edits).
- An approval queue for campaign answers (direct write was the aligned decision; spec 029's change-request flow remains for employee-initiated corrections).
- Editing a launched campaign's fields or audience.

## Amendments

### 2026-08-17 — Live-testing fixes + outcome CSV + registry columns
- **Saving is not finishing.** A partial save keeps the popup open, shows "Saved — N fields left", and the close button becomes **Finish**; only Finish (or answering everything) closes it. The save button counts only fields still on screen.
- **A confirmed field keeps its Edit button** — confirming a legacy value today's rules reject (e.g. an 11-digit national ID) errors, and the employee can now switch straight to editing it.
- **Campaign outcome CSV**: the tracker carries a Download CSV button (`/api/admin/data-requests/[id]/export`, same access gate) — one row per targeted employee, a value + outcome column pair per field, status incl. "Left the company".
- **Registry grid columns**: Legal name (EN), Legal name (AR), and National ID are grid columns (hidden by default, in the Columns menu, inline-editable under the same strict validation).
