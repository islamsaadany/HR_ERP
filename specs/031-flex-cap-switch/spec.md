# Feature Specification: Per-Cycle 50% Cap Switch

**Feature Branch**: `031-flex-cap-switch`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "a special case where we need some sort of a switch for it. in case of starting the benefits cycle mid year the value of the remaining from the basket is very small so applying the 50% rule is tricky .. so let's have an exceptional option for editing the cycle when I adjust it to apply the 50% rule or disable it for the cycle. and maybe after if we find proper cash flow we can extend the cycle so they get the full amounts back and apply the 50% and then it would be ok on what was claimed already anyway and we continue from there."

## Context

The 50%-per-benefit cap exists so one benefit cannot swallow an employee's whole pool. That is
right over a full year. It is wrong over a short one.

When a plan year opens mid-year, the pool ceiling is prorated to the months the cycle actually
covers. A 30,000 ceiling on a cycle opening 1 August prorates to 12,500, and the 50% rule then
caps **any single benefit at 6,250**. An employee whose real need is one significant expense gets
a fifth of the annual allowance, and a rule meant to encourage variety instead stops them using
the pool at all. The shorter the cycle, the more the cap binds — the two rules compound rather
than compose.

The product owner's fix is a deliberate, per-cycle exception: when HR knows a cycle is short, they
switch the 50% rule off **for that cycle**, and the pool ceiling alone governs spend.

**The flag belongs to the cycle, not to the platform.** A global setting would mean flipping it
today changes the rules a closed cycle's claims were judged under — the record of what was allowed
when would no longer be recoverable. Freezing the rule with the cycle is what makes the exception
auditable rather than a hidden mode.

**Re-enabling can never claw anything back.** The cap governs a *new* claim against the ceiling in
force when it is made. A benefit already past the line simply receives nothing further; no
approved claim is invalidated, reduced, or reversed. This is not a concession — it is the only
behaviour consistent with a claim being reimbursement of money the employee has already spent
against a proof of payment.

The product owner's follow-on idea — later *extending* a short cycle so the ceiling returns to
full — is deliberately **out of scope here** and is noted with its arithmetic in Assumptions,
because it is what makes re-enabling the cap safe rather than merely harmless.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR disables the cap on a short cycle (Priority: P1)

HR opens a plan year part-way through the year, sees that the prorated ceiling makes the 50% rule
punitive, and turns the cap off for that cycle. Claims in that cycle are then bounded only by the
pool ceiling.

**Why this priority**: This is the entire feature. Without it the short cycle is unusable as
designed.

**Independent Test**: Open a mid-year cycle, disable the cap, and confirm an employee can claim
more than half the ceiling on one benefit while still being unable to exceed the ceiling.

**Acceptance Scenarios**:

1. **Given** an open plan year with the cap enabled, **When** HR turns it off, **Then** the change
   takes effect for that cycle only and is recorded with who made it and when.
2. **Given** a cycle with the cap disabled, **When** an employee claims more than 50% of the
   ceiling on one benefit, **Then** the claim is allowed up to the pool ceiling.
3. **Given** a cycle with the cap disabled, **When** an employee's claim would exceed the **pool
   ceiling**, **Then** it is still paid down to what the pool has left — disabling the per-benefit
   cap does not disable the ceiling.
4. **Given** a closed plan year, **When** HR views it, **Then** its cap setting cannot be changed.
5. **Given** a viewer who is not an admin, **When** they attempt to change the setting, **Then**
   the change is refused.

---

### User Story 2 - Employees are told the rule that applies to them (Priority: P1)

An employee looking at Benefits during a cap-disabled cycle sees that the 50% limit is not in
force, and the amounts shown to them reflect the rule actually being enforced.

**Why this priority**: Equal to Story 1. A client that shows a cap the server is not enforcing
tells the employee they cannot afford something they can — the feature would be invisible and the
product would be lying about money.

**Independent Test**: With the cap disabled, confirm the benefits page states the limit is off and
its previewed figures match what the server pays.

**Acceptance Scenarios**:

1. **Given** a cycle with the cap disabled, **When** an employee views Benefits, **Then** the page
   states plainly that the 50% per-benefit limit does not apply this cycle.
2. **Given** the same, **When** the employee previews a claim, **Then** the figure shown matches
   what the server will actually reimburse.
3. **Given** a cycle with the cap enabled, **When** an employee views Benefits, **Then** nothing
   about the page changes from today.

---

### User Story 3 - HR re-enables the cap without disturbing what was claimed (Priority: P2)

HR turns the cap back on part-way through a cycle. Claims already approved stand exactly as they
are; the cap governs what is claimed from that point.

**Why this priority**: It is the exit from the exception. Not needed for the exception to work, but
without a safe exit the switch is one-way in practice and HR will not use it.

**Independent Test**: Disable the cap, let an employee claim past 50% on one benefit, re-enable the
cap, and confirm the existing claim is untouched while further claims on that benefit are refused.

**Acceptance Scenarios**:

1. **Given** a benefit claimed past 50% of the ceiling while the cap was off, **When** HR re-enables
   the cap, **Then** the existing claim is unchanged in amount and status.
2. **Given** the same, **When** the employee tries to claim more on that benefit, **Then** they are
   told that benefit has nothing left — with no negative amount and no reversal.
3. **Given** the same, **When** the employee claims on a *different* benefit, **Then** it is
   evaluated normally against the cap and the remaining pool.

---

### Edge Cases

- **A claim in flight when the setting changes.** The rule applied is the one in force at the moment
  the claim is evaluated by the server, never the one the employee's page was rendered under.
- **A benefit already past 50% when the cap is re-enabled.** Its remaining allowance is zero, not
  negative, and nothing is reclaimed.
- **The pool ceiling with the cap off.** Still enforced. Disabling the per-benefit cap must not be
  readable as disabling the ceiling.
- **Medical.** Already exempt from the 50% cap; the switch must not change medical handling in
  either position.
- **Fixed allowances** (travel, spec 028) are bounded by their own band amount. With the cap off
  they stay bounded by that amount — an entitlement does not grow because a different limit was
  lifted.
- **A cycle with no proration window** (a full-year cycle) may still have the cap disabled. It is an
  HR judgement, not a computed consequence of cycle length; the product must not silently re-enable
  it.
- **A legacy cycle predating this feature** behaves exactly as it does today — the cap applies.
- **Two admins toggling at once.** The last write wins and is the one recorded; there is no
  half-applied state because the setting is a single value.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST hold the 50%-per-benefit cap as an on/off setting **on each plan
  year**, defaulting to **on**.
- **FR-002**: Admins MUST be able to change the setting **while the plan year is open**.
- **FR-003**: The system MUST refuse the change when the plan year is not open.
- **FR-004**: The system MUST record who changed the setting and when.
- **FR-005**: The system MUST enforce the setting on the server when evaluating every claim, using
  the setting belonging to the claim's own plan year.
- **FR-006**: With the cap disabled, a single benefit MUST be bounded by the pool ceiling rather
  than by half of it.
- **FR-007**: The pool ceiling MUST remain enforced regardless of the setting.
- **FR-008**: A fixed allowance MUST remain bounded by its own band amount regardless of the
  setting.
- **FR-009**: Medical handling MUST be unchanged by the setting.
- **FR-010**: Changing the setting MUST NOT alter, reverse, or re-evaluate any existing claim.
- **FR-011**: With the cap re-enabled, a benefit already at or past the cap MUST have zero
  remaining — never a negative amount and never a clawback.
- **FR-012**: Employees MUST be told, on the Benefits page, when the 50% limit does not apply to
  the current cycle.
- **FR-013**: Any figure previewed to an employee MUST match what the server would reimburse under
  the setting in force.
- **FR-014**: The setting MUST be changeable only by an admin, enforced on the server.
- **FR-015**: A plan year's setting MUST NOT be affected by any other plan year's setting.

### Key Entities

- **Plan year**: gains an explicit per-benefit-cap setting, plus who last changed it and when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a cycle prorated to 5 of 12 months, an employee can direct their whole remaining
  pool to a single benefit when HR has disabled the cap — where today they could reach at most half
  of it.
- **SC-002**: No employee can spend beyond their pool ceiling in either setting.
- **SC-003**: Every claim is judged by the rule its own cycle carries, so a closed cycle's
  decisions remain explicable after the setting is changed on a later cycle.
- **SC-004**: Re-enabling the cap changes no existing claim's amount or status.
- **SC-005**: The amount an employee is shown before claiming equals the amount they are paid, in
  both settings.
- **SC-006**: Anyone reviewing a cycle can see whether the cap was in force, who decided that, and
  when.

## Assumptions

- **Default is on.** The cap is the rule; disabling it is the exception, so a plan year created
  without a decision keeps today's behaviour.
- **The setting is a per-cycle judgement, not a computed one.** The product does not infer it from
  cycle length. HR decides, because the trigger is cash flow and circumstance, not arithmetic.
- **Re-enabling is safe, and extending a cycle makes it safer.** The product owner's plan is to
  extend a short cycle later so the full ceiling is restored. The arithmetic supports this: with a
  ceiling of C₁ while the cap is off, the most any one benefit can hold is C₁ (the pool bounds it).
  After extension to C₂ with the cap back on, that benefit's cap is C₂/2. So **no claim can ever
  end up over cap provided C₂ ≥ 2 × C₁** — restoring a 5-month cycle (12,500 of 30,000) to a full
  one (30,000) satisfies this comfortably. Where it does not, FR-011 still guarantees zero
  remaining rather than a clawback.
- **No employee-facing history of the setting.** They see the rule in force now; the audit of who
  changed it serves HR and Finance.
- **Claims already submitted and awaiting review** are unaffected — they were evaluated at
  submission, which is when the money was committed to.

## Dependencies

- The plan-year window and proration (spec 019), which is what makes a short cycle's ceiling small.
- The claim rule engine (spec 018) and the clamping behaviour that pays a claim down to what
  remains rather than refusing it.
- The admin plan-year controls, and their existing role gating.

## Out of Scope

- **Extending or otherwise editing a cycle's dates.** It re-prorates every ceiling and would
  require recomputing the medical cycle charges that spec 027 splits across cycles by month
  overlap — including charges already applied. Its own spec.
- Changing the 50% figure itself to some other percentage.
- Any per-employee or per-benefit exception; the switch is per cycle and applies to everyone in it.
- Re-evaluating, adjusting, or reversing existing claims.
- Applying the setting retroactively to a closed cycle.
