# Feature Specification: Medical Charge Reconciliation

**Feature Branch**: `032-medical-charge-reconcile`
**Created**: 2026-08-16
**Status**: Draft

**Input**: Product owner: *"why do we need to open the 2027 cycle? the amount allocated stays allocated until we open the next cycle anyway. or do you suggest another solution?"*

## Context

Spec 027 splits a medical premium across the benefits cycles its policy term covers. It does that
division **once, at commit time**, and writes one row per cycle — which means it can only record a
share for a cycle that **already exists**.

With a term running 15 Jun 2026 → 14 Jun 2027 and a single 2026 cycle, the Jan–Jun 2027 half of
every premium has nowhere to go. It is reported internally as `unallocated` and then dropped.
Opening the 2027 cycle later does not recover it: the code that runs on open only flips rows that
already exist, and the re-price path only adjusts existing rows. Neither creates a missing one.

For one real employee: an 18,352 premium should charge **10,010** to the 2026 pool and **8,342** to
2027. Today the whole 18,352 sits on 2026 with a month count computed against dates that have since
changed, and the 8,342 will never be charged to anything — handing that employee spending room the
company has already spent insuring them.

**The premium and the term are stored on the commitment, so each cycle's share is derivable at any
time.** Deciding it in advance buys nothing and costs the whole feature when a cycle is missing.
This spec moves the division from commit time to **cycle time**: whenever a cycle is created,
opened, or has its dates changed, the shares are worked out then.

The product owner's framing is the design: *the amount stays allocated until the next cycle opens.*
It should be **derived on demand**, not written down early and lost.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Opening a cycle charges the cover that falls inside it (Priority: P1)

HR opens a new benefits cycle. Every medical policy still running that reaches into it is charged
its share of that cycle, with nothing created in advance.

**Independent Test**: With a commitment whose term outlives the current cycle and no next cycle,
create the next cycle and confirm the remaining premium is charged to it.

**Acceptance Scenarios**:

1. **Given** a commitment whose term reaches into a cycle that does not exist, **When** HR creates
   that cycle, **Then** the share belonging to it is charged.
2. **Given** the same, **When** the cycle is opened, **Then** the charge draws against that pool.
3. **Given** a commitment already charged correctly, **When** a cycle is created or opened,
   **Then** nothing is duplicated and no amount changes.
4. **Given** an employee who is no longer active, **When** the cycle opens, **Then** their charge is
   cancelled rather than applied, as today.

---

### User Story 2 - Charges follow the dates HR actually set (Priority: P1)

When HR corrects a cycle's window or the policy term, the shares are recalculated against the
corrected dates rather than staying frozen on the old ones.

**Independent Test**: Commit under one window, change the cycle's dates, and confirm the charge
matches the new overlap.

**Acceptance Scenarios**:

1. **Given** charges calculated under an earlier window, **When** HR changes the cycle's dates,
   **Then** the charges are recalculated against the new dates.
2. **Given** the same, **When** HR changes the policy term's dates, **Then** the same recalculation
   happens.
3. **Given** a recalculation, **When** it completes, **Then** the shares still sum to the premium.

---

### User Story 3 - Settled history is never rewritten (Priority: P1)

A charge already applied to a **closed** cycle is left exactly as it is, whatever a recalculation
would now produce.

**Why this priority**: Equal to the others, and the constraint that makes the rest safe. That money
has been counted against a pool that is shut and reconciled against a real insurer invoice.

**Acceptance Scenarios**:

1. **Given** a charge applied to a closed cycle, **When** anything is reconciled, **Then** its
   amount, status and date are unchanged.
2. **Given** such a frozen charge, **When** the remaining premium is spread, **Then** only the
   amount not already frozen is distributed.
3. **Given** frozen charges that already exceed the premium (HR lowered it), **When** reconciling,
   **Then** no negative charge is written and the existing mismatch warning stands.

### Edge Cases

- **A cycle with no dates set** cannot be overlapped and takes no share; it must not silently
  absorb the whole premium.
- **A commitment with no policy term** keeps today's behaviour: one charge on the committing cycle.
- **A term that no longer overlaps any cycle** after an edit — the premium is not lost; it stays on
  the cycles it can still reach, and the mismatch is shown rather than hidden.
- **Reconciling twice** must change nothing the second time.
- **Overlapping cycles** (HR sets windows that overlap): months are attributed to each cycle they
  fall in by the existing split, and the total still sums to the premium.

## Requirements *(mandatory)*

- **FR-001**: The system MUST recalculate a commitment's cycle charges when a benefits cycle is
  created, opened, or has its window changed, and when a policy term's dates change.
- **FR-002**: Recalculation MUST create a charge for a cycle that overlaps the term but has none.
- **FR-003**: Recalculation MUST leave any charge already applied to a closed cycle unchanged.
- **FR-004**: Only the premium not already frozen MUST be distributed across the remaining cycles.
- **FR-005**: The charges for a commitment MUST sum to its premium whenever the cycles span the term.
- **FR-006**: A charge MUST never be negative.
- **FR-007**: Recalculation MUST be idempotent — running it again changes nothing.
- **FR-008**: A charge on a cycle that is not yet open MUST be scheduled, not applied.
- **FR-009**: A charge for an employee who is not active MUST be cancelled rather than applied.
- **FR-010**: Recalculation MUST NOT change any commitment's premium.
- **FR-011**: A cycle without a window MUST take no share.
- **FR-012**: HR MUST NOT have to create a cycle in advance for a premium to be charged to it.

## Success Criteria *(mandatory)*

- **SC-001**: A premium spanning two cycles is charged in full across them, whether or not the
  second cycle existed when the employee committed.
- **SC-002**: No employee holds pool room the company has already spent on their insurance.
- **SC-003**: Correcting a cycle's dates corrects the charges, with no re-commit.
- **SC-004**: Nothing already reconciled against a closed cycle ever changes.
- **SC-005**: HR opens cycles exactly as they do today; nothing new to remember.

## Assumptions

- **Derivation is safe because the inputs are stored.** The premium and the term live on the
  commitment; the windows live on the cycles. Nothing is guessed.
- **Freezing is by (applied AND closed)**, not by age. An applied charge on an *open* cycle is still
  live and may be corrected.
- **The premium itself is out of scope.** Re-pricing is HR's separate action; this only distributes
  what is already committed.

## Out of Scope

- Changing how a premium is priced or capped.
- Re-evaluating eligibility.
- Extending a cycle's dates as a product feature (spec 031's deferred item); this only reacts
  correctly when dates do change.
