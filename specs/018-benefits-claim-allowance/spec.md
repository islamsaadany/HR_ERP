# Feature Specification: Benefits Claim-Based Living Allowance

**Feature Branch**: `claude/benefits-basket-profile-review-u4kfhn`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Benefits basket redesign — claim-based living allowance. Convert the flexible benefits basket from a one-shot select/allocate/submit annual election into a living, claim-based allowance employees manage across the open plan year."

## Overview

Today the flexible benefits basket is a one-shot annual election: an employee selects benefits, enters a per-benefit cost that becomes a fixed allocation, **submits** the whole basket (which locks it), and only then files reimbursement claims against those allocations. Feedback from the team is that this front-loads a decision employees can't yet make — they don't know at the start of the year what they'll spend — and adds ceremony (a submit/lock/reopen cycle) that gets in the way.

This feature reframes the flexible basket as a **living, claim-based allowance**. There is no up-front allocation and no submit step for flexible benefits: employees simply **claim as they actually spend**, any time the plan year is open, as many times as they like, against any benefit in the menu — bounded by two server-enforced limits (a per-benefit 50%-of-pool cap and the overall pool ceiling). **Medical insurance is the single exception**: because it is a real contract HR arranges and pays a provider for, the employee commits to it **once** per plan year, after which it is locked and only HR can change it.

Guaranteed benefits are unchanged. All money rules remain server-authoritative.

## Clarifications

### Session 2026-08-07

- Q: At cutover, how should existing current-plan-year benefits data be treated? → A: **Wipe** all benefits selection data — it is confirmed test data. Employees re-commit medical under the new model. Prior claims need **not** be preserved by the migration; HR re-enters any real ones via the existing manual claim-entry flow (spec 016).
- Q: Should this iteration build an admin control to re-enable the removed count limit? → A: **No** — ship the limit OFF with the rule retained in code (a flag/constant); defer any admin toggle to a later follow-up.
- Q: How should the medical commitment and flexible claims be modeled? → A: Add a **dedicated medical-commitment record** and **remove** the old basket tables (`BenefitSelection` / `SelectionLine`); claims link to the catalog item directly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Claim a flexible benefit as you spend (Priority: P1)

An employee incurs an eligible expense during the open plan year (e.g. a gym membership, a training course, new glasses), and files a claim for it directly — entering the **full price they paid** (matching their proof of payment) and attaching proof where required. The system reimburses the **company-covered share** for that benefit's coverage percentage. The employee can return later and claim the **same** benefit again (e.g. a second course later in the year), as long as that benefit's cumulative company share stays within half the pool and the overall pool isn't exceeded. There is nothing to "submit" and nothing to pre-allocate.

**Why this priority**: This is the heart of the redesign and the primary employee value — using benefits money the way spending actually happens, across the year, without a locked up-front commitment.

**Independent Test**: With the plan year open and a configured catalog, an employee files one or more claims against a flexible benefit, sees the reimbursable (covered) amount computed from the full price and coverage %, and sees the pool draw down. Delivers value on its own even before any other story is built.

**Acceptance Scenarios**:

1. **Given** the plan year is open and the pool ceiling is EGP 50,000, **When** the employee files a claim on an 80%-covered benefit for a full cost of EGP 10,000, **Then** the covered (reimbursable) amount is EGP 8,000, the employee's remaining pool falls by EGP 8,000, and the claim is recorded as pending review.
2. **Given** the employee's cumulative covered claims on one benefit are near the 50%-of-pool cap, **When** they file another claim on that benefit whose covered amount would exceed the remainder, **Then** the claim is **accepted and reimbursed at the remainder** — not rejected — and the employee is told before submitting exactly what will be paid. *(Revised 2026-08-16. The 50% cap overrides the coverage rate: with a 30,000 pool → 15,000 cap, 8,000 already claimed on an 80%-covered benefit, and a fresh 10,000 receipt, the 8,000 coverage share is paid down to the 7,000 remaining — an effective 70%. The employee still enters the FULL receipt value, because it must match their proof; asking them to understate it to fit would defeat the proof. Previously the whole claim was refused and they were reimbursed nothing.)*
2b. **Given** a benefit's 50% cap is **fully used**, **When** the employee files another claim on it, **Then** the claim is rejected — there is no remainder to pay — with a message naming the cap.
3. **Given** the employee's committed medical premium plus all covered flexible claims would exceed the pool ceiling, **When** they file a claim that crosses the ceiling, **Then** the covered amount is likewise **paid down to the pool remainder**; only a fully-used pool rejects, with "your pool is fully used — contact HR".
3b. **Given** a claim's covered amount was clamped by either limit, **When** HR reviews it, **Then** they see the receipt value, the coverage-rate share, and the capped figure side by side, so the payout reconciles against the attached proof. *(`BenefitClaim.fullCost`, migration `045`.)*
4. **Given** a claim requires proof of payment, **When** the employee submits it without a file, **Then** the claim is rejected and the employee is told proof is required.
5. **Given** the plan year is closed, **When** the employee attempts to file a claim, **Then** it is rejected with a message that benefits claiming isn't open.

---

### User Story 2 - Commit medical insurance once (Priority: P1)

An employee sets up their personal medical insurance for the plan year — choosing whether to include a spouse and how many dependants of each age band — and **commits** it. The premium (per the rate card) is computed and drawn from their pool as automatic cover. Once committed, the employee cannot change or remove medical themselves; only HR can, as an exception, because it is a contract with a provider.

**Why this priority**: Medical is the one real up-front commitment in the module and the only thing that behaves like the old "submit." It must be unambiguous and locked, since HR pays a provider against it.

**Independent Test**: An employee configures medical cover, commits it, and confirms it is thereafter read-only to them (no deselect/reduce), while the premium is reflected in their pool usage.

**Acceptance Scenarios**:

1. **Given** the plan year is open and no medical is committed, **When** the employee configures self + spouse + two children and commits, **Then** the premium is computed from the rate card, drawn from the pool as automatic cover, and shown as committed.
2. **Given** medical is committed, **When** the employee attempts to deselect it or reduce dependants, **Then** the action is blocked and they are directed to contact HR.
3. **Given** the computed medical premium exceeds the pool ceiling, **When** the employee tries to commit, **Then** the company contribution is capped at the ceiling and the employee is shown a "premium exceeds your pool — contact HR" message.
4. **Given** medical is exempt from the 50% single-benefit rule, **When** the premium is greater than half the pool but within the ceiling, **Then** it is accepted without a 50% violation.

---

### User Story 3 - Use as many benefits as the budget allows (no count limit) (Priority: P2)

An employee is no longer limited to a fixed number of benefits (previously 5 full-time / 3 part-time). They may claim against any number of benefit types across the year; the only guards are the per-benefit 50%-of-pool cap and the overall pool ceiling.

**Why this priority**: Removes friction the team flagged as redundant — the budget and the 50% rule already bound spend and force variety. Valuable but secondary to the core claim/commit flows.

**Independent Test**: An employee files claims against more benefit types than the old limit allowed and none are rejected on count grounds alone.

**Acceptance Scenarios**:

1. **Given** the count limit is not enabled, **When** the employee claims against six different benefits within budget, **Then** all are accepted (subject only to the 50% and ceiling rules).
2. **Given** an administrator later re-enables a count limit of N, **When** the employee tries to use benefit N+1, **Then** the server enforces the limit and rejects the excess. *(Applies only if the admin toggle is enabled; see Assumptions.)*

---

### User Story 4 - HR manages committed medical and automatic benefits (Priority: P2)

Because medical and any "automatic" (no-claim) benefit are HR-arranged, only HR can change or remove them for an employee once committed. HR has an override path to adjust or release an employee's committed medical / automatic benefits as an exception.

**Why this priority**: Guarantees the lock in Story 2 has a legitimate escape valve so real-world changes (a new dependant, a correction) can be handled without breaking the "employees can't self-edit medical" rule.

**Independent Test**: As HR, adjust or release an employee's committed medical and confirm the employee's view reflects the change while the employee themselves still cannot edit it.

**Acceptance Scenarios**:

1. **Given** an employee has committed medical, **When** HR adjusts or releases it via the admin path, **Then** the change takes effect and the employee's pool usage updates accordingly.
2. **Given** an employee has an automatic (no-claim) benefit, **When** the employee attempts to remove it, **Then** it is blocked; **When** HR removes it, **Then** it succeeds.

---

### User Story 5 - Orientation tour reflects the new model (Priority: P3)

A first-time employee opening Benefits sees an orientation that explains the new model: claim as you go all year, there's nothing to submit for flexible benefits, you enter the full price you paid and the company covers a set percentage, you can claim the same benefit more than once up to half your pool, and medical is the one thing you commit to (HR-managed after).

**Why this priority**: Comprehension aid. Important for adoption but the module functions without it.

**Independent Test**: Open the orientation as a new employee and confirm the steps describe claiming-as-you-go, full-cost entry, the 50% rule, and the medical commitment, with a final "Got it" action.

**Acceptance Scenarios**:

1. **Given** a new employee who hasn't seen the tour, **When** they open Benefits, **Then** the tour explains the claim-based model and medical commitment as above and closes on "Got it".
2. **Given** the tour was updated, **When** any step still references "pick up to N benefits" or "submit your basket", **Then** that is treated as a defect (no such language may remain).

---

### User Story 6 - Admin cannot configure a 0%-coverage benefit (Priority: P3)

When an administrator creates or edits a flexible catalog benefit, the system prevents saving a coverage percentage of 0, since a 0%-covered benefit draws nothing from the pool and can't be reimbursed.

**Why this priority**: A small correctness guard on configuration; low frequency, low risk, but prevents a confusing dead state.

**Independent Test**: As admin, attempt to save a catalog benefit at 0% coverage and confirm it is rejected with a clear message.

**Acceptance Scenarios**:

1. **Given** the admin catalog form, **When** a coverage of 0% is submitted, **Then** it is rejected and the admin is told coverage must be between 1% and 100%.

---

### Edge Cases

- **Claim exactly at a boundary**: a claim whose covered amount lands the benefit's cumulative covered total exactly on 50% of the pool, or the overall total exactly on the ceiling, is accepted; anything above is rejected.
- **Rounding**: the full price is the exact receipt value (no forced 1,000 steps); the covered share is the price × coverage %, rounded to whole currency. The employee always sees the same covered figure the server records.
- **Partial claim then top-up**: an employee claims part of an expense, then claims more of the same benefit later; the running per-benefit cap and pool ceiling are evaluated against the cumulative covered total including pending claims.
- **Rejected claim**: a claim HR rejects frees the pool room it had reserved so the employee can re-use that budget elsewhere.
- **Medical before/without flexible claims**: an employee may claim flexible benefits whether or not they've committed medical; medical is independent.
- **Plan-year close mid-use**: once the window closes, no new claims or medical commitments are accepted; existing committed medical and filed claims are unaffected.
- **No pool configured**: an employee whose employment type/tenure has no pool ceiling, or whose benefits aren't configured, sees a clear "not available / contact HR" state rather than a broken form.
- **Coverage change after claims exist**: if an admin changes a benefit's coverage % after an employee has already claimed it, existing claims keep the covered amount recorded at claim time (they are not retroactively recomputed).

## Requirements *(mandatory)*

### Functional Requirements

**Flexible benefits — claim-based allowance**

- **FR-001**: The system MUST allow an employee to file a reimbursement claim against any active flexible benefit while the plan year is open, without any prior selection, allocation, or submission of a basket.
- **FR-002**: The system MUST accept the **full price paid** for a claim as an exact amount matching the employee's proof of payment, with no rounding to fixed steps.
- **FR-003**: The system MUST compute the reimbursable (company-covered) amount as the full price × the benefit's coverage percentage, and MUST present the employee the same covered figure that is recorded.
- **FR-004**: The system MUST allow multiple claims against the same benefit across the plan year.
- **FR-005**: The system MUST enforce, server-side, that the **cumulative company-covered total for any single flexible benefit** (including pending and reimbursed claims) does not exceed **50% of the employee's pool ceiling**. This rule applies to **both full-time and part-time** employees.
- **FR-006**: The system MUST enforce, server-side, that the **total company share across everything** — the committed medical premium plus all flexible covered claims (pending + reimbursed) — does not exceed the employee's **pool ceiling**. A claim that would cross the ceiling MUST be rejected with a "contact HR" message.
- **FR-007**: When a claim is rejected for exceeding the 50% per-benefit cap, the system MUST tell the employee how much remains claimable on that benefit.
- **FR-008**: When HR rejects a filed claim, the system MUST release the pool room that claim reserved, making it available for other claims.
- **FR-009**: Claims that require proof MUST be rejected without an attached proof file; claims that require only a note MUST accept an optional note. (Existing claim-type behavior is preserved.)

**Medical insurance — the single commitment**

- **FR-010**: The system MUST let an employee configure medical cover (self always included; optional spouse; counts of dependants by age band) and **commit** it once per plan year while the window is open.
- **FR-011**: After medical is committed, the system MUST prevent the employee from deselecting it or reducing its cover; only HR may change or remove it.
- **FR-012**: The system MUST compute the medical premium from the rate card, treat it as automatic cover drawn from the pool, and MUST NOT require or accept a reimbursement claim against medical.
- **FR-013**: The system MUST exempt medical from the 50% single-benefit rule, but MUST cap the company contribution to medical at the pool ceiling; when the premium exceeds the ceiling, the employee MUST be shown a "premium exceeds your pool — contact HR" message.

**Automatic benefits & HR override**

- **FR-014**: The system MUST prevent an employee from removing or reducing any **automatic** benefit (medical, or any catalog/guaranteed benefit whose claim type is "automatic / none") once it applies to them.
- **FR-015**: HR MUST have a server-side path to adjust or release an employee's committed medical and automatic benefits as an exception, with the employee's pool usage updating accordingly.

**Count limit**

- **FR-016**: The system MUST NOT impose a maximum number of flexible benefits an employee may use. The previous count limit (5 full-time / 3 part-time) is disabled by default.
- **FR-017**: The count-limit rule MUST be retained in the codebase so it can be re-enabled later. When enabled (see Assumptions on the admin toggle), it MUST be enforced server-side for full-time and part-time employees.

**Admin configuration**

- **FR-018**: The system MUST prevent an administrator from saving a flexible catalog benefit with a coverage percentage of 0; coverage MUST be between 1% and 100%.

**Orientation**

- **FR-019**: The Benefits orientation tour MUST describe the claim-as-you-go model (nothing to submit for flexible benefits), full-price entry with a set company-covered percentage, the ability to claim a benefit multiple times up to 50% of the pool, and that medical is the one commitment (HR-managed after commitment). It MUST NOT contain any "pick up to N benefits" or "submit your basket" language, and its final action MUST read "Got it".

**Cross-cutting**

- **FR-020**: All money rules in this feature (50% cap, pool ceiling, medical handling, count limit when enabled, plan-year window) MUST be enforced on the server; any client-side calculation is for display only and is never trusted.
- **FR-021**: Guaranteed benefits MUST remain unchanged — automatic and separate from the flexible allowance and its rules.

**Rollout & data model**

- **FR-022**: At rollout, the system MUST clear all existing benefits selection/allocation data (confirmed test data). Employees re-commit medical under the new model. The migration is NOT required to preserve prior claims; HR re-enters any real prior claims via the existing manual claim-entry flow (spec 016).
- **FR-023**: The employee's medical commitment MUST be stored as a dedicated medical-commitment record (one per employee per plan year). The legacy basket/selection model (`BenefitSelection` / `SelectionLine`) MUST be removed, and flexible-benefit claims MUST link directly to the catalog item (not to a selection line).

### Key Entities *(include if feature involves data)*

- **Pool ceiling**: the maximum company contribution for an employee for the plan year, determined by employment type × tenure band. The basis for both the 50%-per-benefit cap and the overall total cap.
- **Flexible benefit (catalog item)**: a benefit an employee can claim against, with a coverage percentage (1–100%) and a claim type (proof required / note / automatic). Coverage % determines the company-covered share of a claim.
- **Claim**: a request for reimbursement against a specific benefit for a specific plan year, carrying the full price paid, the covered amount recorded at claim time, optional proof/note, and a status (pending / reimbursed / rejected). It links **directly to the catalog item** (no selection line), and multiple claims may exist per benefit.
- **Medical commitment**: a **dedicated record** (one per employee per plan year) holding the employee's committed medical configuration (self + dependants) and its computed premium, treated as automatic cover drawn from the pool; editable only by HR after commitment. This replaces the old basket/selection model — `BenefitSelection` / `SelectionLine` are removed, and flexible benefits no longer have any per-benefit selection or allocation record.
- **Plan year**: the open/closed window that gates whether claims and medical commitments may be made.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can file a valid flexible-benefit claim end-to-end (open Benefits → choose benefit → enter full price → attach proof → submit) in under 2 minutes, with no prior allocation or basket-submit step.
- **SC-002**: 100% of claims that would breach the 50%-per-benefit cap or the pool ceiling are rejected server-side with an actionable message; none are stored.
- **SC-003**: The covered amount an employee sees before submitting a claim matches the recorded covered amount in 100% of cases (no post-submit rounding surprises).
- **SC-004**: Once medical is committed, 100% of employee attempts to change or remove it are blocked, and HR can still make the change.
- **SC-005**: No employee claim is ever rejected solely because of a benefit-count limit while the limit is disabled.
- **SC-006**: The orientation tour contains zero occurrences of "pick up to N benefits" or "submit your basket", and its final action reads "Got it".
- **SC-007**: An administrator cannot save a flexible benefit at 0% coverage.

## Assumptions

- **Cutover / legacy data** (resolved): all existing benefits data is **test data**, so at rollout all selection/allocation data is **wiped** and the module starts fresh. Employees **re-commit medical**; the migration does **not** preserve prior claims — HR re-enters any real ones via the existing manual claim-entry flow (spec 016). (The old basket tables are removed — see Key Entities / FR-023.)
- **Admin count-limit toggle** (resolved): the count limit ships **OFF** with the rule retained in code as a flag/constant. **No admin UI** for it in this iteration; re-enabling is a later follow-up.
- **50% basis**: the 50%-per-benefit cap and the overall cap are both computed against the **full pool ceiling** (not the pool net of medical), consistent with today's rule.
- **Claim caps count pending claims**: pending (not-yet-reviewed) claims count toward both the per-benefit 50% cap and the pool ceiling, so an employee cannot over-reserve by stacking pending claims; rejected claims release their reservation.
- **Coverage recorded at claim time**: the covered amount is fixed when a claim is filed; later admin changes to a benefit's coverage % do not retroactively alter existing claims.
- **Medical independence**: flexible claims do not require medical to be committed first; the two are independent.
- **Reimbursement mechanics unchanged**: proof upload, HR review (approve/reimburse/reject), and the existing claim-type semantics (proof / note / automatic) are reused; this feature changes *when and against what* claims can be filed, not the review workflow itself.
- **Navy/gold design language and the benefits selector's preserved layout/interaction model are honored**; any UI change is snapshotted and requires explicit approval per the constitution.
- **Server-authoritative**: consistent with the constitution, all rule enforcement is server-side; the client mirrors for UX only.
