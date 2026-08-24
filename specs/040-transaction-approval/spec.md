# Feature Specification: Bank Confirmations & Monthly Salary Runs

**Feature Branch**: `claude/finance-petty-cash-payroll-we46wn`

**Created**: 2026-08-24

**Status**: Implemented (2026-08-24 — migrations `068` + `069`; not yet exercised end-to-end against the live database)

**Input**: User description: "Finance informs the CEO of any payment they make so the CEO can give the final transaction approval — the CEO performs the final confirmation in the bank, so an email is needed the moment Finance has entered a transaction. The same is needed for the monthly salaries: when Finance records the payroll on the banking side, they submit it on the platform and the CEO receives an email to approve the transactions. This may need a new authority in the release of amounts."

## Two corrections that changed the design

**First**, the opening draft called the CEO an "approver" and the act "approving a payment". He
corrected it: *"I don't approve payments. I confirm the transaction in the bank."* That is not a
wording quibble — it changes what the product is. The bank is where money is released; the
platform's job is to tell him something is waiting and to keep the record of what was done.

**Second**, the rewrite still had Finance "sending transfers to the bank". He corrected that too:
*"the finance doesn't send to bank, the finance creates transaction in the bank and I confirm it"* —
and asked for a button whose title says the transaction is **done**, rather than describing the act
of confirming.

The vocabulary, settled:

| Who | Does what | Called on screen |
|---|---|---|
| Finance | creates the transactions **in the bank**, then records them here | **Submit for confirmation** |
| The CEO | confirms them **in the bank**, then records that here | **Transaction complete** |
| The CEO | disagrees and hands them back | **Return to Finance** |

The transactions Finance created in one sitting have **no collective noun on screen** — the UI says
"3 transactions". (`PaymentBatch` survives as an internal model name and must never appear in
anything a person reads.)

### A third correction, which widened the scope

*"Previously the employee would receive the email of their benefit or any transaction when the
finance confirm, but actually this notification should be connected to my financial confirmation to
avoid confusion."*

Since spec 020, a benefit claim became **Reimbursed** and the employee was emailed *"you have been
reimbursed"* the moment **Finance** recorded a transfer. At that moment the money has not moved — it
moves when he confirms at the bank. Anybody emailed in between has been told something untrue, and
then asks Finance where their money is.

So **benefit-claim reimbursements are a third kind of payable** in this feature, alongside payback
requests and petty cash float movements. A claim gains the same waiting state, and the employee is
told when the CEO marks the submission complete.

Two consequences, both accepted:
- **His list gets longer.** Every benefit reimbursement now passes through him, not just paybacks
  and float top-ups.
- **Finance's existing "confirm payment" step on the claims queue goes away.** They tick approved
  claims into a submission instead, exactly as they do for paybacks — one flow, not two.

An audit of every email the app sends found exactly **two** that tell somebody money reached them:
the benefit reimbursement and the payback. Both now wait for his confirmation. The others announce
decisions (submitted, approved, declined, reopened) and are unaffected — a decision is true when it
is made.

## Overview

Forefront's bank works on two signatures: Finance creates a transaction, the CEO confirms it. Today
nothing connects that to the company's records — Finance creates the transaction, tells the CEO by
WhatsApp or in person, and the confirmation leaves no trace against the request it settles.

This feature gives that hand-off a home. Finance ticks off what they have just created in the bank
and submits it for confirmation; the CEO gets an email saying how many transactions there are and
what they total; he confirms them in the bank as he always has, and marks them complete here. The
people being paid are told at that point — not before, because until the bank releases it, nobody
has been paid.

The **monthly salary run** travels the same path, carrying only the month, the total, how many
people it covers and the bank reference. **No individual's salary is stored or shown anywhere.**

**In scope**: the confirmer appointment, submissions over the payables spec 039 creates, the monthly
salary run, the email, and the record of who confirmed what.

**Out of scope**: moving any money — the bank does that — plus per-person payroll registers,
payslips, and anything that changes how an amount is decided. This feature records confirmations; it
never computes a figure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finance submits what they created in the bank (Priority: P1)

Finance has approved a few payback requests and owes a custodian their float back. They create those
transactions in the bank, then on the platform they tick the same items, add the bank reference and
the value date, optionally attach the bank's file, and submit them for confirmation. The total is
fixed at that moment and the items are locked — nothing can change underneath the person about to
confirm it.

**Why this priority**: This is Finance's half and the thing that has no record at all today. Useful
on its own: even before anyone confirms, Finance finally has a list of what they created in the bank
and when.

**Independent Test**: As Finance, tick two approved payback requests and one float top-up, submit
them with a reference and value date; confirm the screen shows three transactions and the right
total, and that those items can no longer be edited or submitted again.

**Acceptance Scenarios**:

1. **Given** three payables awaiting payment, **When** Finance submits them, **Then** the record
   holds the total, how many transactions, the bank reference, the value date, who submitted them,
   and when.
2. **Given** an item already submitted, **When** Finance tries to submit it again, **Then** it is
   refused — a payable can only be waiting on confirmation once.
3. **Given** submitted transactions, **When** anyone attempts to add, remove or alter them,
   **Then** the attempt is refused; the correction path is to withdraw them all and start again.
4. **Given** submitted transactions not yet confirmed, **When** Finance withdraws them with a
   reason, **Then** the payables return to awaiting payment and the withdrawal is recorded.
5. **Given** an employee who is not Finance, **When** they attempt to submit anything, **Then** the
   attempt is refused server-side.

---

### User Story 2 - The CEO is emailed, confirms in the bank, marks it complete (Priority: P1)

The moment Finance submits, the appointed confirmer gets an email: how many transactions, what they
total, who created them, and a link. It does **not** list names or amounts — those are one tap away,
so payroll and expense detail don't sit in an inbox forever. He opens the link, sees each
transaction with its evidence, confirms them in the bank, and presses **Transaction complete**. Only
then are the people being paid told.

**Why this priority**: This is the request in one sentence — *"I need a notification on my email
that he made the transaction as finance"* — and the record the whole feature exists to produce.

**Independent Test**: Appoint a confirmer, submit three transactions as Finance, and confirm their
address receives an email with the right total and a working link; mark them complete and confirm
each payback requester is told they've been paid, and that the record holds who confirmed and when.

**Acceptance Scenarios**:

1. **Given** an appointed confirmer and email switched on, **When** Finance submits, **Then** they
   receive an email carrying the kind, the count, the total, who submitted it and a link — and
   **not** the individual payees or amounts.
2. **Given** submitted transactions, **When** the confirmer marks them complete, **Then** every
   payable in them becomes **Paid**, each payback requester is told, and the record holds who
   confirmed, when, and the total they were shown.
3. **Given** submitted transactions, **When** the confirmer returns them to Finance with a note,
   **Then** they go back with that note, the payables return to awaiting payment, and nobody is told
   they were paid.
4. **Given** a user who is not an appointed confirmer, **When** they attempt to mark complete or
   return anything, **Then** the attempt is refused server-side.
5. **Given** email is switched off or unconfigured, **When** Finance submits, **Then** the record is
   still created and visible to the confirmer in the app, and no error is shown to Finance.
6. **Given** a completed record, **When** anyone views it later, **Then** it is read-only and shows
   the whole trail: submitted by/when, confirmed by/when, total, transactions, bank reference.

---

### User Story 3 - The monthly salary run (Priority: P1)

Finance creates the month's payroll transactions in the bank, then submits the run here: the month,
the total transferred, how many people it covers, the bank reference, an optional note, and
optionally the bank's file. The CEO is emailed as for anything else, confirms in the bank, and marks
it complete. No individual's salary appears anywhere in this flow.

**Why this priority**: Explicitly asked for, the largest sum the company moves, and the case where
an unrecorded confirmation matters most. It needs nothing from spec 039 — no payback request and no
float — so it can ship on its own.

**Independent Test**: As Finance, submit a salary run for a month with a total and a headcount;
confirm the CEO is emailed, that marking it complete records the trail, that a second ordinary run
for the same month is refused, and that no per-person figure is stored anywhere.

**Acceptance Scenarios**:

1. **Given** Finance, **When** they submit a salary run with month, total, headcount and bank
   reference, **Then** it is created awaiting confirmation and the CEO is emailed.
2. **Given** a salary run already submitted for a month, **When** Finance submits another for the
   same month, **Then** it is refused unless flagged as an extra run, with a reason.
3. **Given** any salary run, **When** anyone views it, **Then** it shows only month, total,
   headcount, reference, note and attachment — there is no per-employee amount to show.
4. **Given** an HR Admin, **When** they attempt to view salary runs, **Then** access is denied.
   Salary totals stay with Finance, the confirmer, and whoever holds top-level access.

---

### User Story 4 - Appointing who confirms (Priority: P2)

Someone with top-level access appoints the person who confirms transactions at the bank. The
appointment changes nothing else about what that person can see — it decides only who gets the
emails and who can mark a transaction complete.

**Why this priority**: Needed for the emails to reach anyone, but it is set-up: appointed once and
rarely touched.

**Independent Test**: Appoint an employee; check they receive the emails and can mark transactions
complete, that nothing else about their access changes, and that they cannot appoint anyone else.

**Acceptance Scenarios**:

1. **Given** top-level access, **When** they appoint an active employee, **Then** that person
   receives the emails and can mark transactions complete.
2. **Given** an appointed confirmer without top-level access, **When** they attempt to appoint or
   remove another confirmer, **Then** it is refused — the appointment cannot appoint.
3. **Given** nobody appointed at all, **When** Finance submits, **Then** the record is created and
   waits, and the screen says plainly that nobody is appointed to confirm it yet.
4. **Given** a confirmer who leaves the company, **When** their employment ends, **Then** they stop
   receiving emails and can no longer confirm.

---

### User Story 5 - A reminder of what is still waiting (Priority: P3)

Transactions submitted yesterday and still unconfirmed are money that has not moved and someone who
has not been paid. Once a day, if anything has been waiting longer than a set number of days, the
confirmer gets one summary email. Nobody else is emailed.

**Why this priority**: The email at submission does the main job; this only catches what slipped.

**Independent Test**: Submit transactions, move the date past the threshold, run the daily job, and
confirm exactly one summary email reaches the confirmer and none reaches anyone else.

**Acceptance Scenarios**:

1. **Given** something waiting longer than the set number of days, **When** the daily job runs,
   **Then** the confirmer receives one summary email with the count and total.
2. **Given** nothing waiting beyond the threshold, **When** the daily job runs, **Then** no email is
   sent at all.
3. **Given** the daily job, **When** it runs, **Then** it never emails anyone but appointed
   confirmers.

---

### Edge Cases

- **An amount changes after submission.** Impossible by design: submitting locks the items. If a
  figure was wrong, Finance withdraws, corrects, and submits again — and the CEO sees a fresh
  submission rather than a quietly altered one.
- **He confirms something emailed hours earlier.** It shows the total it was submitted with, which
  is the total the email carried; the two cannot differ.
- **Finance marks their own submission complete.** Refused. Whoever created the transactions in the
  bank cannot also be the one who confirms them — that is what two signatures means. The single
  exception is someone holding top-level access, which the CEO ruled on directly; the record then
  shows the same person on both halves, so it is visible rather than silent.
- **An empty submission.** Refused.
- **The bank rejects a transaction after it was marked complete.** The record stands as history;
  Finance raises the correction as new payables. A completed record is never rewritten.
- **Email off, unconfigured, or bouncing.** Everything still happens in the app; no state change is
  ever blocked by email.
- **A salary run nobody confirms.** It waits, appears in the reminder, and is never auto-confirmed.
- **Nobody appointed as confirmer.** Submissions accumulate and the screen says so plainly. Anyone
  with top-level access can appoint someone — including themselves — at any moment, so this is a
  pause, not a lock-out.

## Requirements *(mandatory)*

### Functional Requirements

**Who confirms**

- **FR-001**: The right to confirm MUST be a per-person **appointment**, not a new role value: an
  appointed person's role and everything else they can see MUST be unchanged by it.
- **FR-002**: The system MUST answer "may this person confirm?" from **one** derivation used by
  every screen, action, email recipient list and scheduled job.
- **FR-003**: Only appointed people MUST be able to confirm. Holding top-level access MUST NOT by
  itself confer it. *(This deliberately departs from the pattern used for Learning managers, where
  role-holders hold the capability implicitly. The CEO's instruction was that transactions wait for
  him and nobody else; an implicit power held by every top-level account would make that untrue. The
  lock-out that pattern guards against is prevented instead by FR-004.)*
- **FR-004**: Only someone with top-level access MUST be able to appoint or remove a confirmer, and
  they MUST be able to appoint themselves — so an empty list is always recoverable. An appointed
  confirmer MUST NOT be able to appoint anyone.
- **FR-005**: A person who is no longer an active employee MUST NOT be able to confirm and MUST NOT
  be emailed.

**Submitting**

- **FR-006**: Finance MUST be able to tick payables — approved payback requests, petty cash funding
  movements (spec 039) and **approved benefit claims awaiting reimbursement** (spec 020) — and
  submit them for confirmation with a bank reference, a value date, an optional note and an optional
  attachment.
- **FR-006a**: A benefit claim MUST reach **Reimbursed**, and its employee MUST be emailed, only
  when the submission carrying it is marked complete — never when Finance records a transfer. The
  single-step "confirm payment" on the claims queue MUST be removed, so there is one path and not
  two.
- **FR-007**: Submitting MUST fix the total and lock the items: nothing may be added, removed,
  altered, or submitted twice while it stands.
- **FR-008**: A payable MUST be awaiting confirmation in at most one submission at a time.
- **FR-009**: Finance MUST be able to withdraw a submission before it is decided, with a reason; the
  payables MUST return to awaiting payment and the withdrawal MUST be recorded.
- **FR-010**: A submission MUST move through: Submitted → Complete, Submitted → Returned (with a
  note, payables released), or Submitted → Withdrawn. A completed record MUST be immutable.
- **FR-011**: Whoever submitted MUST NOT be able to mark it complete — **except** someone holding
  top-level access, who MAY (CEO's decision, 2026-08-24). Holding Finance, the appointment, or both
  is never sufficient.
- **FR-012**: Marking complete MUST record who did it, when, and the total they were shown, and MUST
  move every payable in it to **Paid**.
- **FR-013**: Telling someone they have been paid MUST happen on completion, never at submission.
- **FR-014**: The screen MUST show each transaction's payee, purpose, amount and evidence before the
  confirmer decides.

**Salary runs**

- **FR-015**: Finance MUST be able to submit a monthly salary run carrying the month, the total
  transferred, the number of people covered, a bank reference, an optional note and an optional
  attachment — and MUST NOT be able to record any per-person amount.
- **FR-016**: The system MUST NOT store, display or export any individual's salary anywhere in this
  feature.
- **FR-017**: A second ordinary run for a month already submitted MUST be refused unless explicitly
  marked an extra run, with a reason.
- **FR-018**: Salary runs MUST be visible only to Finance, appointed confirmers and top-level
  access — an HR Admin MUST NOT be able to see them.
- **FR-019**: Salary runs MUST follow the same submit → email → confirm path, and the same
  immutability, as anything else.

**The email**

- **FR-020**: On submission the system MUST email every eligible confirmer with the kind, the total,
  the count, who submitted it and a direct link — and MUST NOT list individual payees or amounts
  (CEO's decision, 2026-08-24: the detail stays one tap away rather than living in an inbox).
- **FR-021**: Email failure or absence MUST never block, delay or roll back submitting or
  confirming.
- **FR-022**: A daily reminder MUST be able to email confirmers a summary of what has been waiting
  beyond a configurable number of days, and MUST NOT email anyone else.

**The record**

- **FR-023**: Every submission MUST retain its full trail — submitted by/when, the transactions and
  amounts as submitted, decided by/when, the decision and any note — and MUST remain readable
  afterwards.
- **FR-024**: Submissions MUST be listable and filterable by state, kind and date, so Finance and
  the confirmer can see what is outstanding and what was released in a period.

### Key Entities

- **Confirmer appointment**: A row saying one person may confirm. Records who appointed them, and
  when.
- **Submission**: The transactions Finance created in the bank in one sitting — kind, bank
  reference, value date, note, attachment, submitted-by/at, fixed total, count, state,
  decided-by/at, decision note.
- **Transaction**: One payable inside a submission (a payback request or a float movement), with the
  payee, purpose and amount as submitted.
- **Salary run**: A submission whose subject is a month's payroll — month, total, headcount,
  reference, extra-run flag and reason. No per-person data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The CEO learns something is waiting within a minute of Finance creating it in the
  bank, without anyone messaging him.
- **SC-002**: Every released payment — payback, float top-up or payroll — is traceable to who
  created it, who confirmed it, and when each acted.
- **SC-003**: Nothing can be marked complete by the person who submitted it, in any combination of
  Finance and confirmer rights; only top-level access can, and the record then shows both halves as
  theirs.
- **SC-004**: Somebody is told they have been paid only after the money was released, never before —
  for benefit claims and paybacks alike. No email in the whole application announces money reaching
  a person before the CEO has confirmed it at the bank.
- **SC-005**: The total in the email always equals the total on the record that is confirmed.
- **SC-006**: No individual salary figure is stored, shown or exported by this feature, verifiable
  by inspecting what a salary run holds.
- **SC-007**: No payee name or amount appears in any email this feature sends.

## Assumptions

- **The bank releases the money; the platform records the fact.** Nothing here initiates a transfer
  or blocks one.
- **Confirmation follows creation in the bank** (confirmed with the CEO, 2026-08-24): Finance
  creates the transactions and submits them here; the CEO confirms them in the bank and marks them
  complete. No amount threshold — everything travels the same path.
- **Only the CEO confirms, and payments wait for him** (his decision, 2026-08-24). The design still
  allows more than one appointed confirmer, because that is the same mechanism, but nobody holds it
  implicitly.
- **A submission represents one bank sitting**, which is why its total is fixed at submission and
  its items are locked.
- **The payroll total is typed by Finance**, taken from the run they just performed. The platform
  neither computes it nor holds data with which it could.
- **This changes one step of spec 039**: a payback request becomes **Paid** when the submission
  carrying it is marked complete, not when Finance records the transfer. That single added state —
  *at the bank, awaiting confirmation* — is the whole of 039's rework.
- **Existing capabilities are reused**: the Finance role, the company email settings and their
  master switch, the file storage with its access-checked serving route, the daily scheduled job
  that already exists for holidays, and the navy/gold design language.

## Dependencies & Constraints

- **Depends on spec 039** for the payables a submission groups. User Story 3 (salary runs) and User
  Story 4 (the appointment) depend on nothing and can ship first.
- **Constitution amendments required**, recorded alongside the code:
  1. **Scheduled work** is currently described as one daily job that may nudge HR. FR-022 adds a
     second audience — appointed confirmers — under the same rule that a job never emails employees
     at large.
  2. The email clause already permits three workflows after spec 039; this adds the
     finance-confirmation messages to the third.
- **A deliberate departure from house pattern**, recorded in FR-003: per-module authority is an
  appointment, as always, but here the role-holders are **not** implicit members. Documented rather
  than silently applied, because it reverses the reasoning used for Learning managers.
- **House rules that bind this design**: per-module authority is an appointment, never a new role
  member; one derivation of that authority, asked by pages, actions, email recipients and scheduled
  jobs alike; the appointment cannot appoint; and a figure shown beside a decision is computed from
  exactly what that decision moves — which is why the total is frozen at submission.
