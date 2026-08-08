# Feature Specification: Benefits — Company Coverage Rates (Co-Funding)

> **Note:** the coverage-% co-funding model here is retained by [spec 018](../018-benefits-claim-allowance/spec.md), but it now applies at **claim time** (employee enters the full receipt price → covered = price × rate%) rather than at basket allocation. The 1,000-step rounding is removed (cost is the exact receipt value), and the 50% cap applies to cumulative covered claims for full- and part-time.

**Feature Branch**: `012-benefits-coverage`

**Created**: 2026-08-05

**Status**: Implemented (2026-08-07, migration `023`)

**Input**: User description: "Add a company **coverage rate** per flexible benefit so the company co-funds by category. Each benefit has a real cost; the company covers a percentage of it, only the covered (company) share draws from the employee's pool, and the employee pays the remainder. Coverage rates per the approved concept doc (100% / 80% / 50%). The pool total and the 50% cap operate on the covered amount. Medical stays 100%-covered and rate-card-priced (unchanged, single item). Raise full-time selections to 5; part-time stays 2 and stays exempt from the 50% cap. Claims reimburse the covered portion against proof of the full spend."

> **Relationship to other specs**: This **layers onto spec `007` (Flexible Benefits Selection)** — it changes how an
> allocation draws on the pool, but keeps 007's plan-year window, submit/lock, self-reopen (FR-038), claimed-locks
> (FR-036), and over-selection prevention (FR-035). Where this spec and 007 conflict, **this spec wins** and 007's
> affected FRs should be updated when this is implemented. The **guaranteed core, pool ceilings, and medical rate
> card are unchanged** — they already match the approved concept doc.

## Clarifications

### Decisions already made (do not re-open)

- **Coverage adopted.** The company co-funds each flexible benefit at a per-benefit rate; only the covered share draws from the pool.
- **Coverage rates** (seeded defaults, HR-editable): **100%** — Personal medical insurance, Annual health check-up, Coaching/therapy · **80%** — Gym membership, Sports expenses, Schooling/education, Childcare/nursery, Caregiver support, Personal learning · **50%** — Mobile device, Home-office setup.
- **Selection limit:** full-time **5** (raised from 4); part-time **3** (raised from 2).
- **Part-time cap rule is unchanged** — **exempt from the 50% cap** (a deliberate deviation from the concept doc's "same rules" wording); only its selection limit rises to 3.
- **Medical is unchanged** — a **single** medical item priced from the rate card, dependents via the modal; it is **100% covered** so its premium equals the covered amount equals the pool draw. **Not** split into Personal/Family (deliberate deviation from the concept doc).
- **Guaranteed core, pool ceilings, and the medical rate card are out of scope** — already aligned to the concept doc.

### Session 2026-08-05 (clarify)

- **Q (DC-1): What does the employee enter for a co-funded benefit?** → **A: the full cost.** The employee enters the benefit's real cost; the system derives the company share (pool draw) and the employee out-of-pocket from the coverage rate (concept-doc gym example: 10,000 at 80% → 8,000 from pool, 2,000 employee).
- **Q (DC-2): How do the 1,000-step increments work under coverage?** → **A: the step applies to the cost.** The company share is exact and may be non-1,000 (e.g. 80% of 9,000 = 7,200). Covered amounts are not re-rounded.
- **Q (DC-3): How much is shown per benefit?** → **A: cost · company share · your share.** Each selected benefit shows all three (cost, company share drawn from pool, employee out-of-pocket) plus totals; the pool meter tracks the **company share** only. The claims table's figures stay in covered (company) terms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what the company covers and what I pay (Priority: P1)

An employee building their basket can see, for each benefit, the **company coverage rate** and — for a cost they enter — how much the **company contributes from the pool** versus how much **they pay out of pocket**. Only the company's share consumes their pool.

**Why this priority**: This is the whole point of the feature — the employee must understand the co-funding before they can make sensible choices; it is the foundation everything else builds on.

**Independent Test**: Enter a 10,000 gym cost (80% covered) and confirm the benefit shows 8,000 as the company/pool share and 2,000 as the employee's out-of-pocket, and that the pool meter drops by 8,000 (not 10,000).

**Acceptance Scenarios**:

1. **Given** a benefit with an 80% coverage rate, **When** the employee enters a cost of 10,000, **Then** the company/pool share shows 8,000 and the employee out-of-pocket shows 2,000.
2. **Given** a benefit with a 100% coverage rate, **When** the employee enters a cost of 3,000, **Then** the company/pool share shows 3,000 and the out-of-pocket shows 0.
3. **Given** a benefit with a 50% coverage rate, **When** the employee enters a cost of 12,000, **Then** the company/pool share shows 6,000 and the out-of-pocket shows 6,000.
4. **Given** any selected benefits, **When** the employee views the running meter, **Then** the pool total reflects the **sum of company shares** (plus the medical premium), not the sum of full costs.

### User Story 2 - Build a basket where the pool measures the company's contribution (Priority: P1)

The pool ceiling, the running total, and the 50% single-benefit cap all operate on the **covered (company) amount**. The employee can fill their pool with covered shares up to the ceiling; the 50% cap (full-time) limits any single benefit's covered share to half the pool.

**Why this priority**: Getting the money math right is non-negotiable — the pool is the company's committed spend, so every rule must run on the covered amount.

**Independent Test**: As a full-time employee with a 30,000 pool, confirm a single non-medical benefit whose **covered share** exceeds 15,000 is flagged over the 50% cap, and that the basket is over-pool when the **sum of covered shares** exceeds 30,000.

**Acceptance Scenarios**:

1. **Given** a full-time employee with pool 30,000, **When** a single non-medical benefit's **covered share** exceeds 15,000 (50%), **Then** the breach is flagged and submission is blocked while it persists.
2. **Given** any employee, **When** the **sum of covered shares** (plus medical) exceeds the pool ceiling, **Then** "over pool" is flagged and submission is blocked.
3. **Given** a part-time employee, **When** they build a basket, **Then** the 50% cap does **not** apply and the selection limit is **3** (raised from 2).
4. **Given** a full-time employee, **When** they select benefits, **Then** they may choose up to **5** (raised from 4).

### User Story 3 - HR sets the coverage rate per benefit (Priority: P2)

HR / Super User sets and edits the **coverage rate** for each catalog item (e.g. gym 80%, mobile 50%), server-authoritative. New rates apply to unsubmitted baskets going forward.

**Why this priority**: Coverage is company policy that must be configurable, not hard-coded — but it can follow the employee-facing math since defaults are seeded.

**Independent Test**: In admin, change gym from 80% to 100%, then confirm an employee entering a 10,000 gym cost now draws 10,000 from the pool and shows 0 out-of-pocket.

**Acceptance Scenarios**:

1. **Given** HR on the Benefits configuration screen, **When** they set a benefit's coverage rate, **Then** the rate is saved and used for all subsequent basket math.
2. **Given** a coverage rate outside 0–100%, **When** HR tries to save it, **Then** the value is rejected or clamped to the valid range.
3. **Given** a changed rate, **When** an employee opens/edits an unsubmitted basket, **Then** the new rate is reflected in their pool draw and out-of-pocket.

### User Story 4 - Claim reimbursement for the covered portion (Priority: P2)

After submitting, the employee claims reimbursement against **proof of the full spend**; the amount reimbursed is the **covered portion** of that spend (up to the covered allocation for the benefit). The employee's out-of-pocket share is theirs to bear.

**Why this priority**: Claims are the point where money actually moves; reimbursement must equal the company's covered share, not the full receipt.

**Independent Test**: For a gym benefit at 80% with a covered allocation of 8,000, submit a proof claim for a 10,000 receipt and confirm the reimbursable amount is 8,000 (the covered portion), not 10,000.

**Acceptance Scenarios**:

1. **Given** a benefit at 80% with covered allocation 8,000, **When** the employee submits proof of a 10,000 spend, **Then** the reimbursable amount is the covered portion (8,000), capped at the covered allocation.
2. **Given** partial claims, **When** the employee claims across the year, **Then** total reimbursement never exceeds the benefit's covered allocation.
3. **Given** the claims table, **When** the employee views a benefit, **Then** the amounts shown (allocated / reimbursed / pending / left) are in **covered (company) terms**, consistent with the pool.

### Edge Cases

- A benefit at **0% coverage** — allowed? Working default: rates are 50/80/100 today; 0% would mean nothing draws from the pool (effectively an unfunded listing). Treat 0% as valid config but out of scope for the seeded menu.
- A **non-1,000** covered amount arising from the rate (e.g. 80% of 9,000 = 7,200) — see DC-2.
- **Medical** — always 100%, so covered = premium; no cost/out-of-pocket split applies (the rate card *is* the cost). Its cap-exemption and pool-ceiling cap are unchanged.
- **Rate changed after a claim exists** (on a reopened basket) — the FR-036 claimed-locks still bind on the covered amount; a rate cut must not push the covered allocation below what's already been claimed. (Interaction to confirm in planning.)
- **Coverage rate raised** while a basket is drafted — pool draw drops; the employee may then be under-allocated (fine) or freed to add more.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-C01**: Each flexible **benefit MUST carry a company coverage rate** (a percentage, 0–100), server-authoritative and configurable by HR / Super User. Seeded defaults: 100% (Personal medical, Annual health check-up, Coaching/therapy); 80% (Gym, Sports, Schooling, Childcare, Caregiver, Personal learning); 50% (Mobile device, Home-office setup).
- **FR-C02**: For a non-medical benefit, the system MUST derive the **covered (company) amount = cost × coverage rate** and the **employee out-of-pocket = cost − covered amount**. Only the **covered amount draws from the pool**.
- **FR-C03**: The **pool total MUST be the sum of covered amounts** (plus the medical premium). Remaining pool = ceiling − covered total. The over-pool check MUST run on the covered total, not full costs.
- **FR-C04**: The **50% single-benefit cap (full-time only) MUST apply to the covered amount** — no single non-medical benefit's covered share may exceed 50% of the pool ceiling. Part-time remains exempt.
- **FR-C05**: The **selection limit MUST be 5 for full-time** (raised from 4) and **3 for part-time** (raised from 2). Over-selection prevention (007 FR-035) applies at the new limits.
- **FR-C06**: **Medical MUST remain a single item, rate-card-priced, and 100% covered** — its premium is the covered amount and the pool draw; it stays exempt from the 50% cap and capped at the pool ceiling. No Personal/Family split.
- **FR-C07**: The selector MUST **show, per selected benefit, the coverage rate, the company/pool share, and the employee out-of-pocket**, and MUST show pool totals in **covered (company) terms** (exact labels per DC-3).
- **FR-C08**: **Claims MUST reimburse the covered portion** of a proven spend, capped at the benefit's **covered allocation**; the claims table's allocated / reimbursed / pending / left figures MUST be in covered terms, consistent with the pool.
- **FR-C09**: All coverage math MUST be **enforced server-side** on save and submit (the client mirrors it for UX only), consistent with the server-authoritative money rules in the constitution and 007.
- **FR-C10**: The claimed-benefit locks (007 FR-036) MUST continue to hold **in covered terms** — a coverage-rate change or an amount edit MUST NOT push a benefit's covered allocation below the covered amount already claimed for it.
- **FR-C11**: The **guaranteed core, pool ceilings, and medical rate card MUST be unchanged** by this feature.

### Key Entities *(include if feature involves data)*

- **Benefit Catalog Item** (extended): gains a **coverage rate** attribute (percentage). All other attributes (key, name, category, isMedical, claimType, order, active) unchanged.
- **Selection Line** (semantics extended): an allocation now represents a **cost** and a derived **covered amount**; the pool draw is the covered amount. (Whether both are stored or one is derived is a planning decision.)
- **Benefit Claim** (semantics clarified): a claim proves a **full spend** but reimburses the **covered portion**, bounded by the covered allocation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any benefit and cost, the company share and employee out-of-pocket shown to the employee equal cost × rate and cost − (cost × rate) respectively, with zero discrepancy against the server's computed values.
- **SC-002**: The pool meter never counts more than the company's covered share — an employee can allocate covered shares up to 100% of their pool ceiling and no further.
- **SC-003**: 100% of rule breaches (50% cap on covered share for full-time; over-pool on covered total) are caught server-side on submit, independent of the client.
- **SC-004**: Reimbursements never exceed a benefit's covered allocation across all claims for the plan year.
- **SC-005**: An employee can correctly predict their out-of-pocket cost for a chosen basket before submitting (validated by the displayed per-benefit and total out-of-pocket figures).

## Assumptions

- **Employee enters full cost** (DC-1, confirmed 2026-08-05): the selector takes the benefit's cost; company share and out-of-pocket are derived.
- **Step applies to cost** (DC-2, confirmed 2026-08-05): 1,000 increments on the entered cost; covered amounts may be non-1,000 and are not re-rounded.
- **Display** (DC-3, confirmed 2026-08-05): per-benefit cost · company share · your share; pool meter = company share; claims figures in covered terms.
- **Coverage rates are per-benefit, not per-category** — the seed happens to align by category, but the stored rate lives on the catalog item so HR can vary any single benefit.
- **Medical** is treated as 100% covered with the rate card as its cost; no cost/out-of-pocket entry for medical (the premium is the number).
- **Part-time rules and the guaranteed core remain exactly as built** (007) — this feature does not touch them.
- **Reuses** the existing plan-year window, submit/lock, self-reopen, claimed-locks, and admin config surfaces from 007; coverage rate editing slots into the existing admin Benefits **Configuration** tab.
