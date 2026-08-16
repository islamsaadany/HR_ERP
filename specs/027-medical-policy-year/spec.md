# Feature Specification: Medical Policy Year

**Feature Branch**: `027-medical-policy-year`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Medical policy year — a separate, HR-set medical insurance window (currently 1 June 2026 to 30 June 2027) that runs independently of the benefits plan-year cycle. The employee commits once to the whole policy premium as today, but the pool only absorbs the share of the premium whose months fall inside the current benefits cycle; the remainder is charged to the next cycle's pool when it opens. Must handle a window longer than 12 months (the current one is 13), which today's `remainingWholeMonths` silently caps at 12. Medical eligibility stays at 3 months of service and medical stays exempt from the 50% per-benefit cap. HR needs to see both the full committed premium and the amount charged to each cycle."

## Context

Today the platform has **one** cycle. A single benefits plan year carries admin-set start and end dates, and those same dates drive the flexible pool, the guaranteed benefits, *and* the medical premium's proration. The medical commitment is stored against that plan year and locked once made.

The company's actual medical insurance does not follow the benefits cycle. It is a contract with an insurer that renews on its own schedule — **1 June → 31 May**, currently 1 Jun 2026 → 31 May 2027. The benefits plan year is always the full calendar year, Jan–Dec (confirmed 2026-08-16), so **every policy term straddles exactly two cycles**: 7 months (Jun–Dec) in one, 5 months (Jan–May) in the next. Two problems follow:

1. **A premium is charged to a cycle it only partly covers.** A premium committed in June buys cover to the following May, but the whole of it lands on the current calendar-year pool. In 2026 that means an employee's entire annual pool absorbs twelve months of premium for seven months of cover, leaving them little or no flexible budget — and it misstates a departing employee's consumption, and lands a mid-term rate change entirely in one calendar year.

2. **Nothing marks the insurance renewal.** Because the commitment is keyed to the benefits plan year, a policy that renews mid-cycle produces no re-commitment event, and a benefits cycle that turns over mid-policy has no record of what the employee is already committed to.

The resolution agreed with the product owner: **committing to a premium and consuming a pool are two different events.** The employee commits once to the whole policy — insurance cannot be bought in halves — but each benefits cycle's pool absorbs only the months of that premium which fall inside it. The remainder is charged to the next cycle's pool when it opens.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The pool absorbs only this cycle's share of the premium (Priority: P1)

An employee commits to medical cover under a policy term offset from the benefits cycle. They are committed to the full annual premium, and HR owes the insurer that full amount — but the employee's flexible pool for the current cycle is only reduced by the portion of cover that falls inside that cycle. The rest is carried and charged to the next cycle's pool when it opens.

**Why this priority**: This is the whole feature. Without it, an offset policy term lets a full-term premium land on a pool that only covers part of it, taking flexible budget the employee should still have.

**Independent Test**: With the Jan–Dec cycle and the Jun–May policy term, commit an employee to medical and confirm the pool falls by the 7-month share while the recorded commitment shows the full premium.

**Acceptance Scenarios**:

1. **Given** a medical policy running 1 Jun 2026 → 31 May 2027 with a committed premium of EGP 40,000, and the Jan–Dec 2026 benefits cycle, **When** the employee commits, **Then** the commitment records the full EGP 40,000, the 2026 pool is reduced by the 7-month share (EGP 23,333), and EGP 16,667 is carried as a charge against the 2027 cycle.
2. **Given** the same commitment, **When** the employee views their pool, **Then** the amount shown as used for medical is the amount charged to the cycle they are looking at — not the full premium.
3. **Given** a benefits cycle whose dates match the medical policy term exactly, **When** an employee commits, **Then** the entire premium is charged to that one cycle and nothing is carried, matching today's behaviour.
4. **Given** a carried medical charge from a previous cycle, **When** HR opens the next benefits cycle, **Then** that charge is applied to the employee's new pool automatically, without HR re-entering anything.
5. **Given** a carried charge has been applied to the new cycle, **When** the employee claims flexible benefits in that cycle, **Then** the carried medical amount counts toward their pool ceiling exactly as a same-cycle medical charge would.

---

### User Story 2 - HR sets and sees the medical policy window (Priority: P2)

HR configures the insurance policy's own start and end dates, independently of the benefits plan-year dates, and can see for any employee both the full premium they are committed to and how much of it each benefits cycle absorbed.

**Why this priority**: The split in Story 1 is invisible and unauditable without this. HR reconciles against insurer invoices covering the policy term, while the platform's money model runs on benefits cycles — they need both numbers to tie out.

**Independent Test**: Set a medical window different from the plan-year window, commit an employee, and confirm HR sees the policy dates, the full premium, the amount charged to the current cycle, and the amount carried.

**Acceptance Scenarios**:

1. **Given** HR is configuring benefits, **When** they set a medical policy start and end date, **Then** those dates are stored independently of the plan-year start and end dates and neither overwrites the other.
2. **Given** an employee with a committed medical premium split across two cycles, **When** HR views that employee's medical commitment, **Then** they see the full premium, the amount charged to each cycle, and the policy term it covers.
3. **Given** no medical policy window has been set, **When** an employee commits to medical, **Then** the system falls back to the benefits plan-year window and behaves exactly as it does today, so an unconfigured installation is never worse off.

---

### User Story 3 - The term's real length is what prices it (Priority: P2)

Whatever length HR sets the policy term to, that is the length it is priced and split by — never silently rounded to twelve months.

**Why this priority**: The window is HR-set from date to date, so nothing stops a term of other than twelve months being entered — a transition period, or simply a typo. The existing month-counting helper stops at twelve, so such a term would be silently mis-split with no error and no visible symptom. This is a **guard against a bad configuration**, not a fix for a live error: the real term is 12 months (corrected 2026-08-16, having originally been described as 1 Jun 2026 → 30 Jun 2027).

**Independent Test**: Configure a term of other than twelve months and confirm the month count, per-month share, and cycle split all reflect its true length.

**Acceptance Scenarios**:

1. **Given** a medical policy running 1 Jun 2026 → 31 May 2027, **When** the system counts the policy's months, **Then** it counts 12.
2. **Given** a term of any other length (e.g. 13 months, or 6), **When** the system counts its months, **Then** it counts that length rather than capping at 12.
3. **Given** a premium that does not divide evenly by the term's month count, **When** it is split, **Then** the charges across all cycles sum back to exactly the premium, with no month unaccounted for and no rounding drift.
4. **Given** a mid-term joiner, **When** their premium is prorated, **Then** the proration is against the remaining months of the *policy term*, not against the benefits cycle.

---

### Edge Cases

- **A cycle split leaves a rounding remainder.** Dividing a premium across months rarely lands on whole currency units. The shares charged across every cycle MUST sum to exactly the committed premium; the reconciling remainder goes to the final cycle rather than being dropped or duplicated.
- **The employee leaves mid-policy.** A carried charge exists for a cycle the employee will not be present for. It MUST NOT be applied to their pool, and MUST NOT be recorded as owed: premium paid in advance for cover after the leave date is recovered from the insurer, so the charge is **cancelled**. HR sees it as not charged, with the recoverable period — which begins at the leave date and so may include part of an already-applied charge.
- **HR edits or removes a commitment after a split.** Medical commitments are HR-editable after locking. Changing the premium MUST re-split it across cycles, including any charge already applied to an open cycle.
- **The medical policy window changes after commitments exist.** Existing commitments were split against the old term. The system MUST NOT silently re-split committed money; HR is told which commitments predate the change.
- **A benefits cycle opens with no preceding cycle.** The first cycle has no carried charges; the feature must be inert rather than erroring.
- **The medical window and the benefits cycle do not overlap at all.** A premium with zero months inside the current cycle charges nothing now and carries in full.
- **A benefits cycle is left open past its end date.** Overlap must be computed from the cycle's configured dates, not from today, so a stale open cycle does not silently absorb more of the premium than its dates cover.
- **Steady state must not drift.** From the second year on, each Jan–Dec pool absorbs 5 months of the expiring policy plus 7 of the new one — exactly 12 months of premium per calendar year. A model that did not settle to 12 would be over- or under-charging every employee, every year.
- **The premium is capped at the pool ceiling.** Capping currently happens against a single ceiling; with a split, it MUST be clear whether the cap applies to the full premium or the per-cycle charge (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let HR set a medical policy window (start and end date) that is stored and evaluated independently of the benefits plan-year window.
- **FR-002**: The system MUST fall back to the benefits plan-year window when no medical policy window is configured, preserving today's behaviour for an unconfigured installation.
- **FR-003**: The system MUST record, for each medical commitment, the full premium the employee is committed to for the whole policy term.
- **FR-004**: The system MUST charge each benefits cycle only the share of a committed premium whose months fall within that cycle's dates.
- **FR-005**: The system MUST carry the unabsorbed remainder of a committed premium and apply it to the next benefits cycle's pool when that cycle opens, without HR re-entering it.
- **FR-005a**: The system MUST cancel — not apply, and not record as owed — a carried charge for an employee who is no longer active, and MUST show HR the period for which premium is recoverable from the insurer.
- **FR-006**: The system MUST ensure the charges applied across all cycles sum to exactly the committed premium, with any rounding remainder resolved in the final cycle.
- **FR-007**: The system MUST count a policy term of any length, including terms longer than twelve months, without capping the count at twelve.
- **FR-008**: The system MUST prorate a mid-term joiner's premium against the remaining months of the policy term.
- **FR-009**: The system MUST count a cycle's medical charge toward that cycle's pool ceiling for the purpose of flexible-benefit claims.
- **FR-010**: The system MUST keep medical exempt from the 50%-per-benefit cap, as today.
- **FR-011**: The system MUST keep medical eligibility at 3 months of service, as today.
- **FR-012**: The system MUST show HR, per employee, the full committed premium, the amount charged to each benefits cycle, and the policy term covered.
- **FR-013**: The system MUST show the employee, for the cycle they are viewing, the medical amount charged to that cycle rather than the full committed premium.
- **FR-014**: The system MUST re-split a commitment across cycles when HR edits its premium, including any charge already applied to an open cycle.
- **FR-015**: The system MUST identify commitments that were split under a previous medical policy window when that window changes, rather than silently re-splitting them.
- **FR-016**: The system MUST keep medical committed once per policy term and locked to the employee after commitment, HR-editable only, as today.

### Key Entities

- **Medical policy window**: The insurance contract's own term — a start and end date, set by HR, independent of the benefits plan year. Determines how a premium is priced and how many months it spans.
- **Medical commitment**: An employee's election for a policy term. Holds the full premium for the whole term, plus the covered-person snapshot that prices it. Locked after commitment; HR-editable.
- **Cycle medical charge**: The portion of a commitment's premium attributed to one benefits cycle, derived from the overlap between that cycle's dates and the policy term. One commitment produces one charge per cycle it touches. This is the amount that draws against that cycle's pool ceiling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee committing to medical during a benefits cycle shorter than the policy term retains flexible pool capacity proportional to the part of the premium not charged to that cycle — where previously they could be left with none.
- **SC-002**: For every committed premium, the sum of the amounts charged across all benefits cycles equals the committed premium exactly, to the currency unit, with no month of cover unaccounted for.
- **SC-003**: HR can state, for any employee and without manual calculation, both the total premium committed and the amount charged to the current cycle.
- **SC-004**: A policy term is counted, priced, and split by its true length in every calculation that touches it, whatever that length is.
- **SC-007**: From the second year onward, each calendar-year pool absorbs exactly twelve months of medical premium — the split settles rather than drifting.
- **SC-005**: An installation with no medical policy window configured produces results identical to today's behaviour, so the change is invisible until HR opts into it.
- **SC-006**: Carried charges are applied to a newly opened benefits cycle with no manual HR step and no opportunity to forget one.

## Assumptions

- **Whole-month attribution.** Overlap between a policy term and a benefits cycle is measured in whole calendar months, consistent with the existing proration rules. A partial month at either boundary is handled by the same whole-month convention already used for mid-year starters, so the two systems agree.
- **The pool-ceiling cap applies to the per-cycle charge, not the full premium.** The existing rule caps a premium at the pool ceiling. Since the ceiling is itself scaled to the cycle, capping the per-cycle charge against the cycle's ceiling is the consistent reading — capping the full premium against one cycle's ceiling would reintroduce the very problem this feature exists to solve. Flagged for confirmation at planning.
- **One medical policy window is active at a time.** Overlapping or nested policy terms are out of scope; the insurer contract renews as a single succession of terms.
- **The benefits plan year is the full calendar year** (confirmed 2026-08-16), so a cycle is always 12 months and the pool ceiling is never scaled for cycle length. Cycle-length proration stays in the code for mid-year joiners but is inert for cycle length itself.
- **Carried charges apply to the next cycle that opens**, whatever its dates, rather than to a specific pre-named future cycle.
- **Medical remains a single commitment per policy term** — this feature changes how a premium is *charged*, not how it is *elected*.
- **Existing commitments are not retrospectively re-split.** Commitments made before this feature ships keep their current single-cycle charge; the split applies to commitments made under a configured medical policy window.
- **No new employee-facing decision.** The employee still makes one choice — who to cover. The split is an accounting concern surfaced to them only as an accurate pool figure.

## Dependencies

- The benefits plan-year cycle (open/close, start and end dates) — the split is computed against these.
- The existing age-banded medical rate card, which prices the premium being split.
- The existing pool ceiling per employment type × tenure band, scaled to cycle length.
- The 3-month medical eligibility rule and the medical exemption from the 50% cap, both retained unchanged.

## Out of Scope

- Changing how the medical premium itself is priced (age bands, covered persons, rate card).
- Re-commitment or renewal reminders when a policy term ends — the employee commits once per term as today.
- Overlapping or nested medical policy terms.
- Retrospective re-splitting of commitments made before this feature.
- Any change to guaranteed benefits or flexible claim rules beyond how a cycle's medical charge is counted against the ceiling.
