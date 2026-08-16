# Feature Specification: Profile Change Requests

**Feature Branch**: `029-profile-change-requests`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Employees cannot edit their own profile; HR makes every change, and asking by message overloads HR. Let an employee propose a correction to their own record from My Profile: they pick the fields, enter the new values and an optional reason, and submit. HR gets a queue with a pending count, sees current vs requested side by side, and approves (which applies the change to the employee record in one click) or declines with a reason. Requestable fields: contact details (phone, emergency contact name/relationship/phone), personal details (date of birth, marital status), and dependants (spouse and children). Date of birth and dependants drive medical premium pricing, so HR must be warned on the approval screen when an approval would affect an employee with a committed medical premium. No email notifications — an in-app badge only, consistent with email being limited to the benefit-claim workflow."

## Context

My Profile is currently **read-only in full**. There is no self-edit anywhere on it — not even for phone, which the decisions log records as employee-editable. So today an employee who spots a wrong phone number, a stale emergency contact, or a mistyped date of birth has no route through the product at all; they message HR, and HR retypes it.

That is the actual problem: not that employees lack edit rights (that is deliberate — the employee registry is the backbone every other module reads), but that the **correction has to travel through a person's inbox** and be manually re-entered, with no record of who asked, when, or whether it was done.

This feature keeps HR as the sole authority over the record while removing the retyping and the inbox. The employee proposes; HR reviews a before-and-after and approves; approving *is* the edit.

Two of the requestable fields carry money consequences. **Date of birth and dependants price medical cover** — a covered person's premium comes from their age band. Age is fixed at the commit date and snapshotted, so approving a corrected date of birth does **not** silently reprice an existing commitment; but it does mean the commitment was priced on a date now known to be wrong, which HR needs to see at the moment of approval rather than discover at renewal.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An employee proposes a correction (Priority: P1)

An employee notices something wrong on their profile, opens a change request from that page, edits the fields that are wrong, optionally says why, and submits. They can see that the request is pending and what they asked for.

**Why this priority**: This is the half of the problem that currently has no product surface at all. Without it there is nothing for HR to review.

**Independent Test**: Sign in as an employee, request a phone correction, and confirm it is recorded and visible as pending without the employee record changing.

**Acceptance Scenarios**:

1. **Given** an employee viewing My Profile, **When** they open a change request, **Then** the form shows the requestable fields pre-filled with their current values.
2. **Given** an employee has changed one or more fields, **When** they submit, **Then** a pending request is recorded containing only the fields that actually differ, and their profile is **unchanged**.
3. **Given** an employee submits without changing anything, **When** they submit, **Then** they are told there is nothing to request and no request is created.
4. **Given** an employee has a pending request, **When** they view My Profile, **Then** they see it is awaiting HR with what they asked for.
5. **Given** an employee has a pending request, **When** they try to open another, **Then** they are directed to the existing one rather than creating a competing second request.
6. **Given** HR has declined a request, **When** the employee views My Profile, **Then** they see it was declined and the reason given.

---

### User Story 2 - HR reviews and applies in one action (Priority: P1)

HR sees how many requests are waiting, opens the queue, reads current-versus-requested side by side, and either approves — which writes the change to the employee record immediately — or declines with a reason.

**Why this priority**: Equal to Story 1 — a request nobody can action is worse than no request at all. Together these two are the minimum viable feature.

**Independent Test**: With a pending request, approve it as HR and confirm the employee record now holds the new values and the request is closed.

**Acceptance Scenarios**:

1. **Given** pending requests exist, **When** HR views the admin area, **Then** a count of waiting requests is visible without opening anything.
2. **Given** HR opens a request, **When** they read it, **Then** each changed field shows its current value beside the requested value, plus who asked, when, and any reason given.
3. **Given** HR approves, **When** the action completes, **Then** every changed field in the request is written to the employee record, the request is closed as approved, and it leaves the pending count.
4. **Given** HR declines with a reason, **When** the action completes, **Then** the employee record is unchanged and the reason is recorded and shown to the employee.
5. **Given** a request has been decided, **When** anyone views it later, **Then** the decision, the deciding admin, and the timestamp are visible.
6. **Given** HR is not an admin, **When** they attempt to approve, **Then** the action is refused — approval authority is server-enforced, not a hidden button.

---

### User Story 3 - HR is warned when an approval touches priced data (Priority: P2)

When a request changes a date of birth or a dependant for an employee who already has a committed medical premium, HR sees that fact on the approval screen, before deciding.

**Why this priority**: Prevents a silent inconsistency between the record and what the company is paying an insurer. Not required for the queue to work, so it follows the first two — but it is the reason those fields need care rather than a plain edit.

**Independent Test**: Commit medical for an employee, request a date-of-birth correction, and confirm HR sees the warning on approval.

**Acceptance Scenarios**:

1. **Given** an employee with a committed medical premium, **When** HR reviews a request changing their date of birth, **Then** the screen states that a committed premium exists and was priced on the current date of birth.
2. **Given** the same, **When** HR approves, **Then** the record is corrected and the committed premium is **not** silently repriced — the warning tells HR the commitment needs their separate attention.
3. **Given** an employee with no committed medical premium, **When** HR reviews a date-of-birth request, **Then** no warning is shown.
4. **Given** a request removes a dependant who is covered by a committed medical premium, **When** HR reviews it, **Then** the warning names that dependant as covered.

---

### Edge Cases

- **The record changed while the request was pending.** HR may edit the employee directly between submission and approval. The "current" side of the comparison must reflect the record **at review time**, not at submission, so HR never approves a change against a value that has since moved.
- **The employee's request is already true.** By approval time the record may already hold the requested value. Approving must be harmless.
- **A second request while one is pending.** One open request per employee at a time; a new proposal replaces or amends rather than racing.
- **A declined request is resubmitted unchanged.** Permitted — the employee may have new justification — but HR should see it has been declined before.
- **The employee leaves while a request is pending.** The request must not silently apply to a departed employee's record; it stays visible for HR to close.
- **Dependants are not a simple field.** A dependant request may add, remove, or correct one — so it is a set of changes, not a single before/after value, and must display as such.
- **A date of birth that would move someone into a different medical age band.** The warning must be shown regardless of whether the band actually changes; HR decides.
- **An empty or whitespace-only value on a field that requires one.** Rejected at submission rather than stored and approved into the record.
- **Two admins open the same request.** The second decision must not overwrite the first — a decided request is closed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Employees MUST be able to submit a change request for their own record from My Profile, pre-filled with their current values.
- **FR-002**: The system MUST restrict requestable fields to: phone; emergency contact name, relationship, and phone; date of birth; marital status; and dependants.
- **FR-003**: The system MUST record only the fields whose requested value differs from the current value.
- **FR-004**: The system MUST reject a submission containing no actual change.
- **FR-005**: Submitting a request MUST NOT alter the employee record.
- **FR-006**: The system MUST allow at most one open request per employee at a time.
- **FR-007**: Employees MUST be able to see the status of their request and, when declined, the reason.
- **FR-008**: The system MUST show HR a count of pending requests without requiring them to open the queue.
- **FR-009**: The system MUST show HR, per request, each changed field's current value alongside the requested value, the requester, the submission time, and any reason given.
- **FR-010**: The current value shown to HR MUST be read at review time, so a record changed since submission is never misrepresented.
- **FR-011**: Approving MUST write every changed field in the request to the employee record in a single action.
- **FR-012**: Declining MUST leave the record unchanged and MUST capture a reason.
- **FR-013**: The system MUST record, for every decided request, the decision, the deciding admin, and the decision time.
- **FR-014**: The system MUST enforce approval authority on the server, refusing decisions from non-admins.
- **FR-015**: The system MUST warn HR, before they decide, when approving would change a date of birth or dependants for an employee holding a committed medical premium, and MUST name a covered dependant when one is being removed.
- **FR-016**: Approving such a request MUST NOT silently reprice or alter an existing medical commitment.
- **FR-017**: The system MUST prevent a second decision on an already-decided request.
- **FR-018**: The system MUST NOT send email for any part of this workflow.

### Key Entities

- **Profile change request**: An employee's proposal to correct their own record. Holds who asked, when, an optional reason, the set of proposed field values, its status (pending, approved, declined), and — once decided — the deciding admin, the time, and any decline reason.
- **Requested field change**: One field within a request: which field, and the value proposed for it. A dependant change additionally carries whether it is an addition, a removal, or a correction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can propose a correction to their own record without contacting anyone, and can see its status afterwards.
- **SC-002**: HR applies an approved correction in a single action, with no field re-typed by hand — eliminating transcription as a source of error.
- **SC-003**: HR can tell at a glance how many corrections are waiting, without opening a queue or an inbox.
- **SC-004**: Every applied correction carries a record of who asked, who approved, and when — where today an inbox message leaves no trace on the record.
- **SC-005**: No correction to date-of-birth or dependants is approved for an employee with committed medical cover without HR having been shown that fact first.
- **SC-006**: The employee record is never modified by anything other than an HR decision.

## Assumptions

- **A request is decided as a whole**, not field by field. A correction is typically one or two related fields, and unit decisions keep the approval a single action. Per-field approval was considered and deferred; if HR disagrees with part of a request they decline it with a reason and the employee resubmits. Flagged for confirmation at planning.
- **Approval applies immediately** rather than being staged for a later batch — the approval *is* the edit, which is the point of the feature.
- **Job and employment data stay out of scope**: title, department, salary, employment type, tenure band, start date, reporting line, business unit, role. These are HR-authoritative and drive pay, benefits eligibility, and the org chart; correcting them is a conversation, not a form.
- **An employee sees only their own requests.** HR sees all.
- **Notification is a badge in the app**, consistent with the standing rule that email is limited to the benefit-claim workflow.
- **Declined requests are retained**, not deleted, so the history of what was asked survives.
- **Phone becomes requestable rather than directly editable.** The decisions log records phone as employee-editable, but no such surface was ever built; routing it through the same review keeps one consistent path rather than two.

## Dependencies

- The employee registry (the record being corrected), which Directory, Onboarding, Benefits, and Dashboard all read.
- The dependants record, shared with medical cover pricing.
- Existing medical commitments, to determine whether the pricing warning applies.
- The admin area and its existing role gating.

## Out of Scope

- Editing job, employment, or compensation data by request.
- HR-initiated change proposals — HR already edits directly.
- Per-field approval within one request.
- Any repricing or adjustment of an existing medical commitment; the warning informs HR, who acts separately.
- Email or push notification of any kind.
- Employees requesting changes to anyone else's record.
