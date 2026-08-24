# Feature Specification: Mid-Year Starter Proration

**Feature Branch**: `019-mid-year-proration`

**Created**: 2026-08-09

**Status**: Implemented 2026-08-09; **revised 2026-08-11** (see banner). Server + UI built and typechecked; pending Neon migration `027` and admin-set plan-year dates. Medical premium figures remain placeholders pending operator rates.

> **⚠ Revision — 2026-08-11 (cycle-length proration).** The **flexible pool** and **guaranteed Professional development** no longer prorate only for mid-year *starters*; they now scale to the **length of the plan-year cycle** (`cycle whole months ÷ 12`), applied to **every** eligible employee. A shorter cycle (e.g. a half-year plan year) reduces the pool/Prof-dev allowance for existing staff too — this is the behaviour change that motivated the revision. A mid-cycle joiner receives the **same** cycle-length fraction as a day-one employee (no extra reduction); the 6-month threshold still gates *eligibility* (under 6 months → no pool/Prof-dev). **Medical is unchanged** by this revision: it keeps mid-cycle-**joiner** proration (`annual × remaining whole months ÷ 12` from the 3-month eligibility date), and existing staff pay the full premium regardless of cycle length. FR-005 and FR-006 below are superseded by this banner; FR-007/008/013 (medical + eligibility gating) still stand. A separate follow-up will replace the placeholder medical rate card with the operator's **age-banded, per-person (by DOB)** Tier-1 figures.

> **⚠ Clarification — 2026-08-23 (the ceiling always follows the cycle).** The revision above says a mid-cycle joiner gets the same cycle-length fraction as a day-one employee. That was true only for **banded** employees: the **sub-6-month** branch of the pool ceiling (the entry-tier figure that bounds their medical, FR-013 below) prorated by the **mid-joiner** fraction, which equals **1** whenever their 3-month mark falls on or before the cycle's first day — so on a six-month cycle a newcomer's ceiling was the **full** annual amount while every colleague's was halved. **The pool ceiling now scales to the cycle's length in both branches.** The 3-month and 6-month thresholds decide **whether** a person has a ceiling, never **how big** it is. Medical's own mid-joiner ÷12 proration is unchanged — it applies to the **premium**, not to the ceiling that caps it.

**Input**: User description: "Mid-year starter proration for benefits. When an employee first becomes benefits-eligible partway through a plan year, their benefit for that year is prorated for the remaining months; from the next plan year onward they receive the full annual benefit."

## Overview

An employee who first becomes benefits-eligible partway through a plan year should not receive a full year's allowance for a partial year of service. This feature prorates the **annual flexible pool**, the **guaranteed Professional-development** budget, and **medical insurance** down to the months the employee is actually eligible within that plan year. Once a full plan year has passed (they are eligible from its first day), they receive the full annual figures.

Proration is measured against the plan year's calendar window, so a plan year must carry an explicit **start date** and **end date** — which it does not today (a plan year has only a name and an open/closed status).

Two eligibility thresholds apply: the flexible pool and Professional development unlock at **6 months** of service; **medical unlocks earlier, at 3 months**. Both are prorated from their own eligibility date using the same formula. Medical's actual **premium figures** depend on rates the insurance operator has yet to confirm; until then the module uses the existing **placeholder** rate card, and the confirmed figures are swapped in later — the proration **rule and design do not wait** on them (see Dependencies).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin defines the plan-year window (Priority: P1)

An HR/Admin managing benefits sets a **start date** and **end date** on a plan year (in addition to its name and open/closed status). This window is the basis for every proration calculation.

**Why this priority**: Nothing else in this feature can be computed without a plan-year window. It is the foundation and is independently useful (it also documents the cycle for everyone).

**Independent Test**: Open the admin Benefits area, create/edit a plan year, set start and end dates, save, and confirm they persist and display. Delivers value on its own by making the active cycle's dates explicit.

**Acceptance Scenarios**:

1. **Given** an HR/Admin on the plan-year management surface, **When** they create or edit a plan year and enter a start and end date, **Then** the dates are saved and shown with the plan year.
2. **Given** an HR/Admin entering an end date earlier than the start date, **When** they save, **Then** the change is rejected with a clear message and no invalid window is stored.

---

### User Story 2 - A mid-year starter sees a prorated flexible pool (Priority: P1)

An employee who reaches 6 months of service **during** the current plan year sees their flexible pool ceiling reduced to the remaining whole months of that plan year, and every flexible claim is checked against that prorated ceiling.

**Why this priority**: This is the core money outcome and the largest allowance affected. It is the reason the feature exists.

**Independent Test**: With a plan-year window set, take an employee whose 6-month eligibility date lands inside the window; confirm their displayed pool ceiling equals `annual × remaining-whole-months ÷ 12`, and that a claim exceeding the prorated ceiling is blocked server-side.

**Acceptance Scenarios**:

1. **Given** a plan year running 1 Jan – 31 Dec and an employee whose 6-month eligibility date is 1 Oct, **When** they view Benefits, **Then** their flexible pool ceiling is 3/12 of the annual ceiling for their band.
2. **Given** that same employee, **When** they file flexible claims whose covered total would exceed the prorated ceiling, **Then** the server rejects the over-ceiling claim with a "contact HR / over your allowance" style message.
3. **Given** an employee whose 6-month eligibility date falls **on or before** the plan-year start, **When** they view Benefits, **Then** they receive the **full** annual pool (no proration).
4. **Given** an employee whose 6-month eligibility date falls **after** the plan-year end, **When** they view Benefits, **Then** they have **no** flexible allowance for that plan year.

---

### User Story 3 - Professional development is prorated the same way (Priority: P2)

For a mid-year starter, the guaranteed **Professional-development** annual budget is prorated to the remaining whole months of the plan year, using the same rule as the flexible pool.

**Why this priority**: It is the one guaranteed benefit that behaves like an annual budget rather than an event/season gift, so it must follow the same proration; second only to the flexible pool in impact.

**Independent Test**: For a mid-year starter, confirm the Professional-development claimable amount equals `annual band amount × remaining-whole-months ÷ 12`, and a proof claim above the prorated amount is blocked.

**Acceptance Scenarios**:

1. **Given** a mid-year starter with a prorated window of 4 months in a 12-month plan year, **When** they view Professional development, **Then** the claimable amount is 4/12 of their band's annual Professional-development figure.
2. **Given** the same employee, **When** they submit a Professional-development claim above the prorated amount, **Then** it is rejected server-side.

---

### User Story 4 - Medical unlocks at 3 months and is prorated (Priority: P2)

An employee reaches **3 months** of service — earlier than the 6-month basket threshold — and can commit medical insurance. If their 3-month date lands inside the current plan year, the medical premium/cover for that year is prorated by the same remaining-whole-months rule. An employee still short of 6 months sees a **medical-only** Benefits view: medical is available; the flexible basket and guaranteed benefits are shown as unlocking at 6 months.

**Why this priority**: Medical is the module's one committed, money-bearing election; letting it start at 3 months (prorated) is a distinct, high-value outcome, but it rides on the same window/formula as the pool.

**Independent Test**: Take an employee between 3 and 6 months of service with a plan-year window set; confirm they can commit medical, the committed premium equals the annual premium `× remaining-whole-months ÷ 12`, and the flexible basket is presented as locked until 6 months.

**Acceptance Scenarios**:

1. **Given** an employee whose 3-month date is 1 Oct in a 1 Jan – 31 Dec plan year, **When** they commit medical, **Then** the committed premium is 3/12 of the annual premium (using the current placeholder rate card until the operator's figures are confirmed).
2. **Given** an employee at 4 months of service (past 3, before 6), **When** they open Benefits, **Then** medical is available to commit and the flexible basket + guaranteed benefits are shown as unlocking at 6 months.
3. **Given** an employee whose 3-month date is on/before the plan-year start, **When** they commit medical, **Then** the full annual premium applies (no proration).
4. **Given** an employee whose 3-month date is after the plan-year end, **When** they open Benefits, **Then** medical is not yet available for that plan year.

---

### User Story 5 - Event/season gifts are unaffected (Priority: P2)

Marriage allowance, Summer allowance, Special events, and Loans are **not** prorated — they remain granted in full when their triggering event or season occurs, regardless of the employee's mid-year start.

**Why this priority**: Prevents the feature from wrongly shrinking life-event and seasonal gifts; protects existing correct behavior.

**Independent Test**: For a mid-year starter, confirm Marriage/Summer/Special events/Loans display and release at their full band amounts, with no proration applied.

**Acceptance Scenarios**:

1. **Given** a mid-year starter, **When** they view their guaranteed benefits, **Then** Marriage allowance, Summer allowance, Special events, and Loans show their full (un-prorated) band amounts.
2. **Given** HR releases a Summer allowance to a mid-year starter, **When** the release is recorded, **Then** the full seasonal amount is granted.

---

### User Story 6 - Full amounts from the next plan year (Priority: P3)

An employee who was a mid-year starter in one plan year, and is eligible from day one of the next plan year, receives the **full** annual figures in that next plan year with no proration.

**Why this priority**: Confirms proration is a one-year, self-clearing effect; important for trust but naturally follows from the rule.

**Independent Test**: Advance the same employee to the following plan year (eligibility date before that year's start) and confirm full annual pool, Professional-development budget, and medical premium.

**Acceptance Scenarios**:

1. **Given** an employee prorated in plan year N, **When** plan year N+1 opens and their eligibility date precedes its start, **Then** they receive the full annual pool, Professional-development budget, and medical premium.

---

### Edge Cases

- **No window set**: If the active plan year has no start/end dates, proration cannot be computed. The system MUST treat the plan year as un-prorated (full amounts) and surface a clear admin warning that dates are missing, rather than silently zeroing allowances.
- **Missing employee start date**: If an employee has no start date, their eligibility date is unknown. The system MUST fall back to existing behavior (treat as eligible per their assigned tenure band, un-prorated) and not block them; flag for HR to set a start date.
- **Medical for a 3-to-6-month employee with no tenure band**: A sub-6-month employee has no assigned tenure band, yet medical premium/ceiling are looked up by band. The system MUST use the **entry tier (6 mo–2 yr)** ceiling and rate card for their (prorated) medical (see Assumptions).
- **Eligibility exactly on the start or end date**: Eligibility on/before the start date → full year; eligibility after the end date → nothing; eligibility on the end date → the boundary month rule (see Assumptions) determines the count.
- **Partial first month**: A mid-month eligibility date does not grant a partial month — only **whole** remaining months count (see Assumptions for the exact boundary rule).
- **Medical is committed once and locked**: The prorated premium is computed **at commit time** from the plan-year window and the employee's eligibility; after commit it is locked and HR-editable only, unchanged from today. Proration does not add a second commitment.
- **Plan year not exactly 12 months**: Proration divides by 12 per the agreed formula; a plan year materially shorter/longer than 12 months is an admin data question flagged in Assumptions, not silently rescaled.
- **Already-claimed amount above a new prorated ceiling**: If a prorated ceiling is applied after claims already exist (e.g., dates entered late), the system MUST not corrupt existing released claims; it stops further claims once the prorated ceiling is reached and surfaces the over-allocation to HR.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A plan year MUST carry an admin-set **start date** and **end date** in addition to its name and open/closed status.
- **FR-002**: The system MUST reject a plan-year window whose end date is not after its start date.
- **FR-003**: The system MUST compute an employee's **flexible-pool / Professional-development eligibility date** as their employment start date plus **6 months**, and their **medical eligibility date** as their employment start date plus **3 months**.
- **FR-004**: For the active plan year and a given eligibility date, the system MUST classify the employee as **full** (eligibility date on/before plan-year start), **prorated** (eligibility date within the plan-year window), or **not yet eligible** (eligibility date after plan-year end).
- **FR-005**: For a **prorated** employee, the system MUST reduce the **flexible pool ceiling** to `annual ceiling × remaining whole months ÷ 12`, where remaining whole months is measured from the (6-month) eligibility date to the plan-year end (see Assumptions for the boundary rule).
- **FR-006**: For a **prorated** employee, the system MUST reduce the claimable **Professional-development** budget by the same rule (`annual band amount × remaining whole months ÷ 12`).
- **FR-007**: The system MUST allow **medical** to be committed once the employee's **3-month** eligibility date has passed, independent of whether they have reached the 6-month tenure band.
- **FR-008**: For a **prorated** medical employee, the system MUST prorate the **medical premium** (and its pool draw) by `annual premium × remaining whole months ÷ 12`, measured from the (3-month) medical eligibility date; medical remains exempt from the 50%-per-benefit cap.
- **FR-009**: An employee who is medical-eligible (≥3 months) but not yet basket-eligible (<6 months) MUST see a **medical-only** Benefits view — medical available, flexible basket and guaranteed benefits presented as unlocking at 6 months.
- **FR-010**: The system MUST enforce every proration **server-side** at claim/commit time (the existing money-rule pattern); the client mirrors the prorated figures for display only and is never trusted.
- **FR-011**: The 50%-per-benefit cap and pool-total checks MUST operate against the **prorated** pool for a prorated employee (i.e., the cap is a share of the reduced pool).
- **FR-012**: The system MUST NOT prorate **Marriage allowance, Summer allowance, Special events, or Loans** — these remain full when their event/season triggers.
- **FR-013**: The system MUST treat a **not-yet-eligible** employee as having no allowance for the affected benefit for that plan year (no flexible pool / no Professional-development budget below 6 months; no medical below 3 months).
- **FR-014**: From a plan year in which the employee is eligible from day one, the system MUST present the **full** annual figures (proration self-clears).
- **FR-015**: The employee-facing Benefits view MUST clearly indicate when amounts are **prorated** for the current plan year and why (mid-year start), so the reduced figures are not mistaken for errors.
- **FR-016**: If the active plan year lacks a start/end window, the system MUST fall back to un-prorated (full) amounts and warn HR/Admin that dates are missing.
- **FR-017**: Medical premium proration MUST use the module's current **placeholder** rate card until Forefront confirms the operator's figures; confirmed figures replace the placeholders without a change to the proration rule (a data/config update).

### Key Entities *(include if feature involves data)*

- **Plan year**: The benefits cycle. Gains a **start date** and **end date** (the proration window) alongside its existing name and open/closed status. Exactly one is open at a time.
- **Employee eligibility classification (derived, not stored)**: Per employee per plan year and per benefit group — **full**, **prorated**, or **not yet eligible** — computed from the employee's start date, the relevant service threshold (6 months for pool/Prof-dev, 3 months for medical), and the plan-year window. No stored flag; recomputed each plan year.
- **Prorated allowance (derived)**: The reduced flexible pool ceiling, Professional-development budget, and medical premium for a prorated employee, `annual × remaining whole months ÷ 12`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of mid-year starters (6-month eligibility date inside the plan-year window) see a flexible pool and Professional-development budget equal to their annual figure scaled by remaining whole months ÷ 12.
- **SC-002**: 0% of over-prorated-ceiling flexible, Professional-development, or medical amounts are accepted by the server.
- **SC-003**: 100% of employees between 3 and 6 months of service can commit medical (prorated) and see a medical-only view with the basket locked until 6 months.
- **SC-004**: 100% of event/season gifts (Marriage, Summer, Special events, Loans) remain at full band amounts for mid-year starters.
- **SC-005**: An employee eligible from day one of a plan year always sees 12/12 (full) amounts — proration never lingers past the first eligible year.
- **SC-006**: An HR/Admin can set a plan-year start and end date and see them reflected in employees' prorated figures without any code change or manual per-employee calculation.

## Assumptions

- **Boundary/whole-month rule**: "Remaining whole months" is the count of complete months from the eligibility date to the plan-year end date (a partial first month does not count). Example: eligibility 1 Oct, end 31 Dec → 3 months. This yields the `× months ÷ 12` figure; the resulting currency amount is rounded to the nearest whole EGP.
- **Divide by 12**: Proration divides by 12 (a standard year) per the agreed formula, assuming plan years are approximately 12 months. A plan year deliberately much shorter/longer than 12 months is treated as an admin data decision and is not silently rescaled; if this becomes common, revisit as a follow-up.
- **Eligibility basis**: Thresholds are measured from the employee's recorded employment start date — 6 months for pool/Prof-dev, 3 months for medical.
- **Sub-6-month medical uses the entry tier**: A 3-to-6-month employee has no assigned tenure band; their (prorated) medical premium and pool ceiling are looked up using the **entry 6 mo–2 yr tier** for their employment type.
- **Medical rates are placeholders for now**: The `÷12` proration is the agreed rule and is built now; the actual per-dependant premium figures come from the insurance operator later and replace the placeholders as a config/data update — the design does not block on them, and placeholder figures are never presented as final (existing house rule).
- **Classification is stateless/derived**: Full / prorated / not-yet-eligible is recomputed from dates each plan year; no migration of per-employee flags is required beyond adding the plan-year window.
- **Existing money-rule engine is reused**: Proration is layered into the existing server-authoritative benefits rules (the same place the pool ceiling, 50% cap, and medical premium are enforced), not a parallel system.

## Dependencies

- **Plan-year window (in scope, prerequisite)**: Adding start/end dates to a plan year is part of this feature and blocks the rest of it.
- **Operator medical rates (data input, non-blocking)**: Forefront will confirm the insurance operator's prorated premium figures. This feature is built now against the existing placeholder rate card and the `÷12` rule; the confirmed figures are a later data/config swap, not a design dependency. If the operator's real prorated premiums turn out **not** to be linear (`÷12`), that becomes a follow-up change to the medical rate handling.
- **Approved medical mockup**: The previously approved "medical available at 3 months / medical-only view" mockup is realized by this feature (User Story 4), not deferred.
