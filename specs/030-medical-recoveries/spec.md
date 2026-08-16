# Feature Specification: Medical Premium Recoveries

**Feature Branch**: `030-medical-recoveries`

**Created**: 2026-08-16

**Status**: Draft

**Input**: Product owner: "Maybe we can have this info for the finance on the leaving of someone and there is losses on the reconciled amounts, so he can understand that we need to get the reconciliation back and follow up with HR on it. That would be an important message for the finance to follow up on and confirm it's closed."

## Context

When an employee leaves mid-policy, the company has already paid the insurer for cover running to the end of the policy term. Spec 027 stops charging that money to a pool nobody holds — the scheduled charge is cancelled — but it stops there. **Nothing follows the money.**

That gap was found by asking who a piece of information actually helps. Shown to HR, the recoverable amount is trivia: HR processed the departure and doesn't reconcile insurer credit notes. Shown to **Finance**, the same number is an outstanding item with an owner and a closing state — chase the insurer, record what came back, confirm it's settled.

The remainder after whatever is recovered is a genuine cost of the person leaving. The point of this feature is not to prevent that loss but to **make it a known number rather than an invisible one**, and to stop recoveries being forgotten.

One arithmetic trap shapes the whole feature. The cancelled charge is **not** the recoverable amount. An employee leaving 30 Nov 2026 under a 1 Jun 2026 – 31 May 2027 term with a 26,000 premium has a cancelled charge of 10,834 — but **13,000** is recoverable, because December sits inside the *already-applied* 2026 charge. Using the cancelled figure under-claims on every leaver.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Finance sees what is owed back (Priority: P1)

When an employee's cover ends mid-term, an open recovery item appears for Finance showing who, when cover ended, the policy term, and the expected recoverable amount with its working.

**Why this priority**: Without it there is no signal at all — the money is silently unclaimed. This alone delivers the feature's value even if closure is manual.

**Independent Test**: Mark a committed employee as left mid-term, then confirm Finance sees an open recovery for the correct amount.

**Acceptance Scenarios**:

1. **Given** an employee with a committed premium of 26,000 under a 1 Jun 2026 – 31 May 2027 term, **When** their cover ends 30 Nov 2026, **Then** an **open** recovery appears for Finance showing an expected 13,000 — six of twelve months.
2. **Given** that recovery, **When** Finance reads it, **Then** it shows the employee, the date cover ended, the policy term, the committed premium, and the months the expectation is based on — so the figure can be checked without recomputing it.
3. **Given** an employee whose cover ends on or after the term's end date, **When** the system evaluates recoveries, **Then** none is created — there is nothing to recover.
4. **Given** an employee with no committed medical, **When** they leave, **Then** no recovery is created.
5. **Given** several open recoveries, **When** Finance opens their page, **Then** open items appear before settled ones.

---

### User Story 2 - Finance closes the loop (Priority: P1)

Finance chases the insurer and settles the item: either recording the amount actually recovered and the date, or writing it off with a reason.

**Why this priority**: Equal to Story 1 — an item that can be seen but never closed becomes a list nobody trusts. Together these are the minimum viable feature.

**Independent Test**: Settle an open recovery with an amount lower than expected, and confirm the shortfall is recorded and the item leaves the open list.

**Acceptance Scenarios**:

1. **Given** an open recovery expecting 13,000, **When** Finance records 11,500 recovered on a given date, **Then** the item is settled, the **1,500 shortfall is recorded**, and it no longer appears as open.
2. **Given** an open recovery, **When** Finance writes it off with a reason, **Then** the item is closed with that reason and a zero amount recovered, and the whole expected amount is the recorded shortfall.
3. **Given** a settled recovery, **When** anyone views it later, **Then** the amount recovered, the date, who settled it, and any reason are visible.
4. **Given** a settled recovery, **When** Finance attempts to settle it again, **Then** the action is refused.
5. **Given** a user without the Finance role, **When** they attempt to settle a recovery, **Then** the action is refused — authority is enforced on the server, not by hiding a button.
6. **Given** an amount recovered greater than expected, **When** Finance records it, **Then** it is accepted and the shortfall is zero rather than negative.

---

### User Story 3 - The pattern across leavers is visible (Priority: P3)

Finance can see total expected, total recovered, and total shortfall across settled recoveries.

**Why this priority**: The individual items already work without it. Its value is spotting a **systematically** short-paying insurer — which one item can never show, but a running total can.

**Independent Test**: Settle several recoveries at partial amounts and confirm the totals reflect the aggregate shortfall.

**Acceptance Scenarios**:

1. **Given** several settled recoveries, **When** Finance views the section, **Then** totals for expected, recovered and shortfall are shown.
2. **Given** no settled recoveries, **When** Finance views the section, **Then** the totals read zero rather than being absent or misleading.

---

### Edge Cases

- **The employee is re-activated after leaving.** Their cover may be reinstated; an open recovery must not be silently deleted, since the insurer may already have been notified. It is Finance's to settle or write off.
- **Cover ends before the policy term starts.** Nothing was paid for that term, so no recovery.
- **No leave date recorded**, only a status change. The expected amount cannot be computed from nothing; the recovery must not invent a date. It should surface as needing a leave date rather than showing a wrong figure.
- **The committed premium is edited after a recovery exists.** The expectation was calculated against the premium at the time; it must not silently restate, for the same reason a closed cycle's charge is never rewritten.
- **A partial month at the end of cover.** Whole-month attribution is used throughout the benefits module; recovery follows the same convention so the two agree.
- **Recovered more than expected** (an insurer crediting a full month, or a fee reversal). Accepted, with a zero shortfall — never a negative one.
- **The same employee leaves under two successive policy terms** (rehired, then left again). Each term produces its own recovery; they must not merge.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST create a recovery item when an employee with a committed medical premium ceases to be active before their policy term ends.
- **FR-002**: The system MUST compute the expected recoverable amount from the **whole months between the date cover ended and the term's end**, as that share of the committed premium — **not** from the cancelled cycle charge.
- **FR-003**: The system MUST show, per recovery, the employee, the date cover ended, the policy term, the committed premium, and the months the expectation is based on.
- **FR-004**: The system MUST NOT create a recovery when cover ends on or after the term's end, or when there is no committed premium for the term.
- **FR-005**: Finance MUST be able to settle a recovery by recording the amount actually recovered and the date it was received.
- **FR-006**: Finance MUST be able to write off a recovery with a reason, recording zero recovered.
- **FR-007**: The system MUST record the shortfall (expected minus recovered), never below zero.
- **FR-008**: The system MUST record who settled a recovery and when.
- **FR-009**: The system MUST prevent a second settlement of an already-settled recovery.
- **FR-010**: The system MUST enforce Finance authority on the server for every settling action.
- **FR-011**: The system MUST list open recoveries before settled ones.
- **FR-012**: The system MUST show totals for expected, recovered and shortfall across settled recoveries.
- **FR-013**: The system MUST NOT recompute an existing recovery's expected amount when the underlying premium is later edited.
- **FR-014**: The system MUST surface a recovery whose leave date is unknown as needing that date, rather than showing a computed figure.
- **FR-015**: The system MUST NOT delete a recovery when an employee is re-activated; it remains Finance's to settle or write off.

### Key Entities

- **Medical premium recovery**: One employee's unused cover under one policy term. Holds the employee, the date cover ended, the term, the premium it was computed from, the months and expected amount, and — once settled — the amount recovered, the date, the shortfall, who settled it, and any write-off reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every employee who leaves mid-term with committed cover produces exactly one recovery item, with no manual step to create it.
- **SC-002**: Finance can state, without recomputing anything, what is expected back from the insurer across all open recoveries.
- **SC-003**: The expected amount reflects every month of unused cover, including any month falling inside an already-applied charge — so no leaver is under-claimed.
- **SC-004**: A recovery cannot be lost: every item is either open or carries a recorded outcome with an owner and a date.
- **SC-005**: The difference between what was expected and what was actually recovered is a recorded figure, so a consistently short-paying insurer becomes visible instead of being absorbed.

## Assumptions

- **Whole-month attribution**, matching every other proration in the benefits module, so the two never disagree by a day.
- **The expectation is a claim, not an authority.** The insurer determines the actual refund; the expected figure exists to check their credit note, and the feature records both rather than assuming they agree.
- **Recoveries are created from the employee ceasing to be active** — the same signal that cancels a scheduled charge — rather than from a separate Finance-initiated action.
- **Finance settles; HR does not.** HR may be chased for paperwork, but the recovery is Finance's item, consistent with the existing payments queue.
- **No email.** Consistent with the standing rule that email is limited to the benefit-claim workflow; this is an in-app list.
- **Existing leavers are not backfilled.** Recoveries begin from when the feature ships; inventing history for departures already settled offline would create phantom work.

## Dependencies

- The medical policy term and committed premium (spec 027) — a recovery is meaningless without a term that outlives the cycle.
- The cancelled cycle charge, as the signal that cover ended mid-term.
- The employee's status and end date.
- The existing Finance role and Finance page.

## Out of Scope

- Automating any communication with the insurer.
- Recovering anything other than medical premium (flexible claims are reimbursements, not prepayments).
- Backfilling recoveries for employees who left before this ships.
- Reversing or adjusting an employee's pool because of a recovery — the pool consequence was settled by spec 027.
