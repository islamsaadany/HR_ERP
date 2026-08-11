# Feature Specification: Age-Banded Per-Person Medical Rate Card (Tier 1)

**Feature Branch**: `023-medical-age-rate-card`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Age-banded per-person medical insurance rate card (Tier 1). Replace the current relationship-based medical rate card (self / spouse / childUnder18 / child18Plus flat figures) with a rate card priced per covered person by their exact age band … the employee's medical premium = the employee's own age-band annual premium + the sum of each covered dependant's age-band annual premium … collect DOB for everyone priced … only Tier 1 for now … mid-cycle joiners still prorated ÷12 from the 3-month medical eligibility date … medical committed once, locked, 50%-cap-exempt, draws from the pool … values carry decimals."

## Overview

Today medical is priced by **relationship**: a rate card holds four flat annual figures — `self`, `spouse`, `childUnder18`, `child18Plus` — and the employee's setup collects a spouse yes/no plus counts of under-18 and 18-plus children. The real insurer rate card prices by **each person's age**, not their relationship. This feature replaces the relationship-based card with an **age-banded rate card (Tier 1)**: the annual premium for any one covered person is read from a 12-row age table, and the employee's total medical premium is the **sum of every covered person's age-band annual premium** (the employee + spouse + each covered child).

To price by age, the system must know **each covered person's date of birth**: the employee's DOB (today optional) becomes **required to commit medical**, the spouse gains a DOB, and children are chosen as **individual people with DOBs** (reusing the existing dependant records) rather than as raw counts.

Everything else about medical is unchanged in principle: it unlocks at 3 months of service, is **committed once per plan year and then locked** (HR-editable only), is **exempt from the 50%-per-benefit cap**, and its premium **draws from the pool ceiling**. Mid-cycle joiners are still prorated by remaining whole months ÷ 12 from their 3-month medical eligibility date (spec 019) — the only change is that the **annual figure being prorated now comes from the age-banded card** instead of the placeholder relationship card.

Only **Tier 1** exists today. The design models a single age-banded rate card but is structured so additional tiers can be added later without reshaping the data.

### Tier 1 rate card (annual, EGP)

| Age band | Annual premium (EGP) |
|---|---|
| 0 days – 17 years | 3,990.72 |
| 18 – 24 | 5,173.57 |
| 25 – 29 | 5,708.69 |
| 30 – 34 | 7,181.70 |
| 35 – 39 | 8,898.47 |
| 40 – 44 | 9,883.96 |
| 45 – 49 | 12,497.11 |
| 50 – 54 | 13,297.38 |
| 55 – 59 | 16,139.08 |
| 60 – 64 | 21,912.07 |
| 65 – 69 | 23,788.03 |
| 70 – 75 | 29,796.12 |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR manages the age-banded rate card (Priority: P1)

An HR/Admin views and edits the medical rate card as a table of **age bands → annual premium**, instead of the four self/spouse/child figures. They can correct any band's amount (values carry two decimals).

**Why this priority**: The age table is the pricing source for every medical premium in the module. Nothing else in this feature can be computed until it exists and is editable.

**Independent Test**: Open Admin → Benefits → Amounts, confirm the medical rate card shows the 12 age bands with their annual premiums (two-decimal EGP), edit one band, save, and confirm it persists and is reflected in an employee's premium preview.

**Acceptance Scenarios**:

1. **Given** an HR/Admin on the Amounts tab, **When** they open the medical rate card, **Then** they see the 12 age bands each with an editable annual premium (two decimals), not the old self/spouse/child fields.
2. **Given** an HR/Admin edits a band's premium and saves, **When** an employee whose age (or a dependant's age) falls in that band previews medical, **Then** the new figure is used.

---

### User Story 2 - Employee's premium is the sum of each person's age-band price (Priority: P1)

An employee setting up medical sees a premium computed as **their own age-band annual premium + each covered person's age-band annual premium**. Adding or removing a covered person changes the premium by exactly that person's age-band amount.

**Why this priority**: This is the core money outcome and the reason the feature exists — the premium must match the insurer's per-person pricing.

**Independent Test**: Take an employee with a known DOB and two covered dependants with known DOBs; confirm the previewed and committed premium equals the sum of the three age-band figures (before any proration), and that removing a dependant subtracts exactly that dependant's band amount.

**Acceptance Scenarios**:

1. **Given** an employee aged 32 (band 30–34 = 7,181.70) committing personal-only medical, **When** they commit, **Then** the annual premium is 7,181.70 (before proration).
2. **Given** that employee adds a spouse aged 29 (band 25–29 = 5,708.69) and one child aged 10 (band 0–17 = 3,990.72), **When** they preview, **Then** the annual premium is 7,181.70 + 5,708.69 + 3,990.72 = 16,881.11.
3. **Given** the employee removes the child, **When** they preview again, **Then** the premium drops by exactly 3,990.72.

---

### User Story 3 - DOB is collected for everyone priced (Priority: P1)

Because pricing is by age, the employee's DOB is **required to commit medical**, the spouse has a DOB, and children are chosen as **named people with DOBs** (reusing dependant records) rather than counts. If a required DOB is missing, medical commit is blocked with a clear, actionable message.

**Why this priority**: Without a DOB the premium cannot be priced; this is the data prerequisite for User Story 2 and must ship with it.

**Independent Test**: Attempt to commit medical for an employee with no DOB → blocked with a message to set the DOB; set the DOB → commit succeeds. Attempt to include a spouse/child with no DOB → that person cannot be priced and is blocked with a clear message.

**Acceptance Scenarios**:

1. **Given** an employee with no recorded DOB, **When** they open medical setup, **Then** they are told a date of birth is required for medical and directed to where it is set, and commit is blocked until it exists.
2. **Given** a Family-eligible employee adding a spouse, **When** they add the spouse, **Then** they must provide the spouse's DOB before the spouse can be covered.
3. **Given** an employee with existing children on file (each with a DOB), **When** they set up medical, **Then** they pick which children to cover as individuals, and each covered child is priced from its own DOB.

---

### User Story 4 - Mid-cycle joiner's age-banded premium is prorated (Priority: P2)

An employee who becomes medical-eligible (3 months) part-way through the plan year has their **age-banded annual premium** prorated by remaining whole months ÷ 12, exactly as spec 019 already does — only the annual figure now comes from the age table.

**Why this priority**: Preserves the established mid-cycle-joiner rule while switching the pricing source; important but rides on the existing, tested proration path.

**Independent Test**: Take a mid-cycle medical joiner with a known age-banded annual premium; confirm the committed premium equals `age-banded annual × remaining whole months ÷ 12`.

**Acceptance Scenarios**:

1. **Given** an employee whose age-banded annual premium is 7,181.70 and whose 3-month medical eligibility date leaves 3 whole months in the plan year, **When** they commit, **Then** the committed premium is 7,181.70 × 3 ÷ 12 = 1,795.43 (rounded per the Assumptions rounding rule).
2. **Given** an employee eligible from day one of the plan year, **When** they commit, **Then** the full age-banded annual premium applies (no proration).

---

### User Story 5 - Committed medical stays locked, exempt, and pool-drawing (Priority: P2)

After commit, medical behaves exactly as today: **one commitment per plan year**, **locked to the employee** (HR-editable only), **exempt from the 50%-per-benefit cap**, and its premium **draws from the pool ceiling** (capped at the ceiling with an over-pool warning).

**Why this priority**: Protects the existing, correct commitment/enforcement behavior so the pricing change doesn't regress it.

**Independent Test**: Commit medical, confirm the employee cannot change it (only HR can), confirm the premium counts against the pool but is not subject to the 50% cap, and that a premium above the pool ceiling is capped with a warning.

**Acceptance Scenarios**:

1. **Given** a committed medical election, **When** the employee tries to change it, **Then** they cannot; only HR can edit or remove it.
2. **Given** a committed premium, **When** the pool's 50%-per-benefit cap is evaluated, **Then** medical is excluded from that cap but still consumes pool ceiling.

---

### Edge Cases

- **Missing DOB (employee, spouse, or child)**: The person cannot be priced. The system MUST block committing medical for anyone lacking a DOB, with a clear message pointing to where the DOB is set (HR for the employee record; the dependant record for a child; the spouse DOB field). It MUST NOT guess an age or silently drop the person.
- **Age above the top band (over 75)**: The table stops at 70–75. A person older than 75 MUST be handled by an explicit rule (see Assumptions — default: use the top band and flag for HR), never silently priced at zero.
- **Age exactly on a band boundary** (e.g., turns 18): Age is measured in completed years as of the pricing reference date (see Assumptions); an 18-year-old prices in the 18–24 band.
- **A child who ages out of the 0–17 band mid-year**: Priced by their age as of the pricing reference date for the plan year; not re-priced mid-year (medical is committed once and locked).
- **Decimals**: Premiums carry two decimals; the sum of per-person figures and any proration MUST preserve cents to a defined rounding rule (see Assumptions), not truncate to whole EGP.
- **Personal-only employee** (not Family-eligible, spec 021): Priced on the employee alone; no spouse/child pricing shown.
- **Existing committed premiums from the old model**: Commitments made before this change keep their stored premium (historical record); the new pricing applies to new commits (see Assumptions/Dependencies for the cutover).
- **Pool ceiling is a whole number, premium has decimals**: The premium draws from the pool; the ceiling comparison MUST handle a decimal premium against an integer ceiling without rounding away the difference in the employee's favor or the company's.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST price medical **per covered person by age band**, replacing the relationship-based self/spouse/childUnder18/child18Plus rate card.
- **FR-002**: The system MUST provide an **age-banded rate card** with the 12 Tier-1 bands and their annual premiums (two-decimal EGP), editable by HR/Admin.
- **FR-003**: The system MUST compute an employee's **annual medical premium** as the sum of the age-band annual premium of the **employee** plus each **covered dependant** (spouse + each covered child).
- **FR-004**: The system MUST determine each person's age band from their **date of birth**, measured as completed years at the pricing reference date (see Assumptions).
- **FR-005**: The system MUST require the **employee's date of birth** before medical can be committed, and MUST block commit with a clear message when it is missing.
- **FR-006**: The spouse and children MUST be entered as **dependant records with dates of birth in the employee data-entry surface where children are already entered** (a dependant **type** distinguishes spouse from child); the **medical modal only selects** which existing dependants to cover, and does not create them. At most one spouse per employee.
- **FR-007**: The system MUST block covering any person (spouse or child) who lacks a date of birth, with a clear message, rather than guessing an age.
- **FR-008**: For a **mid-cycle medical joiner**, the system MUST prorate the age-banded annual premium by `remaining whole months ÷ 12` from the 3-month medical eligibility date (unchanged from spec 019 except for the pricing source).
- **FR-009**: Medical MUST remain **committed once per plan year and locked** after commit (employee cannot change; HR can edit/remove).
- **FR-010**: The committed medical premium MUST remain **exempt from the 50%-per-benefit cap** and MUST **draw from the pool ceiling**, capped at the ceiling with an over-pool warning (existing behavior).
- **FR-011**: The system MUST **preserve two-decimal precision** for premiums through summation and proration, applying a single defined rounding rule (see Assumptions).
- **FR-012**: The system MUST handle a person **older than the top band (over 75)** by an explicit rule (default: price at the top band and flag for HR), never silently at zero.
- **FR-013**: The rate card MUST be modeled so **additional tiers** can be added later without reshaping the data; only **Tier 1** is defined now.
- **FR-014**: The employee-facing medical setup MUST show a **live premium preview** that reflects the per-person age-band sum and any proration, so the figure is understood before commit.
- **FR-015**: The change MUST be **server-authoritative** — the premium and all gating are computed/enforced on the server at commit time; the client preview mirrors it for display only.
- **FR-016**: The system MUST NOT present placeholder figures as final; the Tier-1 table in this spec is the confirmed source unless HR edits it.

### Key Entities *(include if data involved)*

- **Age-banded rate card (Tier 1)**: A set of age bands, each with a lower and upper age bound and an annual premium (two decimals). One tier today; shaped to allow more.
- **Covered person (derived for pricing)**: The employee and each covered dependant, each contributing their age-band annual premium. Age derived from DOB; never stored as a number.
- **Employee DOB**: Existing optional field, now **required for medical**.
- **Spouse (for medical)**: Gains a **date of birth** so the spouse can be priced.
- **Dependant (child)**: Existing record with a DOB; children are **selected individually** for medical coverage.
- **Medical commitment**: Existing once-per-plan-year, locked election; now stores/derives its premium from the age-banded per-person sum. Which covered people it includes must be recorded so the committed premium is explainable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of medical premiums equal the exact sum of each covered person's Tier-1 age-band annual premium (before proration), to the cent.
- **SC-002**: 0% of medical commitments succeed for a covered person (employee, spouse, or child) with no date of birth.
- **SC-003**: 100% of mid-cycle medical joiners see a committed premium equal to their age-banded annual premium × remaining whole months ÷ 12 (per the rounding rule).
- **SC-004**: An HR/Admin can correct any age band's premium and see it reflected in employees' previews without a code change.
- **SC-005**: 100% of committed medical elections remain locked to the employee (HR-editable only) and excluded from the 50%-per-benefit cap, unchanged from before.
- **SC-006**: An employee can see, before committing, a premium breakdown that reconciles to the sum of the covered people's age-band figures.

## Assumptions

- **Pricing reference date** *(confirmed 2026-08-11)*: A person's age is computed as **completed years at the employee's medical commit date**. The premium therefore reflects each covered person's age on the day the election is made (and is then locked). A person who crosses a band boundary before committing prices in the higher band.
- **Age-band bounds**: Bands are inclusive by completed years — "0 days – 17" means age ≤ 17 (under 18); "18 – 24" means 18 ≤ age ≤ 24; and so on. A person turning 18 on/before the commit date prices in 18–24.
- **Over-75 handling** *(confirmed 2026-08-11)*: A person older than 75 is priced at the **top band (70–75)** and flagged for HR review, rather than blocked or zero-priced.
- **Whole EGP — cents dropped (truncated), not rounded** *(refined 2026-08-11)*: Employees never see cents. Each covered person's premium is **truncated to whole EGP** — the digits after the decimal are dropped (`Math.trunc`), e.g. 7,181.70 → 7,181, **not** 7,182. The **annual premium** is the sum of those truncated per-person figures; a mid-cycle joiner's **committed premium** is that annual × `months ÷ 12`, again truncated. Truncating per-person first means the displayed breakdown always sums exactly to the annual/committed total. The pool's integer math is unaffected.
- **Storage of decimals** *(refined 2026-08-11)*: The **rate-card band amounts** are stored with two-decimal precision — the operator quotes cents and HR edits the exact figure on the admin card (admin surface approved with cents). Everything **employee-facing** and the **committed premium** are whole EGP.
- **Spouse as a dependant, entered in the profile like kids** *(confirmed + refined 2026-08-11)*: The covered spouse is a proper **dependant record** (name + date of birth), distinguished from a child by a dependant **type**. It is added/edited in the **employee data-entry surface where children are already entered** (the admin employee form / dependant list; CSV as a follow-in) — **not** created inside the medical modal. The medical modal only **selects** which existing dependants (spouse + children) to cover. At most one spouse per employee.
- **Tiers**: Only Tier 1 is defined and assigned to all eligible employees for now; a tier-assignment rule (per employment type, plan, etc.) is out of scope until more tiers exist.
- **Personal vs Family scope (spec 021) is unchanged**: A Personal-only employee is priced on themselves alone; Family-eligible employees can add spouse + children. The FT/PT eligibility gates are unchanged.
- **Existing dependant records are reused**: Children already carry a DOB; this feature adds selection of which children are covered and a spouse DOB. It does not redesign the dependant registry.
- **Historical commitments are not re-priced**: Commitments made under the old relationship card keep their stored premium; new pricing applies from the cutover forward.
- **The pool ceiling, 3-month unlock, sub-6-month medical-only view, and entry-tier fallback (spec 019) are unchanged** except that the annual premium they operate on now comes from the age-banded card.

## Resolved Decisions *(confirmed 2026-08-11)*

The four money-/model-impacting choices are settled and folded into Assumptions and the FRs above:

1. **Pricing reference date** → **commit date** (age at the day medical is committed; then locked). *(FR-004)*
2. **Over-75 handling** → **top band (70–75) + HR flag**. *(FR-012)*
3. **Rounding** → **final committed premium rounded to whole EGP**; rate-card band amounts keep two decimals. *(FR-011)*
4. **Spouse DOB storage** → the **spouse becomes a proper dependant record** (name + DOB, distinguished from a child by a type), **entered in the profile/employee dependant list like kids** — not in the medical modal, which only selects who to cover. *(FR-006, Key Entities)*

### Post-mockup refinements (2026-08-11)

The UI mockup was approved with two changes, folded into Assumptions/FRs above: **(a)** employees see **whole EGP with the cents dropped (truncated, not rounded)** — per-person truncated then summed; the admin card keeps the operator's two-decimal figures; **(b)** the **spouse is added in the employee profile dependant entry like kids**, and the medical modal only **selects** covered dependants.

## Dependencies

- **Confirmed Tier-1 figures (provided)**: The 12-band annual premiums above are the operator's confirmed Tier-1 rates; they replace the spec-019 placeholder rate card.
- **Employee & dependant DOB data**: Pricing depends on DOBs being present. A data-readiness step (HR fills missing DOBs) is a prerequisite for employees to commit medical; the feature blocks (not guesses) when a DOB is missing.
- **Spec 019 medical proration**: Reuses the existing 3-month eligibility + `remaining whole months ÷ 12` rule; this feature only swaps the annual figure being prorated.
- **Spec 021 medical scope (Personal/Family, FT/PT eligibility)**: Unchanged; this feature prices within those scopes.
