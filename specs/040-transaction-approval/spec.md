# Feature Specification: Bank Confirmations & Monthly Salary Runs

**Feature Branch**: `claude/finance-petty-cash-payroll-we46wn`

**Created**: 2026-08-24

**Status**: Draft (rewritten 2026-08-24 after the CEO corrected the framing — see *A correction that changed the design*)

**Input**: User description: "Finance informs the CEO of any payment they make so the CEO can give the final transaction approval — the CEO performs the final confirmation in the bank, so an email is needed the moment Finance has entered a transaction. The same is needed for the monthly salaries: when Finance records the payroll on the banking side, they submit it on the platform and the CEO receives an email to approve the transactions. This may need a new authority in the release of amounts."

## A correction that changed the design

The first draft of this spec called the CEO an "approver" and the act "approving a payment". He
corrected it: *"I don't approve payments. I confirm the transaction in the bank."*

That is not a wording quibble — it changes what the product is. The bank is where the money is
released; the platform's job is to **tell him a transfer is waiting** and to **keep the record of
what was released and when**. Nothing here gates a payment, because the gate already exists and it
is the bank's. Every screen and every email in this feature is written accordingly: Finance **sends
transfers to the bank**, the CEO **confirms them in the bank**, and then **ticks them off here** so
the platform knows they are done.

## Overview

Forefront's bank works on two signatures: Finance enters a transfer, the CEO confirms it. Today
nothing connects that to the company's records — Finance enters a payment, tells the CEO by
WhatsApp or in person, and the confirmation leaves no trace against the request it settles.

This feature gives that hand-off a home. Finance groups what they have entered in the bank into one
**batch**, sends it, and the CEO gets an email: how many transfers, what they total, and a link. He
confirms them in the bank as he always has, then ticks the batch off here. The people being paid are
told at that point — not before, because until the bank releases it, nobody has been paid.

The **monthly salary run** uses the same path, carrying only the month, the total, how many people it
covers and the bank reference. **No individual's salary is stored or shown anywhere**, so the rule
that keeps salary out of Finance's hands is untouched.

**In scope**: the confirmer appointment, batches over the payables spec 039 creates, the monthly
salary run, the email, and the record of who confirmed what.

**Out of scope**: moving any money (the bank does that), per-person payroll registers, payslips, and
anything that changes how an amount is decided — this feature records confirmations, it never
computes a figure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finance sends a batch to the bank (Priority: P1)

Finance has approved a few payback requests and owes a custodian their float back. They enter the
transfers in the bank, then on the platform they select those items, add the bank reference and the
value date, optionally attach the bank's confirmation file, and send the batch. Its total is fixed
at that moment and its items are locked — nothing in a sent batch can change underneath the person
about to confirm it.

**Why this priority**: This is Finance's half and the thing that has no record at all today. Useful
on its own: even before anyone confirms, Finance finally has a list of what went to the bank and
when.

**Independent Test**: As Finance, select two approved payback requests and one float top-up, send
them as one batch with a reference and value date; confirm the batch shows the right total and
count, and that the items can no longer be edited or placed in a second batch.

**Acceptance Scenarios**:

1. **Given** three payables awaiting payment, **When** Finance sends them as one batch, **Then** the
   batch records the total, the item count, the bank reference, the value date, who sent it, and
   when.
2. **Given** an item already in a sent batch, **When** Finance tries to add it to another, **Then**
   it is refused — an item belongs to at most one batch.
3. **Given** a sent batch, **When** anyone attempts to add, remove or alter its items or amounts,
   **Then** the attempt is refused; the correction path is to withdraw the whole batch.
4. **Given** a sent batch not yet confirmed, **When** Finance withdraws it with a reason, **Then**
   its items return to awaiting-payment and the withdrawal is recorded.
5. **Given** an employee who is not Finance, **When** they attempt to create or send a batch,
   **Then** the attempt is refused server-side.

---

### User Story 2 - The CEO is emailed, confirms in the bank, and ticks it off (Priority: P1)

The moment a batch is sent, the appointed confirmer gets an email: what kind of batch, how many
transfers, what they total, who sent it, and a link. It does **not** list names or amounts — those
are one tap away, so payroll and expense detail don't sit in an inbox forever. He opens the batch,
sees each item with its evidence, confirms the transfers in the bank, and ticks the batch off. Only
then are the people being paid told.

**Why this priority**: This is the request in one sentence — *"I need a notification on my email
that he made the transaction as finance"* — and the record the whole feature exists to produce.

**Independent Test**: Appoint a confirmer, send a batch as Finance, and confirm their address
receives an email with the right total and a working link; tick the batch off and confirm each
payback requester is told they've been paid, and that the batch records who confirmed it and when.

**Acceptance Scenarios**:

1. **Given** an appointed confirmer and email switched on, **When** Finance sends a batch, **Then**
   they receive an email naming the batch type, total, item count, sender and a link — and **not**
   the individual payees or amounts.
2. **Given** a sent batch, **When** the confirmer ticks it off, **Then** its items become **Paid**,
   each payback requester is told, and the batch records who confirmed it, when, and the total they
   were shown.
3. **Given** a sent batch, **When** the confirmer sends it back with a note, **Then** it returns to
   Finance with that note, its items go back to awaiting payment, and nobody is told they were paid.
4. **Given** a user who is not an appointed confirmer, **When** they attempt to confirm or send back
   a batch, **Then** the attempt is refused server-side.
5. **Given** email is switched off or unconfigured, **When** Finance sends a batch, **Then** it is
   still created and visible to the confirmer in the app, and no error is shown to Finance.
6. **Given** a confirmed batch, **When** anyone views it later, **Then** it is read-only and shows
   the whole trail: sent by/when, confirmed by/when, total, items, bank reference.

---

### User Story 3 - The monthly salary run (Priority: P1)

Finance records the month's payroll in the bank, then sends a salary batch here: the month, the
total transferred, how many people it covers, the bank reference, an optional note, and optionally
the bank's file. The CEO is emailed exactly as for any other batch, confirms in the bank, and ticks
it off. No individual's salary appears anywhere in this flow.

**Why this priority**: Explicitly asked for, the largest sum the company moves, and the case where
an unrecorded confirmation matters most. It needs nothing from spec 039 — no payback request and no
float — so it can ship on its own.

**Independent Test**: As Finance, send a salary batch for a month with a total and a headcount;
confirm the CEO is emailed, that ticking it off records the trail, that a second batch for the same
month is refused unless marked as an extra run, and that no per-person figure is stored anywhere.

**Acceptance Scenarios**:

1. **Given** Finance, **When** they send a salary batch with month, total, headcount and bank
   reference, **Then** it is created awaiting confirmation and the CEO is emailed.
2. **Given** a salary batch already sent for a month, **When** Finance sends another for the same
   month, **Then** it is refused unless flagged as an extra run, with a reason.
3. **Given** any salary batch, **When** anyone views it, **Then** it shows only month, total,
   headcount, reference, note and attachment — there is no per-employee amount to show.
4. **Given** an HR Admin, **When** they attempt to view salary batches, **Then** access is denied.
   Salary totals stay with Finance, the confirmer, and whoever holds top-level access.

---

### User Story 4 - Appointing who confirms (Priority: P2)

Someone with top-level access appoints the person who confirms transfers at the bank. The
appointment changes nothing else about what that person can see — it only decides who gets the
emails and who can tick a batch off.

**Why this priority**: Needed for the emails to reach anyone, but it is set-up: appointed once and
rarely touched.

**Independent Test**: Appoint an employee as confirmer; check they receive the emails and can tick a
batch off, that nothing else about their access changes, and that they cannot appoint anyone else.

**Acceptance Scenarios**:

1. **Given** top-level access, **When** they appoint an active employee as confirmer, **Then** that
   person receives the emails and can confirm batches.
2. **Given** an appointed confirmer who does not hold top-level access, **When** they attempt to
   appoint or remove another confirmer, **Then** it is refused — the appointment cannot appoint.
3. **Given** nobody appointed at all, **When** Finance sends a batch, **Then** it is created and
   waits, and the screen says plainly that nobody is appointed to confirm it yet.
4. **Given** a confirmer who leaves the company, **When** their employment ends, **Then** they stop
   receiving emails and can no longer confirm.

---

### User Story 5 - A reminder of what is still waiting (Priority: P3)

A batch sent yesterday and still unconfirmed is money that has not moved and someone who has not
been paid. Once a day, if anything has been waiting longer than a set number of days, the confirmer
gets one summary email. Nobody else is emailed.

**Why this priority**: The email at send-time already does the main job; this only catches what
slipped.

**Independent Test**: Send a batch, move its date past the threshold, run the daily job, and confirm
exactly one summary email reaches the confirmer and none reaches anyone else.

**Acceptance Scenarios**:

1. **Given** a batch waiting longer than the set number of days, **When** the daily job runs,
   **Then** the confirmer receives one summary email listing what is outstanding and its total.
2. **Given** nothing waiting beyond the threshold, **When** the daily job runs, **Then** no email is
   sent at all.
3. **Given** the daily job, **When** it runs, **Then** it never emails anyone but the appointed
   confirmer.

---

### Edge Cases

- **An item's amount changes after the batch is sent.** Impossible by design: sending locks the
  items. If a figure was wrong, the batch is withdrawn, corrected and re-sent — and the CEO sees a
  fresh batch rather than a quietly altered one.
- **He confirms a batch emailed hours earlier.** The batch shows the total it was sent with, which
  is the total the email carried; there is no path by which the two can differ.
- **Finance ticks off their own batch.** Refused. Whoever sent a batch cannot be the one who
  confirms it — that is the whole point of two signatures. The single exception is someone holding
  top-level access, which the CEO ruled on directly; when that happens the batch records the same
  person on both halves, so it is visible rather than silent.
- **An empty batch.** Refused when sent.
- **The bank rejects a transfer after the batch was confirmed.** The batch stays as the historical
  record; Finance raises the correction as new payables. A confirmed batch is never rewritten.
- **Email off, unconfigured, or bouncing.** Batches are still created and confirmed in the app; no
  state change is ever blocked by email.
- **A salary run nobody confirms.** It waits, appears in the reminder, and is never auto-confirmed
  and never expires.
- **Nobody appointed as confirmer.** Batches accumulate and the screen says so plainly. Anyone with
  top-level access can appoint someone (including themselves) at any moment, so this is a pause, not
  a lock-out.

## Requirements *(mandatory)*

### Functional Requirements

**Who confirms**

- **FR-001**: The right to confirm a batch MUST be a per-person **appointment**, not a new role
  value: an appointed person's role and everything else they can see MUST be unchanged by it.
- **FR-002**: The system MUST answer "may this person confirm?" from **one** derivation used by
  every screen, action, email recipient list and serving route.
- **FR-003**: Only the people actually appointed MUST be able to confirm. Holding top-level access
  MUST NOT by itself confer it. *(This deliberately departs from the pattern used for Learning
  managers, where role-holders hold the capability implicitly. The CEO's instruction was that
  confirmation waits for him and nobody else, and an implicit power held by every top-level account
  would make that untrue. The lock-out that pattern guards against is instead prevented by FR-004:
  the list can always be refilled.)*
- **FR-004**: Only someone with top-level access MUST be able to appoint or remove a confirmer, and
  they MUST be able to appoint themselves — so an empty list is always recoverable. An appointed
  confirmer MUST NOT be able to appoint anyone.
- **FR-005**: A person who is no longer an active employee MUST NOT be able to confirm and MUST NOT
  be emailed.

**Batches**

- **FR-006**: Finance MUST be able to group payables — approved payback requests and petty cash
  funding movements from spec 039 — into a batch carrying a bank reference, a value date, an
  optional note and an optional attachment.
- **FR-007**: Sending a batch MUST fix its total and lock its items: nothing may be added, removed,
  altered, or placed in a second batch while the batch stands.
- **FR-008**: An item MUST belong to at most one batch at a time.
- **FR-009**: Finance MUST be able to withdraw a sent batch before it is decided, with a reason; its
  items MUST return to awaiting-payment and the withdrawal MUST be recorded.
- **FR-010**: A batch MUST move through: Sent → Confirmed, Sent → Sent back (with a note, items
  released), or Sent → Withdrawn. A confirmed batch MUST be immutable thereafter.
- **FR-011**: Whoever sent a batch MUST NOT be able to confirm it — **except** someone holding
  top-level access, who MAY confirm a batch they sent themselves (CEO's decision, 2026-08-24).
  Holding Finance, the confirmer appointment, or both is never sufficient.
- **FR-012**: Confirming a batch MUST record who confirmed it, when, and the total they were shown,
  and MUST move every item in it to **Paid**.
- **FR-013**: Telling someone they have been paid MUST happen on confirmation, never when the batch
  is sent.
- **FR-014**: The batch screen MUST show each item's payee, purpose, amount and evidence before the
  confirmer decides.

**Salary runs**

- **FR-015**: Finance MUST be able to send a monthly salary batch carrying the month, the total
  transferred, the number of people covered, a bank reference, an optional note and an optional
  attachment — and MUST NOT be able to record any per-person amount.
- **FR-016**: The system MUST NOT store, display or export any individual's salary anywhere in this
  feature.
- **FR-017**: A second batch for a month already sent MUST be refused unless explicitly marked an
  extra run, with a reason.
- **FR-018**: Salary batches MUST be visible only to Finance, appointed confirmers and top-level
  access — an HR Admin MUST NOT be able to see them.
- **FR-019**: Salary batches MUST follow the same send → email → confirm path, and the same
  immutability, as any other batch.

**The email**

- **FR-020**: On sending, the system MUST email every eligible confirmer with the batch's type,
  total, item count, sender and a direct link — and MUST NOT list individual payees or amounts
  (CEO's decision, 2026-08-24: the detail stays one tap away rather than living in an inbox).
- **FR-021**: Email failure or absence MUST never block, delay or roll back sending or confirming.
- **FR-022**: A daily reminder MUST be able to email confirmers a summary of batches waiting beyond
  a configurable number of days, and MUST NOT email anyone else.

**The record**

- **FR-023**: Every batch MUST retain its full trail — sent by/when, items and amounts as sent,
  decided by/when, the decision and any note — and MUST remain readable afterwards.
- **FR-024**: Batches MUST be listable and filterable by state, type and date, so Finance and the
  confirmer can see what is outstanding and what was released in a period.

### Key Entities

- **Confirmer appointment**: A row saying one person may confirm batches. Records who appointed them
  and when.
- **Batch**: A group of payables entered in the bank together — type, bank reference, value date,
  note, attachment, sent-by/at, fixed total, item count, state, decided-by/at, decision note.
- **Batch item**: The link between a batch and one payable (a payback request or a float movement),
  with the amount as sent.
- **Salary run**: A batch whose subject is a month's payroll — month, total, headcount, reference,
  extra-run flag and reason. No per-person data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The CEO learns a transfer is waiting within a minute of Finance entering it in the
  bank, without anyone messaging him.
- **SC-002**: Every released payment — payback, float top-up or payroll — is traceable to who sent
  it, who confirmed it, and when each acted.
- **SC-003**: No batch can be confirmed by the person who sent it, in any combination of Finance and
  confirmer rights; only top-level access can, and the batch then shows both halves as theirs.
- **SC-004**: Somebody is told they have been paid only after the money was released, never before.
- **SC-005**: The total in the email always equals the total on the batch that is confirmed.
- **SC-006**: No individual salary figure is stored, shown or exported by this feature, verifiable
  by inspecting what a salary batch holds.
- **SC-007**: No payee name or amount appears in any email this feature sends.

## Assumptions

- **The bank releases the money; the platform records the fact.** Nothing here initiates a transfer
  or blocks one.
- **Confirmation follows the bank entry** (confirmed with the CEO, 2026-08-24): Finance enters the
  transfer in the bank and sends the batch here; the CEO confirms in the bank and ticks it off. No
  amount threshold — every batch travels the same path.
- **Only the CEO confirms, and payments wait for him** (his decision, 2026-08-24). The design still
  allows more than one appointed confirmer, because that is the same mechanism, but nobody holds it
  implicitly.
- **A batch represents one bank session**, which is why its total is fixed on sending and its items
  are locked.
- **The payroll total is typed by Finance**, taken from the run they just performed. The platform
  neither computes it nor holds data with which it could.
- **This changes one step of spec 039**: a payback request becomes **Paid** when the batch carrying
  it is confirmed, not when Finance records the transfer. That single added state — *sent to the
  bank, awaiting confirmation* — is the whole of 039's rework.
- **Existing capabilities are reused**: the Finance role, the company email settings and their master
  switch, the file storage with its access-checked serving route, the daily scheduled job that
  already exists for holidays, and the navy/gold design language.

## Dependencies & Constraints

- **Depends on spec 039** for the payables a batch groups. User Story 3 (salary runs) and User Story
  4 (the appointment) depend on nothing and can ship first.
- **Constitution amendments required**, recorded alongside the code:
  1. **Scheduled work** is currently described as one daily job that may nudge HR. FR-022 adds a
     second audience — appointed confirmers — under the same rule that a job never emails employees
     at large.
  2. The email clause already permits three workflows after spec 039; this adds the
     finance-confirmation messages to the third.
- **A deliberate departure from house pattern**, recorded in FR-003: per-module authority is an
  appointment (as always), but here the role-holders are **not** implicit members. Documented rather
  than silently applied, because it reverses the reasoning used for Learning managers.
- **House rules that bind this design**: per-module authority is an appointment, never a new role
  member; one derivation of that authority, asked by pages, actions, email recipients and serving
  routes alike; the appointment cannot appoint; and a figure shown beside a decision is computed
  from exactly what that decision moves — which is why a batch's total is frozen when it is sent.
