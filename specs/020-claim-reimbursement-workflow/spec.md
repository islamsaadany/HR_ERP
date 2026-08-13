# Feature Specification: Claim Reimbursement Workflow & Email Notifications

**Feature Branch**: `020-claim-reimbursement-workflow`

**Created**: 2026-08-10

**Status**: Draft

**Input**: User description: "Benefit-claim reimbursement workflow with email notifications via Resend — replace the single-step HR release of a flexible benefit claim with a staged Employee → HR → Finance → Employee workflow, notifying each party by email at the right moment."

## Overview

Today a flexible benefit claim moves from **Pending** to **Released** in a single HR action, and no one is emailed — the employee only learns the outcome by returning to the app. This feature introduces a **three-party reimbursement workflow** with a clear separation of duties (HR approves, Finance pays) and **email notifications** at each hand-off, so each party is prompted when it is their turn to act and the employee is told the outcome without having to check the app.

This **reverses the project's earlier "no emails, ever (v1)" decision** for this one workflow. It applies to **flexible benefit claims only** — the guaranteed-benefit bulk "Release" sheet and medical commitments keep their current behavior.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Employee submits a claim and HR is notified (Priority: P1)

An employee files a flexible benefit claim against a catalog item while the plan year is open, entering the amount they paid. The claim enters the **Submitted** state (awaiting HR review) and consumes their allowance exactly as a pending claim does today. The HR team receives an email that a new claim is waiting for review, with the employee name, benefit, amount claimed, and covered amount.

**Why this priority**: This is the entry point of the whole workflow and the first notification hand-off. Without it there is no queue for HR to act on. It is the minimum viable slice: an employee can claim and HR is prompted.

**Independent Test**: Submit a claim as an employee; confirm the claim shows **Submitted** in the employee's claim list, that it counts against the pool/50% caps, and that the configured HR inbox receives a "new claim to review" email (or, with email disabled/unconfigured, the claim is still created and no email is attempted).

**Acceptance Scenarios**:

1. **Given** the plan year is open and email notifications are enabled and configured, **When** an employee submits a valid claim, **Then** the claim is stored as **Submitted**, it counts toward the employee's ceilings, and the HR inbox receives a notification with the claim details.
2. **Given** email notifications are disabled or no email service is configured, **When** an employee submits a valid claim, **Then** the claim is still stored as **Submitted** and no email is sent, with no error shown to the employee.
3. **Given** a claim that would breach a server-side money rule (pool ceiling or 50%-per-benefit cap), **When** the employee submits it, **Then** it is rejected by the rules as today and no workflow email is sent.

---

### User Story 2 - HR reviews the claim; Finance is notified on approval, employee on rejection (Priority: P1)

An HR reviewer opens the submissions queue, sees each **Submitted** claim, and either **Approves** it (advancing it to **Approved — awaiting payment**) or **Rejects** it (with an optional reason). On approval, the Finance team is emailed that a payment should be released, with the payee and the amount to transfer. On rejection, the employee is emailed that their claim was declined, including the reason if one was given.

**Why this priority**: This is the decision gate and two of the four notifications. It is independently testable and delivers value on its own (HR can triage; employees hear about rejections).

**Independent Test**: As HR, approve one Submitted claim and reject another (with a reason); confirm the first becomes **Approved** and the Finance inbox is emailed with the payee + covered amount, and the second becomes **Rejected** and the employee is emailed with the reason.

**Acceptance Scenarios**:

1. **Given** a **Submitted** claim, **When** HR approves it, **Then** its state becomes **Approved — awaiting payment**, it continues to count toward the employee's ceilings, and the Finance inbox receives a "release payment" email with payee and covered amount.
2. **Given** a **Submitted** claim, **When** HR rejects it with a reason, **Then** its state becomes **Rejected**, it no longer counts toward the employee's ceilings, and the employee receives an email stating the claim was declined and the reason.
3. **Given** a **Submitted** claim, **When** HR rejects it without a reason, **Then** the employee still receives a courteous rejection email (no reason line).
4. **Given** a claim already **Approved** or **Reimbursed**, **When** HR views it, **Then** the approve/reject actions are no longer offered (the decision has moved to Finance / is complete).

---

### User Story 3 - Finance releases payment and the employee is notified of reimbursement (Priority: P1)

A member of the **Finance** team signs in and sees an **"awaiting payment"** queue of all **Approved** claims. They transfer the money outside the app, then confirm the transfer in-app — recording the amount transferred and the date. The claim moves to **Reimbursed** and the employee is emailed that their claim has been reimbursed.

**Why this priority**: This closes the loop and delivers the payoff notification to the employee. It also establishes the new Finance role and its separation from HR.

**Independent Test**: As a Finance user, open the awaiting-payment queue, confirm a payment (entering amount + date); confirm the claim becomes **Reimbursed**, the transfer amount/date are stored, and the employee receives a "reimbursed" email. Confirm an HR-only (non-Finance, non-Super-User) user cannot access the queue or confirm payments.

**Acceptance Scenarios**:

1. **Given** an **Approved** claim, **When** a Finance user confirms the transfer with an amount and date, **Then** the claim becomes **Reimbursed**, the transferred amount and date are recorded, and the employee receives a reimbursement email.
2. **Given** a user without the Finance capability (a plain HR Admin or Employee), **When** they attempt to view or act on the payments queue, **Then** access is denied server-side.
3. **Given** a Super User, **When** they open the payments queue, **Then** they can act on it (Super User is a superset of Finance).
4. **Given** an email service outage, **When** a Finance user confirms a transfer, **Then** the claim still becomes **Reimbursed** and the failure to email does not roll back or block the state change.

---

### User Story 4 - Super User configures the notification settings (Priority: P2)

A Super User opens the admin settings and manages the email notifications: a **master on/off toggle**, the **HR team inbox** address, the **Finance team inbox** address, and a **from-name**. These control who receives the hand-off emails and whether emails are sent at all.

**Why this priority**: Needed for the notifications to reach the right people and to let the org turn the feature off, but the workflow itself (stories 1–3) functions without changing these once sensible defaults/values are in place.

**Independent Test**: As a Super User, set the HR and Finance inboxes and toggle notifications off then on; confirm that with the toggle off no workflow emails are sent, and that with it on the emails go to the addresses configured.

**Acceptance Scenarios**:

1. **Given** the settings screen, **When** a Super User saves an HR inbox and a Finance inbox, **Then** subsequent hand-off emails are addressed to those inboxes.
2. **Given** the master toggle is off, **When** any workflow event occurs, **Then** no email is sent, while all in-app state changes still happen.
3. **Given** a non-Super-User admin, **When** they attempt to open these settings, **Then** access is denied.

---

### Edge Cases

- **Email service unconfigured (no key/from-address):** every in-app action still succeeds; emails are silently skipped (parity with the parked Google-provider pattern). Nothing surfaces to end users.
- **Email service errors at send time:** the send is fire-and-forget; a failure is logged but never rolls back or blocks the claim's state change.
- **Inbox address blank while notifications are on:** if the relevant team inbox is not set, that specific email is skipped (and ideally surfaced to admins as a soft "inbox not configured" warning); the state change still proceeds.
- **HR-recorded manual/back-filled claim (spec 016):** a claim HR records as already paid should land directly in **Reimbursed** without re-triggering the submit/approve emails (it represents a past event). It still counts toward ceilings.
- **Rejecting a claim that already consumed allowance:** on rejection the claim stops counting toward the pool and 50% caps, freeing that allowance.
- **Plan year closes mid-workflow:** claims already in the pipeline can still be approved/paid; closing the year prevents new submissions, not resolution of existing ones.
- **Amount transferred differs from covered amount:** Finance records the actual transferred amount; the covered amount computed by the rules remains the reference. (Any discrepancy is visible to admins; reconciliation policy is out of scope.)
- **Employee has no email on file / invalid address:** the employee-facing emails (rejection, reimbursement) are skipped/logged; in-app status still reflects the outcome.

## Requirements *(mandatory)*

### Functional Requirements

**Claim lifecycle**

- **FR-001**: The system MUST model a flexible benefit claim with the lifecycle **Submitted → Approved → Reimbursed**, plus a terminal **Rejected** state reachable from Submitted. This supersedes the prior Pending/Released naming.
- **FR-002**: Submitting a claim MUST place it in **Submitted** (awaiting HR), preserving today's server-side money-rule enforcement (pool ceiling and 50%-per-benefit cap) at submit time.
- **FR-003**: The money-rule engine MUST count **Submitted + Approved + Reimbursed** claims toward a benefit's cap and the employee's pool ceiling (i.e., any non-rejected claim consumes allowance); **Rejected** claims MUST NOT count.
- **FR-004**: HR MUST be able to **Approve** a Submitted claim (→ Approved) or **Reject** it (→ Rejected) with an optional reason. Approve/Reject MUST only be available from the Submitted state.
- **FR-005**: Finance MUST be able to **Confirm payment** on an Approved claim (→ Reimbursed), recording the amount transferred and the date of transfer. Confirm payment MUST only be available from the Approved state.
- **FR-006**: A claim HR records as already paid (manual back-fill) MUST be storable directly as **Reimbursed** without emitting the submit/approve notifications, and MUST count toward ceilings.

**Roles & access**

- **FR-007**: The system MUST add a **Finance** role to the existing EMPLOYEE / HR_ADMIN / SUPER_USER set. Finance users MUST be able to view and act on the awaiting-payment queue.
- **FR-008**: SUPER_USER MUST be a superset that can also view and act on the payments queue.
- **FR-009**: All stage transitions MUST be gated server-side by the acting role: only HR (or Super User) may approve/reject; only Finance (or Super User) may confirm payment. A plain HR Admin MUST NOT be able to confirm payments, and a plain Finance user MUST NOT be able to approve claims. (Whether HR/Finance are mutually exclusive per person is an assignment decision, not enforced by this feature.)
- **FR-010**: The Finance payments queue MUST list all **Approved** claims with the payee, benefit, and covered amount to transfer.

**Notifications**

- **FR-011**: On claim **submission**, the system MUST notify the configured **HR inbox** with the employee name, benefit, amount claimed, and covered amount.
- **FR-012**: On **approval**, the system MUST notify the configured **Finance inbox** with the payee and the covered amount to release.
- **FR-013**: On **rejection**, the system MUST notify the **employee** that the claim was declined, including the reason when provided.
- **FR-014**: On **reimbursement**, the system MUST notify the **employee** that the claim has been reimbursed.
- **FR-015**: All notifications MUST be **fire-and-forget**: a delivery failure MUST be logged but MUST NOT roll back or block the in-app state change that triggered it.
- **FR-016**: The email subsystem MUST be **switched off cleanly** when the email service is not configured (no credentials) — in-app actions succeed and no email is attempted.
- **FR-017**: A **master notifications toggle** MUST let a Super User disable all workflow emails without affecting in-app behavior.

**Settings**

- **FR-018**: A Super User MUST be able to configure, in app settings: the master notifications on/off toggle, the HR team inbox address, the Finance team inbox address, and a from-name.
- **FR-019**: Email service **credentials and the from-address MUST NOT be stored in the database or shown in any UI**; they are supplied only via the deployment environment.
- **FR-020**: If a required team inbox is unset while notifications are on, the system MUST skip that specific email (and SHOULD surface a soft admin warning), while still completing the state change.

**Employee-facing presentation**

- **FR-021**: The employee's claim views MUST display the new lifecycle via status chips: **Submitted**, **Approved**, **Reimbursed**, **Rejected** (replacing the prior pending/released presentation), with existing per-benefit claim summaries updated to the new statuses.

**Documentation**

- **FR-022**: Delivering this feature MUST update the steering documents (CLAUDE.md "no emails, ever" rule and PROJECT_DETAILS.md benefits/claims description) in the same change, and record the reversed decision in the plan's decision log.

### Key Entities *(include if feature involves data)*

- **Benefit Claim**: A flexible benefit reimbursement request by an employee. Attributes: the employee (payee), the catalog benefit, amount claimed, covered amount (computed by the rules), **status** (Submitted / Approved / Reimbursed / Rejected), rejection reason (optional), amount transferred (optional, set at reimbursement), transfer date (optional), and the actors/timestamps of each transition. Supersedes the prior pending/released claim shape.
- **Role / Capability**: The set EMPLOYEE / HR_ADMIN / SUPER_USER extended with **Finance**. Determines who may approve/reject vs. confirm payment.
- **Notification Settings**: Super-User-managed app settings — master on/off toggle, HR inbox, Finance inbox, from-name. Excludes secrets (credentials, from-address), which live in the environment.
- **Notification Event**: A hand-off email tied to a claim transition (submitted → HR, approved → Finance, rejected → employee, reimbursed → employee), each carrying the details relevant to that recipient.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of claim submissions, approvals, rejections, and reimbursements complete their in-app state change successfully even when the email service is disabled, unconfigured, or failing (no user-visible error, no lost state).
- **SC-002**: When notifications are enabled and configured, every one of the four hand-off events results in exactly one email to the correct recipient (HR inbox, Finance inbox, or the employee) containing the required details.
- **SC-003**: A claim is never actionable out of order — no claim can be paid before it is approved, and no approve/reject action is offered once a claim has advanced; verified across the full state machine.
- **SC-004**: Money rules hold unchanged: the sum of a benefit's non-rejected claims never exceeds its cap, and an employee's non-rejected claims plus committed medical never exceed their pool ceiling — enforced server-side regardless of client input.
- **SC-005**: Access control holds: a plain HR Admin cannot confirm a payment and a plain Finance user cannot approve a claim, in 100% of attempts.
- **SC-006**: The employee can determine a claim's current stage (Submitted / Approved / Reimbursed / Rejected) at a glance from their claim list without contacting HR.

## Assumptions

- **Email provider**: Delivery uses the Resend email service via a server-side API key and from-address supplied as environment variables; no other provider is in scope. With the key absent, the subsystem is inert (matching the existing parked Google-provider pattern).
- **Scope boundary**: This workflow governs **flexible benefit claims only**. The guaranteed-benefit bulk "Release" sheet and one-time **medical commitments** are explicitly out of scope and unchanged.
- **Team inboxes**: HR and Finance are notified at a single **shared team inbox** each (configurable), not per-individual-user mailboxes.
- **Rejection emails**: Employees are emailed on rejection as well as on reimbursement (both loop-closing notifications), per product decision.
- **Finance is a distinct role**: Finance staff sign in and confirm payments themselves (separation of duties); a person may hold Finance in addition to other roles, but the money-confirmation step is gated to Finance/Super User.
- **Transferred amount**: Finance records the actual amount transferred, which is expected to equal the covered amount; reconciling any discrepancy is an operational concern outside this feature.
- **No employee opt-out / preferences**: There is no per-employee email preference center in this feature; the master toggle is the global control.
- **Localization / templating**: Emails are English, plain and transactional, consistent with the app's tone; rich branded templates are not required for v1 of this feature.
- **Persistence & migration**: The existing claim records are migrated to the new status vocabulary (existing "released" claims map to "Reimbursed"); the exact migration is handled at implementation time via the project's Neon SQL hand-off process.
- **Auditability**: Each transition records who acted and when, so the claim history shows the full Submitted → Approved → Reimbursed (or Rejected) trail.

## Follow-up — reimbursed-record dates & Finance edit (2026-08-13)

Operational refinement to the Finance **Payments** view; no new state, no schema change.

- **Both dates visible.** The Payments table shows the **Approved** date (HR decision, `decidedAt`) and a dedicated **Reimbursed on** column (the transfer date, `transferDate`) — previously the reimbursement date was only tucked into the payment cell.
- **Finance can correct a reimbursed record.** Each REIMBURSED row has an inline **Edit** (`ReimbursedCell` → `editPayment`) to fix the **transferred amount and/or the reimbursement date** (e.g. a mistyped date). It is Finance/Super-User-guarded, validates (positive amount, valid non-future date, record still REIMBURSED), leaves **status**, **`paidById`**, and **`paidAt`** unchanged, and **sends no email** — the employee was already notified at reimbursement (per the "Rejection/reimbursement emails" loop), so a bookkeeping correction is deliberately silent. Realizes the "Finance records the actual amount transferred" assumption by making that record correctable after the fact while preserving the audit of who/when it was originally confirmed.
