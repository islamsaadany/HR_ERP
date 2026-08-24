# Feature Specification: Team Communications

**Feature Branch**: `039-team-communications`

**Created**: 2026-08-24

**Status**: Draft

**Input**: Product owner: a place in the admin to send email to employees — announcements and personal congratulations — branded per business unit under the Forefront Group. Shape agreed in conversation 2026-08-24; design approved at `design-mockups/communications/2026-08-24_ffg-email-design-v2.html`.

---

## Context

HR_ERP sends email in exactly two workflows today: benefit claims (spec 020) and the holiday/vacation cycle (spec 037). Both are **transactional** — one person receives one message because of something that happened to them. Both are env-gated, fire-and-forget, and master-toggleable at Admin → Notifications.

This is the **third** workflow and the first that is **broadcast**: many people receive a message because a person decided to send it. That difference is the source of most of the requirements below. A broadcast cannot be recalled.

It is also the first email that must carry **more than one identity**. Forefront Group holds several business units (Forefront Consulting, Visual Shift, and others), each with its own name and colours already stored on its record. A message must read as coming from the recipient's own unit while remaining visibly part of the group.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR sends an announcement to a chosen audience (Priority: P1)

An HR administrator has something to tell people — a new policy, a module going live, an office closure. They write it once, choose who should get it, see exactly how many people that is and what the email will look like, and send.

**Why this priority**: It is the whole reason the module exists, and it is the only story that delivers value on its own. Everything else refines or automates around it.

**Independent Test**: Write an announcement, select one department, confirm the count shown matches the department's active headcount, preview it, send, and verify each recipient received their own copy branded with their own unit.

**Acceptance Scenarios**:

1. **Given** an administrator has written an announcement and chosen an audience, **When** they open the preview, **Then** they see the message exactly as a recipient will see it, including that recipient's unit name and colours.
2. **Given** an audience of 148 people, **When** the administrator presses send, **Then** they are first shown a confirmation naming how many people are about to receive it, and nothing is sent until they confirm.
3. **Given** a sent announcement, **When** any recipient opens it, **Then** no other recipient's address is visible to them.
4. **Given** recipients in two different business units, **When** each opens their copy, **Then** each sees their own unit's name and colour, and both see the same words.
5. **Given** an announcement has been sent, **When** the administrator looks at it later, **Then** they can see when it went, to how many people, and whether any individual delivery failed.

---

### User Story 2 - A manager sends a congratulation the platform prepared (Priority: P2)

A manager is told there is a message waiting to go out — one of their people has a birthday or a joining anniversary in a few days. They open it, find it already written, adjust the wording to sound like them, add or remove the line about a gift, and send it.

**Why this priority**: It is the part that runs without anyone remembering a date, and it is where the platform earns its keep day to day. It depends on nothing from Story 1 except the email itself.

**Independent Test**: Set an employee's joining date to three days ahead, run the daily preparation, confirm a draft appears for their manager with the correct years, edit it, send it, and confirm only that employee received it.

**Acceptance Scenarios**:

1. **Given** an employee whose joining anniversary falls in three days, **When** the daily preparation runs, **Then** a draft congratulation exists, addressed to that employee and assigned to their line manager.
2. **Given** a draft is waiting, **When** the manager signs in, **Then** they see a count of messages waiting to send, and they receive one notification telling them so.
3. **Given** a draft is open, **When** the manager changes the wording and sends, **Then** the employee receives the manager's words, signed with the manager's name.
4. **Given** a draft exists, **When** nobody sends it and the occasion passes, **Then** it is recorded as missed and closed, and it is never sent late.
5. **Given** the daily preparation runs, **When** it finishes, **Then** no employee has received any email as a result of it.
6. **Given** an employee has no date of birth on record, **When** the preparation runs, **Then** no birthday draft is created for them and nothing is guessed.

---

### User Story 3 - An administrator proves email works before anyone else sees it (Priority: P3)

Before the first real message, an administrator wants to know the design is right, the sender name is right, and that mail actually reaches people other than themselves.

**Why this priority**: It prevents the failure mode that costs the most credibility — a first broadcast that looks wrong or silently reaches nobody. It is small, and it is worth doing before Story 1 is used in anger.

**Independent Test**: Open the setup page, read the delivery-readiness statement, send a test to yourself, and compare it against the on-screen preview.

**Acceptance Scenarios**:

1. **Given** the setup page is open, **When** the administrator reads it, **Then** it states plainly whether messages can currently reach everyone, only the account owner, or nobody, and why.
2. **Given** an administrator presses "send me a test", **Then** they receive a message showing the real design, the real sender name and the real sending address.
3. **Given** the preview and a real send of the same message, **When** compared, **Then** they are identical.

---

### User Story 4 - HR watches the queue so nothing is quietly missed (Priority: P3)

HR can see every congratulation waiting to be sent across the company, and can send one themselves when the manager is away.

**Why this priority**: Without it, a manager on holiday means a birthday silently missed and nobody knows until the person mentions it. It is a safety net, not a primary flow.

**Independent Test**: Create drafts for two different managers' reports, confirm HR sees both, and send one as HR.

**Acceptance Scenarios**:

1. **Given** drafts exist for several managers, **When** HR opens the queue, **Then** they see all of them with whose they are and when each is due.
2. **Given** a draft assigned to an absent manager, **When** HR sends it, **Then** the employee receives it and the record shows HR sent it.

---

### Edge Cases

- **An employee has no business unit.** The header carries the message type in place of a unit name, and the group's own colour is used. Nothing is left blank and no unit is guessed.
- **A unit's colour makes text unreadable.** The text colour is worked out from the unit's colour rather than assumed; the colour itself is adjusted only when no text colour would be legible on it.
- **The manager is the subject.** A manager's own birthday draft goes to HR, not to themselves.
- **An employee has no manager.** The draft goes to HR.
- **A person's manager changes between preparation and sending.** The draft follows the org chart as it stands when it is opened, not a snapshot taken when it was prepared.
- **An employee leaves between preparation and the occasion.** The draft is withdrawn; a leaver receives nothing.
- **Delivery fails for one recipient in a large audience.** The failure names that person; the rest still arrive.
- **The audience is empty.** Sending is refused with the reason, rather than reporting a successful send to nobody.
- **The same occasion prepared twice.** One draft per person per occasion per year; a second preparation run changes nothing.
- **Email is switched off, or not configured.** Every screen still works and drafts still accumulate; sending is refused with a plain reason, never silently swallowed.
- **Two people open the same draft.** The second person to send is told it has already gone, rather than sending a duplicate.
- **A birthday falls on 29 February.** The occasion is observed on 28 February in years that have no 29th, rather than skipped.

---

## Requirements *(mandatory)*

### Identity and branding

- **FR-001**: Every email the platform sends MUST use ONE template. There MUST NOT be a separate template per business unit.
- **FR-002**: The email header MUST carry the group's name in small type above the recipient's business unit name in larger type.
- **FR-003**: The header background and the action button MUST take the recipient's business unit colour; a fixed group marker MUST appear on every email regardless of unit.
- **FR-004**: The message body MUST be dark text on a light ground for every unit. A unit's colour MUST NOT tint the reading area.
- **FR-005**: Text placed on a unit's colour MUST be DERIVED from that colour so that it meets a contrast ratio of at least 4.5:1. The unit's stored colour MUST be used unchanged whenever either light or dark text meets that ratio, and MUST be adjusted by the smallest amount that achieves it only when neither does.
- **FR-006**: Branding MUST be read from the existing business unit record. The feature MUST NOT introduce a new organisational layer above business units.
- **FR-007**: A recipient with no business unit MUST receive a well-formed email carrying the message type in place of a unit name and the group's own colour.
- **FR-008**: The sending address MUST remain a single environment-held value. The display name MUST be an in-app setting, and changing it MUST apply to every email the platform sends, including the two existing workflows.
- **FR-009**: The email MUST render correctly in mail clients that do not support modern web layout, and MUST NOT depend on stylesheets, embedded image data, or colour variables.

### Announcements

- **FR-010**: An authorised person MUST be able to compose an announcement with a subject, a body of several paragraphs, and an optional link with a label.
- **FR-011**: The audience MUST be chosen through the SAME derivation the Learning module uses — departments, groups, named people, business units, tenure, employment type, and a manager's team — with each choice showing how many people it reaches today.
- **FR-012**: The audience derivation MUST be shared with the Learning module rather than duplicated. Two implementations of "who does this reach" MUST NOT exist.
- **FR-013**: Announcements MUST NOT be created automatically. An announcement exists because a person wrote one.
- **FR-014**: Before sending, the sender MUST be shown a confirmation naming how many people will receive the message, and MUST be able to cancel.
- **FR-015**: Sending to an empty audience MUST be refused with the reason.
- **FR-016**: A sent announcement MUST retain what was sent, to whom, by whom, and when — and MUST NOT be editable afterwards.

### Congratulations

- **FR-017**: The platform MUST prepare congratulations for birthdays and for joining anniversaries, from dates already held in the employee registry.
- **FR-018**: Preparation MUST happen a configurable number of days before the occasion, defaulting to three.
- **FR-019**: A congratulation MUST be addressed to the employee alone. It MUST NOT be sent to their colleagues.
- **FR-020**: A birthday message MUST NOT state the person's age. An anniversary message MUST state the number of years.
- **FR-021**: A draft MUST be assigned to the employee's line manager as the org chart stands, falling back to HR when the employee has no manager or when the manager is the subject of the message.
- **FR-022**: The assignee MUST be able to edit every word before sending.
- **FR-023**: A sent congratulation MUST be signed with the name of the person who sent it.
- **FR-024**: An employee with no recorded date of birth MUST generate no birthday draft, and no date MUST be inferred.
- **FR-025**: At most one draft MUST exist per person, per occasion, per year, however many times preparation runs.
- **FR-026**: A draft not sent by the day of the occasion MUST be recorded as missed and closed. It MUST NOT be sent afterwards.
- **FR-027**: A draft for someone who has left MUST be withdrawn before it can be sent.

### Nothing sends itself

- **FR-028**: No scheduled process MUST send email to an employee. Scheduled work prepares drafts and notifies operators only.
- **FR-029**: Every message reaching an employee MUST be the result of a person choosing to send it.
- **FR-030**: An assignee MUST be told that messages are waiting, both by a count visible while they use the platform and by a single notification to them.
- **FR-031**: HR MUST be able to see every pending draft across the company and send any of them.
- **FR-032**: A draft already sent MUST NOT be sendable a second time, and the second person to try MUST be told it has already gone.

### Sending

- **FR-033**: Each recipient MUST receive their own message. No recipient MUST be able to see another recipient's address.
- **FR-034**: A delivery failure MUST identify which recipient failed and MUST NOT prevent the others from arriving.
- **FR-035**: The on-screen preview and the delivered email MUST be produced by the same source, so a preview can never show something a recipient would not receive.
- **FR-036**: An administrator MUST be able to send themselves a test showing the real design, the real display name and the real sending address.
- **FR-037**: The setup screen MUST state plainly whether messages can currently reach everyone, only the account owner, or nobody — and MUST say when it could not find out, rather than reporting a state it did not verify.
- **FR-038**: With email switched off or unconfigured, every screen MUST continue to work and drafts MUST continue to accumulate; a send attempt MUST be refused with a plain reason.

### Boundaries

- **FR-039**: Recipients MUST be active employees of the company. The feature MUST NOT send to external addresses.
- **FR-040**: There MUST be no employee opt-out. A congratulation may carry information the person needs.
- **FR-041**: The feature MUST NOT send marketing email, and MUST NOT schedule a send for a future time.

### Defect to correct in passing

- **FR-042**: The eyebrow text on the existing emails' header MUST meet a contrast ratio of at least 4.5:1 against its background. It currently measures 4.33:1.

---

### Key Entities

- **Message**: Something that goes to people. Carries its type (announcement or congratulation), its subject, its body, an optional link, who wrote or last edited it, and its state — draft, sent, or missed.
- **Message Audience**: For an announcement, the set of choices describing who receives it — the same shape the Learning module uses for course access.
- **Message Delivery**: One person's copy of one message: who it went to, which business unit branded it, when it was accepted, and whether it failed.
- **Occasion**: A birthday or a joining anniversary for one person in one year — what a congratulation draft is prepared from, and what stops a second draft being made for the same event.
- **Communication Settings**: The display name messages are sent under, how many days ahead congratulations are prepared, and whether sending is on at all.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can write an announcement, choose who gets it, and send it in under five minutes without help.
- **SC-002**: Every recipient of a branded message sees their own unit's name, and no recipient sees another recipient's email address.
- **SC-003**: Text on a unit's colour meets a 4.5:1 contrast ratio for every colour a unit can be given, without anyone having to think about contrast when choosing one.
- **SC-004**: Across a full year, no birthday or joining anniversary with a date on record passes without a draft having been prepared for it.
- **SC-005**: No employee receives an email that a person did not press send on.
- **SC-006**: A manager learns a message is waiting within one working day of it being prepared.
- **SC-007**: An administrator can tell whether email will reach the company without sending anything to the company.
- **SC-008**: What is previewed and what is delivered are the same in every case.
- **SC-009**: A message sent to 100 or more people either arrives or names precisely who it did not reach.
- **SC-010**: No congratulation arrives after the day it was for.

---

## Assumptions

- **The group is a business unit, not a new layer.** Forefront Group is represented as a business unit marked as the default, because everything an email needs — name, colours — already lives on that record. A parent-child hierarchy is not introduced; it would earn its place only if units needed to inherit values from a parent, which they do not.
- **One sending domain.** Per-unit sending addresses would require verifying each brand's domain with the mail provider, which is an operational task rather than a product one. Unit identity is carried by the display name and the design instead.
- **Unit logos cannot appear in the email.** Logos are stored privately and served only to signed-in users; a mail client fetching one is not signed in, and embedded image data is blocked by the two most common mail clients. The design is typographic as a result. Serving logos publicly is a separate decision and is not assumed here.
- **The existing workflows' sender name changes with this one.** There is a single display name for everything the platform sends. This is intended — one voice — but it is a visible change to email already in use.
- **Congratulations are personal, announcements are not.** A congratulation goes to one person and may name a gift, which is only safe because nobody else is on it. Telling the team about someone's anniversary, if wanted, is an announcement somebody writes.
- **The audience derivation already exists.** The Learning module's access setup answers the same question and is assumed to be extracted and shared rather than copied.
- **Delivery is best-effort per person.** The platform records what the mail provider accepted; what happens after that — a full mailbox, a spam folder — is outside what it can know or report.
- **Volume is modest.** The company is in the low hundreds. Nothing here is designed for tens of thousands of recipients.
