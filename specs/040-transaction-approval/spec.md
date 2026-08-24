# Feature Specification: Transaction Approval & Monthly Salary Batches

**Feature Branch**: `claude/finance-petty-cash-payroll-we46wn`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "Finance informs the CEO of any payment they make so the CEO can give the final transaction approval — the CEO performs the final confirmation in the bank, so an email is needed the moment Finance has entered a transaction. The same is needed for the monthly salaries: when Finance records the payroll on the banking side, they submit it on the platform and the CEO receives an email to approve the transactions. This may need a new authority in the release of amounts."

## Overview

Forefront's bank works maker–checker: **Finance enters** a transfer and **the CEO confirms** it
before the money moves. Today nothing connects the two halves — Finance enters a payment, then tells
the CEO by WhatsApp or in person, and the CEO confirms in the bank with no record of what was
approved, when, or against which request. Monthly salaries have the same gap and higher stakes.

This feature gives that hand-off a home. Finance groups what they have entered in the bank into a
**payment run**, submits it, and the appointed **Transaction Approver** — the CEO — receives an
email with the total, the count, and a link. They confirm in the bank as they always have, then mark
the run approved on the platform. The run is the record: what was in it, what it totalled, who
submitted it, who approved it, and when.

The **monthly salary batch** rides the same mechanism, holding only what the approval needs — the
month, the total, the headcount and the bank reference. **No per-employee salary is stored or
displayed**, so the confidentiality rule that keeps salary to Super Users alone is untouched
(confirmed with the CEO, 2026-08-24).

**In scope**: the Transaction Approver appointment, payment runs over the payables that spec 039
creates, the monthly salary batch, the approval email, and the approval record.

**Out of scope**: executing any transfer (the bank does that), per-employee payroll registers,
payslips, and any change to how amounts are decided — this feature approves payments, it never
computes them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finance submits what they entered in the bank (Priority: P1)

Finance has approved a handful of payback requests and a petty cash settlement. They enter the
transfers in the bank, then on the platform they select those items, add the bank reference and the
value date, optionally attach the bank's confirmation file, and submit the run. The run's total is
fixed at that moment, and its items are locked — nothing in a submitted run can change underneath
the person approving it.

**Why this priority**: This is the maker half of maker–checker and the thing that has no record at
all today. It is testable and useful on its own: even before anyone approves, Finance finally has a
list of what was sent to the bank and when.

**Independent Test**: As Finance, select two approved payback requests and one petty cash top-up,
submit them as a run with a reference and value date; confirm the run shows the correct total and
item count, and that the underlying items can no longer be edited or re-submitted in another run.

**Acceptance Scenarios**:

1. **Given** three payables awaiting payment, **When** Finance submits them as one run, **Then** the
   run records the total, the item count, the bank reference, the value date, who submitted it, and
   when.
2. **Given** an item already sitting in a submitted run, **When** Finance tries to add it to another
   run, **Then** it is refused — an item belongs to at most one run.
3. **Given** a submitted run, **When** anyone attempts to add, remove or alter its items or amounts,
   **Then** the attempt is refused; the correction path is to withdraw the whole run.
4. **Given** a submitted run that has not yet been approved, **When** Finance withdraws it with a
   reason, **Then** its items return to awaiting-payment and the withdrawal is recorded.
5. **Given** an employee who is not Finance or a Super User, **When** they attempt to create or
   submit a run, **Then** the attempt is refused server-side.

---

### User Story 2 - The approver is emailed and confirms (Priority: P1)

The moment a run is submitted, everyone appointed as Transaction Approver receives an email: what
kind of run it is, its total, how many items, who submitted it, and a link straight to it. The
approver opens it, sees each item — who is being paid, for what, and how much, with the evidence one
click away — confirms the transfers in the bank, and marks the run approved. The people being paid
are told at that point, not before: nothing is called "paid" until the money is actually released.

**Why this priority**: This is the request in one sentence — *"I need a notification on my email that
he made the transaction as finance"* — and the control the whole feature exists to provide.

**Independent Test**: Appoint an approver, submit a run as Finance, and confirm the approver's
address receives the email with the correct total and a working link; approve the run and confirm
each payback requester is notified that they were paid, and that the run's approver, time and total
are recorded.

**Acceptance Scenarios**:

1. **Given** at least one appointed approver and email switched on, **When** Finance submits a run,
   **Then** each approver receives an email naming the run type, total, item count, submitter, and a
   link to it.
2. **Given** a submitted run, **When** the approver approves it, **Then** its items become **Paid**,
   each payback requester is notified, and the approval records who approved, when, and the total
   they were shown.
3. **Given** a submitted run, **When** the approver sends it back with a note (queried), **Then** it
   returns to Finance with the note, its items stay awaiting-payment, and nobody is told they were
   paid.
4. **Given** a user who is neither an appointed approver nor a Super User, **When** they attempt to
   approve or query a run, **Then** the attempt is refused server-side.
5. **Given** email is switched off or unconfigured, **When** Finance submits a run, **Then** the run
   is still created and visible to the approver in the app, and no error is shown to Finance.
6. **Given** the approver approved a run, **When** anyone views it later, **Then** it is read-only
   and shows the full trail: submitted by/when, approved by/when, total, items, bank reference.

---

### User Story 3 - The monthly salary batch (Priority: P1)

Finance records the month's payroll in the bank, then submits a salary batch on the platform: the
month, the total transferred, how many people it covers, the bank reference, an optional note, and
optionally the bank's file. The approver is emailed exactly as for any other run, confirms in the
bank, and approves. No individual's salary appears anywhere in this flow.

**Why this priority**: Explicitly asked for, the largest sum the company moves, and the case where
an unrecorded approval matters most. It is independent of spec 039 entirely — it needs no payback
request and no petty cash account to work.

**Independent Test**: As Finance, submit a salary batch for a month with a total and a headcount;
confirm the approver is emailed, that approving it records the trail, that a second batch for the
same month is refused unless it is explicitly marked a supplementary run, and that no per-person
figure is stored or shown anywhere.

**Acceptance Scenarios**:

1. **Given** Finance, **When** they submit a salary batch with month, total, headcount and bank
   reference, **Then** it is created as a run awaiting approval and the approver is emailed.
2. **Given** a salary batch already submitted for a month, **When** Finance submits another for the
   same month, **Then** it is refused unless flagged as a supplementary run with a reason.
3. **Given** any salary batch, **When** anyone views it — approver, Finance, or Super User —
   **Then** it shows only month, total, headcount, reference, note and attachment; no per-employee
   amount exists to show.
4. **Given** an HR Admin, **When** they attempt to view salary batches, **Then** access is denied —
   salary totals stay with Finance, the approver, and Super Users.

---

### User Story 4 - A Super User appoints the approver (Priority: P2)

A Super User opens the governance settings and appoints one or more people as Transaction Approver.
The appointment does not change their role or anything else they can see — it only grants the right
to approve payment runs. Super Users can always approve, so an empty appointment list can never
leave the company unable to release money, and only a Super User may appoint.

**Why this priority**: Needed for the emails to reach the right person, but Super Users hold the
authority implicitly, so stories 1–3 work before anyone is appointed.

**Independent Test**: As a Super User, appoint an employee as Transaction Approver; confirm they can
open and approve runs and receive the emails, that nothing else about their access changes, and that
they cannot appoint anyone else.

**Acceptance Scenarios**:

1. **Given** a Super User, **When** they appoint an active employee as Transaction Approver,
   **Then** that person can approve runs and receives the submission emails.
2. **Given** an appointed approver who is not a Super User, **When** they attempt to appoint or
   remove another approver, **Then** it is refused — the appointment cannot appoint.
3. **Given** no appointed approvers at all, **When** Finance submits a run, **Then** Super Users can
   still approve it and are emailed, so nothing stalls.
4. **Given** an approver who leaves the company, **When** their employment ends, **Then** they stop
   receiving emails and can no longer approve.

---

### User Story 5 - The approver is reminded of what is waiting (Priority: P3)

A run submitted yesterday and still unapproved is money that has not moved and someone who has not
been paid. Once a day, if anything has been waiting longer than a configurable number of days, the
appointed approvers get one summary email listing what is outstanding. Nothing goes to anyone else.

**Why this priority**: A genuine improvement, but the email at submission already does the main job;
this only catches what slipped.

**Independent Test**: Submit a run, move its submission date past the threshold, run the daily job,
and confirm exactly one summary email reaches the approvers and none reaches anyone else.

**Acceptance Scenarios**:

1. **Given** a run pending longer than the configured lead, **When** the daily job runs, **Then**
   each approver receives one summary email listing the pending runs and their totals.
2. **Given** no run is pending beyond the lead, **When** the daily job runs, **Then** no email is
   sent at all.
3. **Given** the daily job, **When** it runs, **Then** it never emails anyone other than the
   appointed approvers and Super Users.

---

### Edge Cases

- **An item's amount changes after the run is submitted.** Impossible by design: submission locks
  the items. If a figure was wrong, the run is withdrawn, corrected and re-submitted — and the
  approver sees a fresh submission rather than a silently altered one.
- **The approver approves a run they were emailed hours ago.** The run shows the total it was
  submitted with, which is the total the email carried; there is no path by which the two can
  differ.
- **Two approvers open the same run.** The first decision wins; the second sees the run already
  decided, by whom and when, rather than an error.
- **Finance approves their own run.** Refused — a Finance user, or an appointed approver, may never
  decide a run they submitted. A **Super User** is the single exception and may complete both halves
  alone; the run records that the same person submitted and approved it, so it is visible rather
  than silent.
- **A run with no items.** Refused at submission.
- **The bank rejects a transfer after the run was approved.** The run stays approved as the historic
  record; Finance raises the correction as new payables. Approved runs are never rewritten.
- **Email switched off, unconfigured, or bouncing.** Runs are still created and approved in the app;
  no state change is ever blocked by email.
- **A salary batch for a month that never gets approved.** It stays pending and appears in the
  reminder; it is never auto-approved and never expires.

## Requirements *(mandatory)*

### Functional Requirements

**Authority**

- **FR-001**: The right to approve payment runs MUST be a per-person **appointment**, not a new role
  value: an appointed person's role and everything else they can see MUST be unchanged by it.
- **FR-002**: The system MUST answer "may this person approve?" from **one** derivation used by
  every screen, action, email recipient list and serving route: they hold the appointment, or they
  are a Super User.
- **FR-003**: Super Users MUST hold the authority implicitly and MUST NOT be rows in the appointment
  list, so that emptying the list can never leave the company unable to approve.
- **FR-004**: Only a Super User MUST be able to appoint or remove an approver — the appointment MUST
  NOT be able to appoint.
- **FR-005**: A person who is no longer an active employee MUST NOT be able to approve and MUST NOT
  be emailed.

**Payment runs**

- **FR-006**: Finance (or a Super User) MUST be able to group payables — approved payback requests
  and petty cash funding movements from spec 039 — into a payment run carrying a bank reference, a
  value date, an optional note and an optional attachment.
- **FR-007**: Submitting a run MUST fix its total and lock its items: no item may be added, removed,
  altered or placed in a second run while the run stands.
- **FR-008**: An item MUST belong to at most one run at a time.
- **FR-009**: Finance MUST be able to withdraw a submitted run before it is decided, with a reason;
  its items MUST return to awaiting-payment and the withdrawal MUST be recorded.
- **FR-010**: A run MUST move through: Submitted → Approved, Submitted → Queried (returned with a
  note, items released), or Submitted → Withdrawn. An approved run MUST be immutable thereafter.
- **FR-011**: The person who submitted a run MUST NOT be able to approve it — **except a Super
  User**, who MAY approve a run they submitted themselves (CEO's decision, 2026-08-24). Holding
  Finance, the Transaction Approver appointment, or both is never sufficient: those two halves stay
  separated for everyone below Super User.
- **FR-012**: Approving a run MUST record who approved it, when, and the total they were shown, and
  MUST move every item in it to **Paid**.
- **FR-013**: Notifying a person that they have been paid MUST happen on approval, never at
  submission.
- **FR-014**: A run MUST show the approver each item's payee, purpose, amount and evidence before
  they decide.

**Salary batches**

- **FR-015**: Finance MUST be able to submit a monthly salary batch carrying the month, the total
  transferred, the number of people covered, a bank reference, an optional note and an optional
  attachment — and MUST NOT be able to record any per-person amount.
- **FR-016**: The system MUST NOT store, display or export any individual's salary anywhere in this
  feature.
- **FR-017**: A second batch for a month already submitted MUST be refused unless it is explicitly
  marked supplementary, with a reason.
- **FR-018**: Salary batches MUST be visible only to Finance, appointed approvers and Super Users —
  an HR Admin MUST NOT be able to see them.
- **FR-019**: Salary batches MUST follow the same submit → email → approve path and the same
  immutability as any other run.

**Notification**

- **FR-020**: On submission the system MUST email every eligible approver with the run's type,
  total, item count, submitter and a direct link, honouring the existing master email switch.
- **FR-021**: Email failure or absence MUST never block, delay or roll back a submission or an
  approval.
- **FR-022**: A daily reminder MUST be able to email approvers a summary of runs pending beyond a
  configurable number of days, and MUST NOT email anyone else.

**Record**

- **FR-023**: Every run MUST retain its full trail — submitted by/when, items and amounts as
  submitted, decided by/when, decision and any note — and MUST remain readable after the fact.
- **FR-024**: Runs MUST be listable and filterable by status, type and date so Finance and the
  approver can see what is outstanding and what was released in a period.

### Key Entities

- **Transaction Approver appointment**: A row saying one person may approve payment runs. Carries
  who appointed them and when. Super Users are never rows here.
- **Payment run**: A group of payables entered in the bank together — type, bank reference, value
  date, note, attachment, submitted-by/at, fixed total, item count, status, decided-by/at, decision
  note.
- **Run item**: The link between a run and one payable (a payback request or a petty cash funding
  movement), with the amount as submitted.
- **Salary batch**: A run whose subject is a month's payroll — month, total, headcount, reference,
  supplementary flag and reason. No per-person data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The CEO learns that a transaction is waiting for confirmation within one minute of
  Finance entering it in the bank, without anyone messaging them.
- **SC-002**: Every released payment — payback, petty cash funding or payroll — is traceable to the
  person who submitted it, the person who approved it, and the moment each acted.
- **SC-003**: No payment run can be approved by the person who submitted it in any configuration of
  Finance and Transaction Approver rights; only a Super User can, and when they do, the run shows
  both halves as theirs.
- **SC-004**: An employee is told they were paid only after the money was actually released, never
  before.
- **SC-005**: The total the approver was emailed always equals the total they approve — the two can
  never diverge.
- **SC-006**: No individual salary figure is stored, shown or exported by this feature, verifiable
  by inspection of what a salary batch holds.

## Assumptions

- **The bank remains the system of record for money movement.** The platform records intent and
  approval; it never initiates a transfer.
- **The approval follows the bank entry, not the other way round** (confirmed with the CEO,
  2026-08-24): Finance enters the transfer in the bank and submits here; the CEO confirms in the
  bank and marks it approved. No amount threshold — every run is submitted the same way.
- **The CEO is the approver in practice**, but the design supports more than one appointed approver
  and any one of them can decide, so leave or travel never blocks payment.
- **A run represents one bank session**, which is why the total is fixed at submission and items are
  locked.
- **The payroll total is typed by Finance**, taken from the bank run they just performed. The
  platform does not compute it and holds no data with which it could.
- **This feature modifies one transition in spec 039**: a payback request reaches **Paid** on the
  approval of the run that carries it, not at the moment Finance records the transfer. That single
  state — *payment submitted, awaiting approval* — is the whole of 039's rework.
- **Existing capabilities are reused**: the Finance role, the company email settings and their
  master toggle, the file-storage and access-checked serving pattern, the daily scheduled job that
  already exists for holidays, and the navy/gold design language.

## Dependencies & Constraints

- **Depends on spec 039** for the payables a run groups (payback requests and petty cash funding).
  User Story 3 (salary batches) and User Story 4 (the appointment) do not depend on it and can ship
  first.
- **Constitution amendments required**, to be recorded in `.specify/memory/constitution.md`,
  `CLAUDE.md` and the decisions log in the same commit as the code:
  1. **Email** is currently limited to two workflows (benefit claims, holidays). This adds the
     finance-approval workflow — requested by the CEO on 2026-08-24.
  2. **Scheduled work** is currently described as one daily job that may nudge HR. FR-022 adds a
     second audience — appointed approvers — under the same rule that a job never emails employees
     at large.
  3. The constitution's **Roles** line omits `FINANCE`, which has existed since spec 020 (a drift
     also noted in spec 039).
- **House rules that bind this design** (`CLAUDE.md`): per-module authority is an appointment and
  never a new `Role` member; one derivation of that authority, asked by pages, actions, email
  recipients and serving routes alike; role-holders are never rows; the appointment cannot appoint;
  and a figure shown beside a decision is computed from exactly what that decision moves — which is
  why a run's total is frozen at submission.
