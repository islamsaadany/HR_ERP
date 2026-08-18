# Feature Specification: Time-Off v2 — Working-Day Counts & Complete Request Cycle

**Feature Branch**: `claude/user-data-edit-attributes-eom3zv`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Upgrade the minimal Time-Off module (spec 005) into a fully functioning vacation workflow per the 2026-08-18 audit: working-day counting (Fri/Sat + HR-managed public holidays excluded), a per-calendar-year days-taken count visible to employee/manager/HR, no entitlement limit and no leave types, fix the audit gaps (self-overlap warning, manager pending badge, current-manager routing, leaver auto-close), and allow cancelling an approved future request."

## Context

The 2026-08-18 audit found the spec-005 cycle (request → manager approve/decline → history, with HR fallback) working end-to-end, but minimal: day counts include weekends, nobody can see how many days someone has taken, managers get no cue that a request is waiting, an employee can double-book themselves silently, a pending request stays with a manager who changed or left, and an approved trip can't be cancelled when plans change.

Decisions locked at alignment (2026-08-18): **no annual entitlement or limit** — the platform shows a **count** of working days taken, never blocks on it; the count is **per calendar year**; the weekend is **Friday + Saturday**; an **HR-managed public-holidays list** also doesn't count; **no leave types** (one generic "Time off"); the count is visible to the **employee, the manager at approval time, and HR**. Email stays out (in-app cues only, per the standing email rule).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Days are counted in working days, and everyone sees the year's count (Priority: P1)

An employee requests Monday→Sunday off and sees it costs 5 working days, not 7. Their Time-Off page shows "X working days taken in 2026" (approved requests only). The manager deciding a request sees the same count next to the requester's name; HR sees a per-person count on the company view.

**Why this priority**: Counting is the heart of this upgrade — every other surface just displays the same number.

**Independent Test**: Request a range spanning a weekend and a listed holiday; confirm the shown day count excludes them, and that the employee/manager/HR views all report the same year total after approval.

**Acceptance Scenarios**:

1. **Given** a request spanning Friday and Saturday, **When** it is shown anywhere (form preview, lists, manager card, HR table), **Then** those days are excluded from the count.
2. **Given** a public holiday inside the range that HR has listed, **Then** it is excluded too; removing it from the list changes future displays.
3. **Given** approved requests across two calendar years, **Then** each year's count contains only its own days (a request spanning New Year splits its days between the years).
4. **Given** pending or declined or cancelled requests, **Then** they never add to the days-taken count (approved only).
5. **Given** a request consisting only of weekend/holiday days, **When** submitted, **Then** it is refused with a clear "no working days in this range" message.

---

### User Story 2 - The manager knows, and the right manager decides (Priority: P1)

When a report submits a request, the manager's Time-Off nav item shows a live badge with the number waiting. If an employee's reporting line changes while a request is pending, the request follows them to the new current manager; a manager who has left never holds requests.

**Why this priority**: The audit's biggest workflow gap — an approval cycle where the approver doesn't know they're needed isn't a cycle.

**Independent Test**: Submit as a report and confirm the manager's badge appears without them re-signing-in; change the reporting line and confirm the pending request moves.

**Acceptance Scenarios**:

1. **Given** a pending request from a direct report, **When** the manager uses the app, **Then** the Time-Off nav item shows the pending count (live, like the requester's decision badge), clearing when none remain.
2. **Given** a pending request whose requester is re-assigned to a new manager, **Then** the new manager sees and decides it and the old manager no longer does.
3. **Given** a requester whose manager has left the company, **Then** the request routes as if they had no manager (Super User fallback).
4. **Given** an employee marked as Left, **Then** their pending requests are closed automatically and no longer sit in anyone's queue.

---

### User Story 3 - Self-overlap warning and cancelling an approved trip (Priority: P2)

An employee submitting dates that overlap their own pending/approved request is warned before it goes to the manager (warned, not blocked). An employee whose plans change cancels an approved request before it starts; the days return to their count and the manager/HR can see it was cancelled.

**Why this priority**: Completes the request lifecycle; both were audit findings but neither blocks the daily flow.

**Independent Test**: Submit two overlapping requests and confirm the warning; cancel an approved future request and confirm the year count drops and the status shows Cancelled.

**Acceptance Scenarios**:

1. **Given** an existing pending/approved request, **When** the employee picks overlapping dates, **Then** they are warned (with the clashing dates) and may still submit.
2. **Given** an approved request that has not started, **When** the employee cancels it, **Then** it becomes Cancelled, leaves the year count, and the manager/HR views show it as cancelled.
3. **Given** an approved request that has already started (or passed), **Then** the employee cannot cancel it (HR fallback remains for corrections).

---

### User Story 4 - HR manages the public-holidays list (Priority: P2)

HR maintains a simple list of public holidays (date + name) in admin configuration. Listed days are excluded from every working-day count.

**Why this priority**: Required for accurate counting around Eid and national days, but the module works (slightly over-counting) without entries.

**Independent Test**: Add a holiday inside an existing range and confirm new displays exclude it; delete it and confirm they include it again.

**Acceptance Scenarios**:

1. **Given** the admin holidays screen, **When** HR adds a date + name, **Then** it appears in the list and stops counting as a working day everywhere.
2. **Given** a listed holiday, **When** HR removes it, **Then** future counts include that day again.
3. **Given** a non-admin, **Then** the holidays screen and its changes are refused server-side.

---

### Edge Cases

- A request spanning a year boundary contributes its working days to each year separately in the counts.
- A holiday falling on a Friday/Saturday changes nothing (the day was already excluded).
- Counts are always derived live from approved requests + the current holiday list; a holiday added after an approval changes the displayed count (nothing is frozen, since nothing is deducted from an entitlement).
- The manager badge and the requester badge coexist on the same nav item (a person can be both); the badge shows the sum of things needing their attention.
- Re-routing on reporting-line change applies to PENDING requests only — decided history keeps the approver who actually decided.
- An employee with no manager keeps the existing Super User fallback; re-assignment later pulls their pending request to the new manager.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every day count shown or stored MUST count working days only: Fridays, Saturdays, and dates on the HR holiday list are excluded.
- **FR-002**: The system MUST show a per-person, per-calendar-year total of working days taken (approved requests only) to: the employee (own page), the manager (on each request card they decide), and HR (per person on the company view).
- **FR-003**: The system MUST NOT enforce any entitlement or limit — counts inform, never block — and MUST keep a single generic "Time off" type.
- **FR-004**: A request whose range contains zero working days MUST be refused at submission with a clear message.
- **FR-005**: The employee MUST be warned (not blocked) when submitting dates that overlap their own pending or approved request.
- **FR-006**: The manager MUST get a live in-app badge on the Time-Off nav item counting pending requests awaiting them, clearing when none remain; it coexists with the requester's decision badge.
- **FR-007**: A pending request MUST always be decidable by the requester's CURRENT direct manager: reporting-line changes re-route pending requests; a manager who left never holds them; the no-manager Super User fallback stays.
- **FR-008**: Marking an employee as Left MUST close their pending requests automatically.
- **FR-009**: The employee MUST be able to cancel an APPROVED request before its start date; it becomes Cancelled, leaves the counts, and remains visible as cancelled to manager/HR. Started/past requests cannot be self-cancelled.
- **FR-010**: HR Admin / Super User MUST manage the public-holidays list (add/remove date + name); changes apply to all future count displays; access is enforced server-side.
- **FR-011**: All existing spec-005 behaviour not amended here (validation, statuses, HR fallback decisions, decision badge/comments) MUST keep working unchanged.

### Key Entities

- **Public Holiday**: a date + name managed by HR; excluded from working-day counts.
- **Time-Off Request** (existing): unchanged shape; its displayed day count becomes working days, and its approver mapping becomes "current manager while pending".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Monday→Sunday request shows 5 days everywhere (7 minus Friday+Saturday), and spanning a listed holiday reduces it by exactly one more.
- **SC-002**: The employee's, the manager's, and HR's year-count for the same person are always identical.
- **SC-003**: A manager learns of a new pending request from the nav badge without re-signing in or being told.
- **SC-004**: After a reporting-line change, the new manager can decide the pending request and the old manager cannot — 100% of the time.
- **SC-005**: Cancelling an approved future trip removes its days from the year count immediately.

## Assumptions

- Counts are derived live (no stored totals) — acceptable because nothing is deducted from an entitlement, so retroactive holiday-list edits changing a displayed count is correct behaviour, not drift.
- "Before its start date" for self-cancel means strictly before the start date's day begins.
- The holidays list is company-wide (no per-business-unit calendars in this version).
- No email notifications — in-app badges only (standing rule: email is limited to the benefit-claim workflow).
- Out of scope: leave types, half-days, entitlements/balances/carry-over, team calendar view.
- Depends on the existing registry reporting lines and the spec-005 request cycle.
