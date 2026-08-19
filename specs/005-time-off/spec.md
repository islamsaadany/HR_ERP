# Feature Specification: Time-Off / Leave Management (V1)

**Feature Branch**: `005-time-off`

**Created**: 2026-07-27

**Status**: Built (v1) — **amended by spec 035 (Time-Off v2, 2026-08-18)**: day counts became WORKING days (Fri/Sat + HR holiday list excluded), per-calendar-year taken counts on all surfaces, live manager badge, approver = current org chart, self-overlap warning, leaver auto-close, cancel-approved-future, admin delete. FR-011/FR-014 and the approver-routing assumption are superseded as written there.

**Input**: User description: "Time-Off (V1, minimal) — an employee requests time off (full days), their direct manager approves or declines, and the request is recorded. One generic 'Time off' type; no balances/allowances in v1; full days only. Onboarding links to how to request leave."

## Clarifications

### Session 2026-07-27

- **Q: Leave types?** → A single generic **"Time off"** type in v1 (no annual/sick/emergency split yet).
- **Q: Track balances/allowances?** → **No** — v1 is request → approve/decline only; no balance math. Allowances added later.
- **Q: Half-days?** → **Full days only** in v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Request time off (Priority: P1)

An employee requests time off by choosing a start and end date (full days) and adding an optional note, then submits it for approval. They can see the request and its status.

**Why this priority**: The core purpose — letting employees formally request leave in one place.

**Independent Test**: Submit a request for a valid date range and confirm it appears as "pending" in the employee's list.

**Acceptance Scenarios**:

1. **Given** a signed-in employee, **When** they submit a request with a valid start/end date (and optional note), **Then** it is recorded as "pending" and shown in their requests.
2. **Given** an invalid range (end before start, or dates in the past), **When** they try to submit, **Then** it is rejected with a clear message.
3. **Given** a pending request, **When** the employee cancels it, **Then** it is withdrawn and no longer awaits approval.

---

### User Story 2 - Manager approves or declines (Priority: P1)

A manager sees time-off requests from their direct reports and approves or declines each, optionally with a comment. The decision is recorded and visible to the requester.

**Why this priority**: Approval is the other half of the workflow; without it a request is just a note.

**Independent Test**: As a manager, approve one report's request and decline another; confirm each requester sees the updated status.

**Acceptance Scenarios**:

1. **Given** a manager with pending requests from direct reports, **When** they open Time-Off, **Then** they see those pending requests.
2. **Given** a pending request, **When** the manager approves it, **Then** its status becomes "approved" and the requester sees it.
3. **Given** a pending request, **When** the manager declines it (optionally with a comment), **Then** its status becomes "declined" with the comment visible to the requester.
4. **Given** a request from someone who is not their direct report, **When** the manager views Time-Off, **Then** it is not in their approval queue.

---

### User Story 3 - Track my requests (Priority: P2)

An employee views the history of their own time-off requests and current statuses (pending / approved / declined / cancelled).

**Why this priority**: People need to see what they've booked and what's pending, but it's secondary to making and approving requests.

**Independent Test**: Create several requests in different states and confirm the employee sees each with the correct status.

**Acceptance Scenarios**:

1. **Given** an employee with past and current requests, **When** they open their Time-Off, **Then** they see each request with dates and status.
2. **Given** a decided request, **When** the employee views it, **Then** the decision (and any manager comment) is shown.

---

### Edge Cases

- **Requester has no direct manager** (e.g., Managing Director): the request routes to a Super User for decision (see Assumptions), rather than having no approver.
- **Overlapping requests**: a new request overlapping an existing pending/approved one is flagged to the employee (warn; not hard-blocked in v1).
- **Manager is unavailable / requester's manager changes**: the current direct manager (per the registry at decision time) is the approver.
- **Past-dated or reversed range**: rejected at submission.
- **Employee leaves (status "Left")**: their pending requests are closed; no new requests.
- **Decision on an already-decided or cancelled request**: prevented (a request is decided once).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Employees MUST be able to submit a time-off request specifying a start and end date (full days) and an optional note.
- **FR-002**: The system MUST validate the date range (end on/after start; not in the past) and reject invalid requests with a clear message.
- **FR-003**: A submitted request MUST start in a "pending" state and be visible to the requester.
- **FR-004**: Employees MUST be able to cancel their own pending request.
- **FR-005**: The system MUST route each request to the requester's **direct manager** (from the org chart) as the approver.
- **FR-006**: Managers MUST be able to see pending requests from their direct reports and approve or decline each, with an optional comment.
- **FR-007**: The system MUST record the decision and reflect the updated status (approved / declined) to the requester, including any comment.
- **FR-008**: The system MUST prevent a manager from acting on requests that are not from their direct reports.
- **FR-009**: The system MUST prevent a second decision on an already-decided or cancelled request.
- **FR-010**: Employees MUST be able to view the history and current status of their own requests.
- **FR-011**: The system MUST warn (not hard-block) when a new request overlaps an existing pending/approved one.
- **FR-012**: The system MUST NOT track balances or allowances in v1 (no deduction math), and MUST use a single generic "Time off" type.
- **FR-013**: HR Admin / Super User MUST have a central view of **all** time-off requests across the company (requester, dates, day count, status, approver), filterable by status, and MUST be able to approve or decline a still-pending request as a fallback when the assigned manager is unavailable. This overrides FR-008 for HR/Super User only; a non-admin manager remains limited to their direct reports.
- **FR-014**: The system MUST give the requester an **in-app cue** (a badge on the Time-Off navigation item) when their request has been approved or declined but not yet seen, and MUST clear the cue once the requester views their Time-Off page. No email is sent (v1).

### Key Entities *(include if feature involves data)*

- **Time-Off Request**: a request by an Employee with a start date, end date (full days), optional note, status (pending / approved / declined / cancelled), the approver (direct manager), and any decision comment/timestamp.
- **Approver relationship**: derived from the registry reporting line (direct manager); not a stored role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can submit a valid time-off request in under 1 minute.
- **SC-002**: A manager can see and decide a direct report's request in under 30 seconds.
- **SC-003**: 100% of requests are routed to the requester's current direct manager (or a Super User when none exists).
- **SC-004**: A requester always sees the correct current status of every request they made (no stale/incorrect states).
- **SC-005**: 0 cases where a manager can decide a request outside their direct reports.
- **SC-006**: Invalid date ranges are rejected 100% of the time at submission.

## Assumptions

- **No-manager fallback**: if a requester has no direct manager, a Super User is the approver.
- **HR / Super User oversight**: HR / Super User may view time-off requests across the company (read-only oversight); approval still belongs to the direct manager.
- **No balances/allowances, no leave types, full days only** in v1 (all confirmed) — allowances, typed leave, and half-days are later enhancements.
- **No email notifications** (v1) — managers see pending requests in-app; requesters see status in-app.
- **No team calendar / capacity view** in v1 (overlap is only warned to the requester).
- **Cancelling an approved (future) request** is out of scope for v1 (cancel applies to pending); can be added later.
- **Depends on** Foundation (registry + reporting lines) for routing to the direct manager.
