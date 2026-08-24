# Feature Specification: Petty Cash & Payback Requests

**Feature Branch**: `claude/finance-petty-cash-payroll-we46wn`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "Finance module: petty cash custodian accounts and out-of-pocket payback requests. Petty cash is modelled as one or more custodian float accounts, each with a named holder (e.g. the Marketing Manager) and a running balance: Finance records top-ups into the account, and spend lines draw it down. The custodian logs each spend line themselves as they spend — date, section, category, description, payment method (petty cash vs company transfer), payment details, payee, amount in EGP with two decimals — and attaches evidence per line. Finance reviews the lines and closes a period; a period carries a budget figure and shows total expenses, total paid from petty cash, the float advanced, remaining/overspend, and the resulting 'amount to reimburse'. Separately, any employee who paid out of their own pocket can raise a payback request with evidence; Finance reviews and approves or rejects it with a reason, then records the payment."

## Overview

Today the company's petty cash lives in a shared workbook (`NEW_MARCOM_Expenses.xlsx`). The
Marketing Manager fronts money for the company, logs each spend on a monthly tab, mails the tab to
Finance, and the two of them settle up. The workbook shows what that costs: sixteen period tabs
with three different column layouts, receipts named as filenames that live somewhere else, a
`Status` column meaning "receipt attached" on some tabs and "Done" on others, an overspend carried
into the next month as a line item called *"December Overbudget"*, and a bottom-line **Amount to
reimburse** whose sign flips between tabs — `March` computes *spent − float* (3,444.54 owed to the
custodian) while `JUL-AUG` computes *float − spent* (−4,617.16 for the same situation). Nobody can
say, at a glance, what the company owes the custodian right now.

This feature moves that into the platform. A **petty cash account** has a named custodian and a
signed running balance. Finance tops it up; the custodian logs each spend with its receipt attached
as they spend; a **period** closes with one arithmetic that everyone reads the same way. Separately,
**anyone** who pays for something out of pocket — not just a custodian — can raise a **payback
request** with evidence, which Finance approves or rejects and then pays.

**In scope**: petty cash accounts, periods, spend lines, evidence, funding movements, the
reconciliation arithmetic, a per-period budget figure, payback requests through to payment, and the
admin-managed section/category lists.

**Out of scope, deliberately** (spec 040): the CEO's final transaction approval and the email that
prompts it, and the monthly salary batch. Also out of scope: the workbook's `Forecast` tab and its
`Tools Subscription` register — planning artefacts, not payment flow.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The custodian logs a spend with its receipt (Priority: P1)

The custodian of a petty cash account (e.g. the Marketing Manager) opens their petty cash page and
sees their current balance and the open period. They add a spend line: the date they paid, the
section it belongs to, a category, a description, how it was paid (from the petty cash float, or by
company transfer), the payee, and the amount. They attach the receipt — a photo or a PDF, and more
than one file where a single purchase produced several. The line appears in the period immediately
and the balance moves.

**Why this priority**: This is the workbook's daily job and the reason the sheet exists. Everything
else in the feature reads the lines this story creates. On its own it already replaces the tab.

**Independent Test**: As a custodian, add a line paid from the float with a receipt attached;
confirm it appears in the open period, that the account's balance drops by the amount, and that a
line paid by company transfer appears in the period without moving the balance.

**Acceptance Scenarios**:

1. **Given** an account with an open period, **When** the custodian adds a line paid from the float
   for 1,530.00 with a receipt attached, **Then** the line is stored against that period and the
   account's balance falls by 1,530.00.
2. **Given** an account with an open period, **When** the custodian adds a line whose payment method
   is *company transfer*, **Then** the line is recorded in the period's expenses but the float
   balance does **not** change (the company paid the vendor directly).
3. **Given** a line being added, **When** the custodian attaches three files to it, **Then** all
   three are stored against that line and each can be opened again from the line.
4. **Given** a line being added, **When** no evidence is attached, **Then** the line is still
   accepted but is flagged as **missing receipt** until evidence is added.
5. **Given** a signed-in employee who is not the custodian of an account and is not Finance,
   **When** they attempt to view or add lines on that account, **Then** access is denied
   server-side.

---

### User Story 2 - Finance reconciles and closes the period (Priority: P1)

Finance opens the account's period and sees one panel of figures: opening balance carried in from
the previous period, float advanced during this period, spent from the float, spent by company
transfer, total expenses, the budget and what is left of it, and the closing balance — stated in
words as well as a number ("Forefront owes Raneem 4,617.16" / "Raneem holds 1,382.84 of company
cash"). Finance reviews the lines, and closes the period. Closing locks the lines and carries the
closing balance into the next period as its opening balance.

**Why this priority**: The reconciliation is the point of the whole exercise — it is the number the
custodian and Finance argue about today, and the one the workbook gets wrong. Without it the lines
are just a list.

**Independent Test**: Create an account, record a 9,000.00 top-up, add lines totalling 13,617.16
from the float, and open the period panel; confirm it reads a closing balance of −4,617.16 stated
as "the company owes the custodian 4,617.16", and that closing the period opens the next one with
that same figure as its opening balance.

**Acceptance Scenarios**:

1. **Given** a period with an opening balance of 0.00, a 9,000.00 top-up and 13,617.16 spent from
   the float, **When** Finance views the period, **Then** the closing balance reads −4,617.16 and
   is described as an amount the company owes the custodian.
2. **Given** a period with an opening balance of 0.00, a 47,000.00 top-up and 50,444.54 spent from
   the float, **When** Finance views the period, **Then** the closing balance reads −3,444.54 —
   the same direction as the previous scenario, never the opposite sign.
3. **Given** a period with a budget of 9,000.00 and total expenses of 13,617.16, **When** Finance
   views it, **Then** the remaining budget shows as an overspend of 4,617.16 and is never floored
   to zero.
4. **Given** a closed period, **When** anyone attempts to add, edit or delete a line in it,
   **Then** the attempt is refused and the reason is stated.
5. **Given** a period containing lines flagged as missing a receipt, **When** Finance closes it,
   **Then** the affected lines are listed and closing requires Finance to acknowledge them
   explicitly; the acknowledgement and who made it are recorded on the period.
6. **Given** a closed period whose closing balance is −4,617.16, **When** the next period opens,
   **Then** its opening balance is −4,617.16.

---

### User Story 3 - An employee asks for their money back (Priority: P1)

An employee paid for something themselves — a taxi to a client, a cable for the office. They raise
a payback request: what they paid for, the category, the date, the amount, and the receipt. Finance
sees it in a queue, opens the evidence, and either approves it or rejects it with a reason. The
employee is told the outcome. Once approved, Finance transfers the money and records the payment
against the request.

**Why this priority**: This is the second half of what was asked for and stands alone — it needs no
petty cash account to work, and it serves everyone in the company rather than the two or three
people who hold a float.

**Independent Test**: As an ordinary employee, submit a payback request with a receipt; as Finance,
open the queue, reject one with a reason and approve another, then record payment on the approved
one; confirm the requester sees each outcome and that a non-Finance employee cannot open the queue.

**Acceptance Scenarios**:

1. **Given** the employee has a receipt, **When** they submit a payback request with an amount, a
   date paid, a category, a description and at least one evidence file, **Then** the request is
   stored as **Submitted** and appears in Finance's queue.
2. **Given** a request with no evidence attached, **When** the employee submits it, **Then** it is
   refused with a message saying evidence is required.
3. **Given** a **Submitted** request, **When** Finance rejects it with a reason, **Then** it
   becomes **Rejected**, the reason is shown to the requester, and the requester is notified.
4. **Given** a **Submitted** request, **When** Finance approves it, **Then** it becomes **Approved
   — awaiting payment** and appears in the payments list.
5. **Given** an **Approved** request, **When** Finance records the transfer with an amount and a
   date, **Then** it becomes **Paid**, the transferred amount and date are stored, and the
   requester is notified.
6. **Given** a request submitted by someone who is also the custodian of a petty cash account,
   **When** Finance opens it for review, **Then** any petty cash line on that custodian's accounts
   with the same amount within ±7 days is shown alongside as a possible duplicate.
7. **Given** an employee, **When** they open their own requests, **Then** they see only their own —
   never anyone else's amounts or evidence.

---

### User Story 4 - Finance manages accounts, funding and the lists (Priority: P2)

Finance creates a petty cash account, names its custodian, opens its first period with a budget,
and records each top-up they transfer into it (date, amount, reference). When a period closes owing
the custodian money, Finance records the settlement as a movement so the balance returns to where it
should be. A Super User maintains the section and category lists that the spend lines and payback
requests choose from.

**Why this priority**: Needed before stories 1–3 have anywhere to live, but it is set-up: once the
accounts and lists exist it is touched rarely, and sensible seeded values carry it.

**Independent Test**: As Finance, create an account with a custodian, record a top-up, and confirm
the balance rises by that amount; as a Super User, add a category and confirm it becomes selectable
on a new spend line while an archived one does not.

**Acceptance Scenarios**:

1. **Given** Finance, **When** they create an account naming an active employee as custodian and
   record a 9,000.00 top-up, **Then** the account's balance reads 9,000.00.
2. **Given** an account whose custodian has left the company, **When** anyone opens it, **Then**
   the account is flagged as needing a new custodian and no new lines may be added until one is
   named.
3. **Given** a category in use on historical lines, **When** a Super User archives it, **Then**
   existing lines keep showing it and it is no longer offered on new lines.
4. **Given** a non-Finance, non-Super-User employee, **When** they attempt to create an account,
   record a top-up, or edit the lists, **Then** the attempt is refused server-side.

---

### Edge Cases

- **A line dated outside its period.** Accepted — receipts arrive late and the workbook does this
  constantly — but the line is marked as out-of-window in the period view so Finance can move it.
- **Evidence arriving after the period closed.** Evidence can be attached to a line in a closed
  period (it changes no figure); amounts cannot.
- **A second open period on one account.** Refused: an account has at most one open period, so
  there is never a question about which one a line belongs to.
- **Amount of zero, negative, or more than two decimals.** Refused with a message. Money is
  positive and two-decimal; a correction is an edit or a separate line, never a negative amount.
- **Deleting a line.** Allowed only while the period is open, and only by the custodian or Finance;
  the deletion is recorded (who, when, what the line said) rather than vanishing.
- **The custodian claims the same spend twice** — once as a petty cash line and once as a payback
  request. The system cannot know they are the same purchase, so it surfaces the coincidence to
  Finance at review time (Story 3, scenario 6) instead of pretending to decide.
- **A period with no top-up at all** (the workbook's `SEP-OCT`, monthly petty cash 0.00). Valid: the
  custodian spent against a carried balance or out of pocket, and the closing balance says so.
- **An evidence file that is too large or of an unsupported type.** Refused at upload with the limit
  and the accepted types named, before anything is stored.
- **An employee opening someone else's evidence file by guessing its address.** Answered as *not
  found*, never as *forbidden* — "forbidden" confirms the file exists.
- **Email switched off or unconfigured.** Every state change still happens and nothing is blocked;
  no email is attempted and no error is shown to the person acting.

## Requirements *(mandatory)*

### Functional Requirements

**Accounts and custody**

- **FR-001**: The system MUST support more than one petty cash account, each with a name, a single
  named custodian who is an active employee, and a status of active or archived.
- **FR-002**: The system MUST hold every petty cash figure in EGP to exactly two decimal places.
- **FR-003**: The system MUST derive an account's balance from its funding movements and its
  float-paid spend lines rather than storing a balance that could drift, and MUST keep that balance
  **signed** — a negative balance means the company owes the custodian and MUST be presented as
  such in words, never as a floored zero.
- **FR-004**: Only Finance (or a Super User) MUST be able to create accounts, name or change a
  custodian, record funding movements, open a period, or close a period.
- **FR-005**: The system MUST prevent new spend lines on an account whose custodian is no longer an
  active employee, until a new custodian is named.

**Periods and reconciliation**

- **FR-006**: An account MUST have at most one open period at a time, each with a label, a start
  and end date, an optional budget figure, and a status of open, submitted, or closed.
- **FR-007**: The system MUST compute a period's figures from one shared derivation used by every
  screen, export and check: opening balance, float advanced, spent from the float, spent by company
  transfer, total expenses, budget remaining (signed), and closing balance.
- **FR-008**: Closing balance MUST equal opening balance plus float advanced minus spent from the
  float, and a period's closing balance MUST become the opening balance of the account's next
  period.
- **FR-009**: Budget remaining MUST be shown signed, with an overspend presented as an overspend and
  never clamped to zero.
- **FR-010**: The custodian MUST be able to submit a period to Finance for review; Finance MUST be
  able to close it, and closing MUST lock every line in it against changes to its amount, date,
  classification or payment method.
- **FR-011**: Closing a period that contains lines with no evidence MUST require Finance to
  acknowledge those specific lines, and the system MUST record the acknowledgement, who made it, and
  when.
- **FR-012**: Finance MUST be able to reopen a closed period with a recorded reason, and reopening
  MUST re-derive the following period's opening balance.

**Spend lines**

- **FR-013**: A spend line MUST carry: date paid, section, description, payment method (paid from
  the float, or paid by the company directly), amount, and MUST optionally carry a category, payment
  details, and a payee.
- **FR-014**: Only lines whose payment method is *paid from the float* MUST affect the account
  balance; company-paid lines MUST count toward period expenses and the budget only.
- **FR-015**: A line MUST accept more than one evidence file, and MUST be flagged as *missing
  receipt* until at least one is attached.
- **FR-016**: The custodian of the account and Finance MUST be able to add, edit and delete lines
  while the period is open; nobody else MUST be able to read or write them.
- **FR-017**: Deleting a line MUST record who deleted it, when, and what it contained.

**Payback requests**

- **FR-018**: Any signed-in employee MUST be able to raise a payback request carrying an amount, the
  date they paid, a category, a description, and at least one evidence file; a request without
  evidence MUST be refused.
- **FR-019**: A payback request MUST move through: Submitted → Approved (awaiting payment) → Paid,
  or Submitted → Rejected. Rejection MUST require a reason.
- **FR-020**: Only Finance (or a Super User) MUST be able to see the review queue, approve, reject,
  or record payment; a requester MUST see only their own requests.
- **FR-021**: Recording a payment MUST capture the amount transferred and the transfer date, and
  MUST refuse a transfer date in the future.
- **FR-022**: When reviewing a request from someone who holds a petty cash account, the system MUST
  show any petty cash line of theirs with the same amount dated within seven days either side, as a
  possible duplicate — as information for Finance, not as an automatic refusal.
- **FR-023**: Finance MUST be able to correct the recorded amount or date of an already-paid request
  without changing its status and without notifying the requester again.

**Evidence**

- **FR-024**: Evidence files MUST be limited to image and PDF formats and to a stated maximum size,
  enforced before storage, with the limit and accepted types shown to the person uploading.
- **FR-025**: Every request to open an evidence file MUST re-check, at that moment, that the viewer
  is the owner of the record, the account's custodian, Finance, or a Super User; anyone else MUST
  receive *not found*, never *forbidden*.

**Classification lists**

- **FR-026**: Sections and categories MUST be maintained as admin-managed lists, seeded from the
  values the workbook already uses, each archivable without altering the records that reference it.
- **FR-027**: Only a Super User MUST be able to add, rename or archive a section or category.

**Notifications**

- **FR-028**: The system MUST notify Finance when a payback request is submitted, and notify the
  requester when their request is rejected or paid, using the existing company email settings —
  respecting the master on/off switch and the configured Finance inbox.
- **FR-029**: A failure or absence of email MUST never block, delay or roll back any state change.

### Key Entities

- **Petty cash account**: A float held by one named custodian. Has a name, a custodian, a status,
  and a signed balance derived from its movements and float-paid lines.
- **Period**: A window on one account — label, start and end date, optional budget, status, opening
  balance carried in, and, once closed, who closed it and any missing-receipt acknowledgement.
- **Funding movement**: Cash moving between the company and the float — a top-up out to the
  custodian, or a return back to the company — with a date, an amount, a reference, and who
  recorded it.
- **Spend line**: One purchase in a period — date, section, category, description, payment method,
  payment details, payee, amount, and its evidence.
- **Payback request**: Someone's out-of-pocket spend awaiting repayment — requester, amount, date
  paid, category, description, evidence, status, decision (who, when, reason) and payment (amount,
  date, who recorded it).
- **Evidence file**: A receipt or invoice attached to a spend line or a payback request — its
  original filename, type, size, and where it is stored.
- **Section / Category**: The admin-managed classification lists a line or request is filed under.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A custodian can log a spend and attach its receipt in under one minute, from their
  phone, at the moment they pay.
- **SC-002**: At any moment — not only at month end — the company's position with each custodian is
  readable as a single figure and a sentence, with no manual arithmetic.
- **SC-003**: The direction of "who owes whom" is stated identically in every period, eliminating
  the sign inversion the workbook shows between its `March` and `JUL-AUG` tabs.
- **SC-004**: 100% of spend lines and payback requests either carry their evidence or are visibly
  flagged as missing it; no period closes with a missing receipt that Finance has not explicitly
  acknowledged.
- **SC-005**: An employee who paid out of pocket learns the outcome of their request without asking
  anyone, and Finance's review queue is reachable in one click from their home page.
- **SC-006**: Period reconciliation replaces the monthly workbook exchange entirely — no tab is
  mailed for a period that the platform holds.

## Assumptions

- **The currency is EGP** and every figure carries two decimals, matching the workbook.
- **Petty cash is not budgeted per section.** The workbook's budget is one figure per period; a
  per-section or per-category budget is not built here.
- **The custodian and their line manager are not an approval step.** Petty cash lines are logged and
  reconciled, not approved one by one — that is how the workbook works today. Payback requests are
  reviewed by Finance alone (confirmed with the CEO, 2026-08-24).
- **Payment itself is recorded, not executed.** Nothing in this feature moves money; transfers
  happen in the bank and are recorded here.
- **The CEO's final transaction approval is spec 040** and is layered on top of the payment records
  this feature creates. The payment records are deliberately shaped for it: 040 changes exactly one
  transition — a payback request reaches **Paid** when the CEO approves the run carrying it rather
  than the moment Finance records the transfer, inserting a single *payment submitted, awaiting
  approval* state. Nothing else in this feature is reworked by it.
- **Existing platform capabilities are reused**: the Finance role and its page, the file-storage and
  access-checked serving pattern already used for benefit-claim proof, the company email settings
  with their master toggle and Finance inbox, and the navy/gold design language.
- **A history of custodians per account is not kept.** Changing custodian changes it going forward;
  who logged each line is recorded on the line itself.
- **Historical workbook data is not imported.** The feature starts from the period the company
  chooses to begin with, carrying an opening balance in by hand.

## Dependencies & Constraints

- **Constitution amendment required.** The constitution and `CLAUDE.md` currently limit email to two
  workflows (benefit claims, spec 020; holidays, spec 037). FR-028 adds a third — the payback
  workflow. This was requested directly by the CEO on 2026-08-24; the amendment must be recorded in
  `.specify/memory/constitution.md`, `CLAUDE.md` and the decisions log in the same commit as the
  code.
- **Documented drift found while writing this spec**: the constitution's *Roles* line lists
  `EMPLOYEE`, `HR_ADMIN`, `SUPER_USER` but the schema has carried a fourth, `FINANCE`, since spec
  020. Corrected in the same amendment (Principle IV: a spec/code drift is a documentation bug).
- **Money-rule house rules apply** (`CLAUDE.md`): one derivation of the balance arithmetic, used by
  every screen and every write path; a signed remaining figure so an overdraft is visible; refusal
  rather than clamping; and a per-account lock so two concurrent writes cannot both pass the same
  check.
