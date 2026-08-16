# Feature Specification: Travel Allowance

**Feature Branch**: `028-travel-allowance`

**Created**: 2026-08-16

**Status**: Built

**Input**: Product owner: the summer allowance should become a year-round travel allowance, moved into the pool basket as a Lifestyle benefit, claimed at 100% with no proof of payment, at the amounts already configured — and full- and part-timers should get the same figures, since the pool ceiling already differs between them.

## Context

The **Summer allowance** was a guaranteed benefit: a fixed amount per tenure band, funded outside the flexible pool, and described in the handbook as paid July–September. In practice the seasonal window existed only as descriptive text — no code ever restricted when it could be claimed.

The product owner asked for three changes: rename it to **Travel allowance**, make it explicitly year-round, and move it **into the flexible basket where it draws from the pool**. The amounts stay exactly as configured today, and the same figures now apply to full- and part-timers alike.

This introduces a benefit shape the catalogue did not previously have: a **fixed allowance** — an entitlement paid at a flat per-band amount, rather than a receipt-based claim reimbursed at a coverage rate.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An employee requests their travel allowance (Priority: P1)

An employee sees Travel allowance among their flexible benefits, at the amount set for their tenure band. They request it in a single action — no price to enter, no receipt to attach — and are paid the whole amount. Their pool falls by that amount.

**Why this priority**: This is the feature. Everything else supports it.

**Independent Test**: Sign in as an employee with a configured band amount, request the allowance, and confirm the payout and the pool both move by the band figure.

**Acceptance Scenarios**:

1. **Given** an employee in the 4–7y band with a 5,000 travel allowance and a 30,000 pool, **When** they open the benefit, **Then** they see the amount, a "no receipt needed" marker, and a single request action — no price field and no proof upload.
2. **Given** the same employee, **When** they request it, **Then** a claim for the full 5,000 is recorded and their remaining pool falls from 30,000 to 25,000.
3. **Given** an employee who has already requested it this cycle, **When** they open the benefit again, **Then** it shows as fully claimed and cannot be requested twice.
4. **Given** an employee whose pool has less left than the allowance, **When** they request it, **Then** they are paid what the pool has left, consistent with every other flexible claim.
5. **Given** an employee at any time of year, **When** they request it, **Then** it is available — there is no seasonal restriction.

---

### User Story 2 - HR configures the amounts in one place (Priority: P2)

HR sets the travel allowance amounts per tenure band on the Amounts tab, alongside the guaranteed amounts they already manage, using one set of figures for all employees.

**Why this priority**: The amounts must be maintainable where the money is configured, not stranded in a table for benefits it no longer belongs to.

**Independent Test**: Change a band amount on the Amounts tab and confirm the employee's benefit reflects it.

**Acceptance Scenarios**:

1. **Given** HR is on the Amounts tab, **When** they view Flexible fixed allowances, **Then** they see one row per allowance with four band amounts — not one table per employment type.
2. **Given** HR edits a band amount and saves, **When** an employee in that band views their benefits, **Then** the new amount is what they can request.
3. **Given** the Summer allowance previously appeared in the guaranteed amounts table, **When** HR views that table after the change, **Then** it is no longer listed there.

---

### Edge Cases

- **A short benefits cycle.** The allowance is pool money, so it prorates with the cycle exactly as the pool ceiling does — a six-month cycle pays half.
- **An employee with no amount configured for their band.** The benefit is not offered rather than being offered at zero.
- **Historical summer claims.** Employees claimed the summer allowance in past cycles. Those records MUST survive the change intact and remain visible in claim history.
- **An allowance larger than half the pool.** The 50% per-benefit cap still applies universally; at real figures it never binds, but the rule is not special-cased away.
- **Part-timers.** The same band amount applies, against a smaller pool ceiling — so it consumes a larger share of a part-timer's budget. This is accepted: the ceiling is the mechanism that differentiates them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A flexible benefit MUST be able to carry a fixed per-tenure-band amount, making it an entitlement rather than a receipt-based claim.
- **FR-002**: A fixed allowance MUST use one set of band amounts for all employment types.
- **FR-003**: An employee MUST be able to request a fixed allowance in one action, with no amount entered and no proof attached.
- **FR-004**: Requesting a fixed allowance MUST pay the full band amount and draw it from the employee's pool.
- **FR-005**: A fixed allowance MUST prorate with the benefits cycle, as the pool it draws from does.
- **FR-006**: A fixed allowance MUST be claimable at any point in the open cycle, with no seasonal restriction.
- **FR-007**: A second request against a fully-claimed allowance MUST be refused, with a message naming the allowance rather than the 50% cap.
- **FR-008**: A request MUST be paid down to the pool remainder when the pool has less left than the allowance, consistent with receipt-based claims.
- **FR-009**: The 50%-per-benefit cap MUST continue to apply to fixed allowances.
- **FR-010**: HR MUST be able to view and edit fixed-allowance amounts per tenure band on the Amounts tab.
- **FR-011**: The travel allowance MUST take its amounts from the existing Summer allowance configuration rather than newly-entered figures.
- **FR-012**: The Summer allowance MUST be withdrawn from employees while retaining its claim history and its configured amounts.

### Key Entities

- **Fixed allowance**: A flexible catalogue benefit carrying four per-tenure-band amounts. Its presence of any band amount is what distinguishes it from a coverage-rate benefit.
- **Travel allowance**: The first fixed allowance — the renamed, relocated summer allowance, in the Lifestyle category, paid in full with no proof.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can obtain their travel allowance in a single action with nothing to type or upload.
- **SC-002**: The amount paid equals the configured band amount, and the employee's pool falls by exactly that amount.
- **SC-003**: Every historical summer claim remains present and viewable after the change.
- **SC-004**: HR maintains the amounts in one table, with no second set of figures that could fall out of step.
- **SC-005**: The travel allowance is available in every month of an open cycle.

## Assumptions

- **The allowance is taken in one request, not in parts.** With no receipt to itemise, partial requests would add a step without adding meaning.
- **Part-timers accept a proportionally larger pool cost.** Confirmed by the product owner: the differing pool ceilings are the intended mechanism, so a second set of figures is unnecessary.
- **Existing summer claims are not migrated onto the new benefit.** They belong to a benefit that existed at the time and stay attached to it.
- **The seasonal Jul–Sep description is dropped**, since it was never enforced and the benefit is now explicitly year-round.

## Out of Scope

- Any change to receipt-based flexible benefits or their coverage rates.
- Additional fixed allowances beyond travel — the shape is general, but only one benefit uses it.
- Restoring or enforcing a seasonal claim window.
