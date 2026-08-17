# Feature Specification: Profile Change Requests

**Feature Branch**: `029-profile-change-requests`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Employees cannot edit their own profile; HR makes every change, and asking by message overloads HR. Let an employee propose a correction to their own record from My Profile: they pick the fields, enter the new values and an optional reason, and submit. HR gets a queue with a pending count, sees current vs requested side by side, and approves (which applies the change to the employee record in one click) or declines with a reason. Requestable fields: contact details (phone, emergency contact name/relationship/phone), personal details (date of birth, marital status), and dependants (spouse and children). Date of birth and dependants drive medical premium pricing, so HR must be warned on the approval screen when an approval would affect an employee with a committed medical premium. No email notifications — an in-app badge only, consistent with email being limited to the benefit-claim workflow."

## Context

My Profile is currently **read-only in full**. There is no self-edit anywhere on it — not even for phone, which the decisions log records as employee-editable but which was never built. So today an employee who spots a stale emergency contact or a mistyped date of birth has no route through the product at all; they message HR, and HR retypes it.

Phone is the exception and is handled separately here: it is the employee's own contact number, it drives nothing but reachability, and the decisions log already grants them the right to change it. It becomes **directly editable**, with no review — routing it through an approval queue would add a person to a change nobody else depends on.

That is the actual problem: not that employees lack edit rights (that is deliberate — the employee registry is the backbone every other module reads), but that the **correction has to travel through a person's inbox** and be manually re-entered, with no record of who asked, when, or whether it was done.

This feature keeps HR as the sole authority over the record while removing the retyping and the inbox. The employee proposes; HR reviews a before-and-after and approves; approving *is* the edit.

**Dependants price medical cover**, so a request that adds or removes one is not a clerical correction — it changes who the company is insuring. HR sees that on the approval screen.

Date of birth is treated differently, on the product owner's judgement: dates are verified against legal documents at hire, so a date-of-birth request is a rare transcription fix rather than new information, and warning on it would be noise. Age is snapshotted at commit in any case, so correcting a date cannot retroactively reprice a commitment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An employee proposes a correction (Priority: P1)

An employee notices something wrong on their profile, opens a change request from that page, edits the fields that are wrong, optionally says why, and submits. They can see that the request is pending and what they asked for.

**Why this priority**: This is the half of the problem that currently has no product surface at all. Without it there is nothing for HR to review.

**Independent Test**: Sign in as an employee, request an emergency-contact correction, and confirm it is recorded and visible as pending without the employee record changing.

**Acceptance Scenarios**:

1. **Given** an employee viewing My Profile, **When** they open a change request, **Then** the form shows the requestable fields pre-filled with their current values.
1b. **Given** an employee viewing My Profile, **When** they edit their phone number, **Then** it saves directly to their record with no request created and no HR review.
2. **Given** an employee has changed one or more fields, **When** they submit, **Then** a pending request is recorded containing only the fields that actually differ, and their profile is **unchanged**.
3. **Given** an employee submits without changing anything, **When** they submit, **Then** they are told there is nothing to request and no request is created.
4. **Given** an employee has a pending request, **When** they view My Profile, **Then** they see it is awaiting HR with what they asked for.
5. **Given** an employee has a pending request, **When** they try to open another, **Then** they are directed to the existing one rather than creating a competing second request.
6. **Given** HR has declined a request, **When** the employee views My Profile, **Then** they see it was declined and the reason given.

---

### User Story 2 - HR reviews and applies field by field (Priority: P1)

HR sees how many requests are waiting, opens the queue, reads current-versus-requested side by side, and decides **each field on its own** — approving the ones they accept, which writes those changes immediately, and declining the rest with a reason.

**Why this priority**: Equal to Story 1 — a request nobody can action is worse than no request at all. Together these two are the minimum viable feature.

**Independent Test**: With a pending two-field request, approve one field and decline the other as HR, then confirm the record holds only the approved value and the employee sees both outcomes.

**Acceptance Scenarios**:

1. **Given** pending requests exist, **When** HR views the admin area, **Then** a count of waiting requests is visible without opening anything.
2. **Given** HR opens a request, **When** they read it, **Then** each changed field shows its current value beside the requested value, plus who asked, when, and any reason given.
3. **Given** HR approves a field, **When** the action completes, **Then** that field alone is written to the employee record and marked approved; fields not yet decided are untouched.
4. **Given** HR declines a field with a reason, **When** the action completes, **Then** that field is not written, and the reason is recorded and shown to the employee against that field.
5. **Given** HR approves some fields and declines others in one request, **When** they finish, **Then** only the approved fields appear on the employee record and the employee sees the outcome and reason per field.
6. **Given** every field in a request has been decided, **When** the last one is decided, **Then** the request leaves the pending count.
7. **Given** a field has been decided, **When** anyone views it later, **Then** the decision, the deciding admin, and the timestamp are visible for that field.
8. **Given** a viewer is not an admin, **When** they attempt to approve, **Then** the action is refused — approval authority is server-enforced, not a hidden button.

---

### User Story 3 - HR is warned when a dependant change touches insured cover (Priority: P2)

When a request adds or removes a dependant for an employee who already has a committed medical premium, HR sees that fact on the approval screen, before deciding.

**Why this priority**: A dependant change alters who the company is insuring, not just what the record says. Not required for the queue to work, so it follows the first two — but it is the reason dependants need care rather than a plain edit.

**Independent Test**: Commit medical for an employee covering a dependant, request that dependant's removal, and confirm HR sees the warning on approval.

**Acceptance Scenarios**:

1. **Given** an employee with a committed medical premium, **When** HR reviews a request removing a dependant that premium covers, **Then** the screen states a committed premium exists and names that dependant as covered.
2. **Given** an employee with a committed medical premium, **When** HR reviews a request adding a dependant, **Then** the screen states that a commitment already exists and the new dependant is not covered by it.
3. **Given** the same, **When** HR approves, **Then** the record changes and the committed premium is **not** silently repriced — the warning tells HR the commitment needs their separate attention.
4. **Given** an employee with no committed medical premium, **When** HR reviews a dependant request, **Then** no warning is shown.

---

### Edge Cases

- **The record changed while the request was pending.** HR may edit the employee directly between submission and approval. The "current" side of the comparison must reflect the record **at review time**, not at submission, so HR never approves a change against a value that has since moved.
- **The employee's request is already true.** By approval time the record may already hold the requested value. Approving must be harmless.
- **A second request while one is pending.** One open request per employee at a time; a new proposal replaces or amends rather than racing.
- **A declined request is resubmitted unchanged.** Permitted — the employee may have new justification — but HR should see it has been declined before.
- **The employee leaves while a request is pending.** The request must not silently apply to a departed employee's record; it stays visible for HR to close.
- **Dependants are not a simple field.** A dependant request may add, remove, or correct one — so it is a set of changes, not a single before/after value, and must display as such.
- **A date of birth that would move someone into a different medical age band.** No warning is shown: age is snapshotted at commit, so an existing commitment is unaffected, and the next commitment prices from the corrected date.
- **An empty or whitespace-only value on a field that requires one.** Rejected at submission rather than stored and approved into the record.
- **Two admins open the same request.** The second decision must not overwrite the first — a decided field is closed.
- **A request is partly decided and then abandoned.** Fields already approved stay applied; the request remains in the pending count until its remaining fields are decided, so it cannot be silently half-finished.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Employees MUST be able to submit a change request for their own record from My Profile, pre-filled with their current values.
- **FR-002**: The system MUST restrict requestable fields to: emergency contact name, relationship, and phone; date of birth; marital status; and dependants.
- **FR-002a**: Employees MUST be able to edit their own phone number directly on My Profile, without a request or review.
- **FR-002b** *(2026-08-17)*: Employees MUST be able to edit their own legal name (full official name as written on the national ID) directly on My Profile, without a request or review. It is visible to the employee and HR only — never the Team Directory.
- **FR-003**: The system MUST record only the fields whose requested value differs from the current value.
- **FR-004**: The system MUST reject a submission containing no actual change.
- **FR-005**: Submitting a request MUST NOT alter the employee record.
- **FR-006**: The system MUST allow at most one open request per employee at a time.
- **FR-007**: Employees MUST be able to see the status of their request and, when declined, the reason.
- **FR-008**: The system MUST show HR a count of pending requests without requiring them to open the queue.
- **FR-009**: The system MUST show HR, per request, each changed field's current value alongside the requested value, the requester, the submission time, and any reason given.
- **FR-010**: The current value shown to HR MUST be read at review time, so a record changed since submission is never misrepresented.
- **FR-011**: HR MUST be able to approve or decline **each requested field independently**, approving some while declining others in the same request.
- **FR-011a**: Approving a field MUST write that field to the employee record and leave every undecided field untouched.
- **FR-012**: Declining a field MUST leave that field unchanged on the record and MUST capture a reason against it.
- **FR-013**: The system MUST record, for every decided field, the decision, the deciding admin, and the decision time.
- **FR-013a**: A request MUST leave the pending count only once every field in it has been decided.
- **FR-014**: The system MUST enforce approval authority on the server, refusing decisions from non-admins.
- **FR-015**: The system MUST warn HR, before they decide, when approving would add or remove a dependant for an employee holding a committed medical premium, and MUST name the dependant as covered when the commitment covers them.
- **FR-016**: Approving such a request MUST NOT silently reprice or alter an existing medical commitment.
- **FR-017**: The system MUST prevent a second decision on an already-decided field.
- **FR-018**: The system MUST NOT send email for any part of this workflow.
- **FR-019**: An employee's own phone edit MUST NOT create a request, require review, or appear in HR's pending count.

### Key Entities

- **Profile change request**: An employee's proposal to correct their own record. Holds who asked, when, an optional reason, the set of proposed field values, its status (pending, approved, declined), and — once decided — the deciding admin, the time, and any decline reason.
- **Requested field change**: One field within a request: which field, and the value proposed for it. A dependant change additionally carries whether it is an addition, a removal, or a correction.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can propose a correction to their own record without contacting anyone, and can see its status afterwards.
- **SC-002**: HR applies an approved correction in a single action, with no field re-typed by hand — eliminating transcription as a source of error.
- **SC-003**: HR can tell at a glance how many corrections are waiting, without opening a queue or an inbox.
- **SC-004**: Every applied correction carries a record of who asked, who approved, and when — where today an inbox message leaves no trace on the record.
- **SC-005**: No dependant change is approved for an employee with committed medical cover without HR having been shown that fact first.
- **SC-007**: HR can accept the correct parts of a request and query the rest, without the employee having to resubmit what was already right.
- **SC-006**: The employee record is never modified by anything other than an HR decision.

## Assumptions

- **Each field is decided on its own.** Confirmed by the product owner: reviewing field by field lets HR accept an emergency contact while querying a date of birth, instead of rejecting a whole request over one line and making the employee resubmit the rest.
- **Approval applies immediately** rather than being staged for a later batch — the approval *is* the edit, which is the point of the feature.
- **Job and employment data stay out of scope**: title, department, salary, employment type, tenure band, start date, reporting line, business unit, role. These are HR-authoritative and drive pay, benefits eligibility, and the org chart; correcting them is a conversation, not a form.
- **An employee sees only their own requests.** HR sees all.
- **Notification is a badge in the app**, consistent with the standing rule that email is limited to the benefit-claim workflow.
- **Declined requests are retained**, not deleted, so the history of what was asked survives.
- **Phone is directly editable, not requested.** Confirmed by the product owner. It is the employee's own contact number and nothing else reads it for eligibility or money, so review would add friction without adding control. This realises the employee-self-edit decision already in the log, which had never been built.

## Dependencies

- The employee registry (the record being corrected), which Directory, Onboarding, Benefits, and Dashboard all read.
- The dependants record, shared with medical cover pricing.
- Existing medical commitments, to determine whether the pricing warning applies.
- The admin area and its existing role gating.

## Out of Scope

- Editing job, employment, or compensation data by request.
- HR-initiated change proposals — HR already edits directly.
- Any repricing or adjustment of an existing medical commitment; the warning informs HR, who acts separately.
- Email or push notification of any kind.
- Employees requesting changes to anyone else's record.

## Amendments

### 2026-08-17 — Unified attributes on My Profile (mockup-approved)
- **The request entry point moved onto the cards.** The Personal and Emergency contact cards each carry a "Request a change" button that opens the same form scoped to that card's fields; the bottom "Change requests" panel no longer hosts the form — it is the receipt (pending state, withdraw, HR's per-field decisions). While a request is awaiting HR the card buttons give way to an "Awaiting HR" chip (one open request at a time, FR-006, unchanged).
- **One ownership language.** HR-only cards (Contact, Employment) carry the same navy "Managed by HR" pill; the request button itself marks the requestable cards (no pill — a request path already says "not self-edit"); direct self-edit fields carry a gold "You edit" tag.
- **Legal name** (FR-002b) joined phone as the second direct self-edit field, on the Contact card. Stored as `User.legalName` (migration `051`); HR can view and correct it on the admin employee form.
- **Dependants render as one row each** (name · spouse/child · date of birth · derived age) instead of a comma-joined line.

### 2026-08-17 (later same day) — Edit↔Save toggle, red Cancel, dependants delivered (mockup-approved)
- **Self-edit fields rest closed.** Phone and Legal name show as plain values with a light-gold **Edit** button; pressing it opens the input and the button becomes a navy **Save** (pressing Save with nothing changed just closes — no server round trip). The "You edit" tag is retired — the button is the tag.
- **The request form's Cancel is solid red**, so it reads as an active control beside the navy Send.
- **Dependant changes are now requestable** — the R3 deferral is closed. The Personal card's form carries a dependants editor (correct a name or date of birth, add, remove; newly added rows highlighted); the whole list travels as ONE `dependants` field stored as canonical JSON text against the same registry, so HR approves or declines the set in a single decision. Approval replaces the dependant list (mirroring the admin form's write); `MedicalCoveredPerson` snapshots survive removal (the link just nulls). Rules match the HR form: every dependant needs a real, non-future date of birth; one spouse max.
- **US3 / FR-015 is built**: when a request proposes a dependant change and the employee has a committed medical premium, HR's review card leads with a warning naming the covered people and stating the premium is not recalculated automatically.
