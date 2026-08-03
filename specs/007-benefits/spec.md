# Feature Specification: Benefits — Flexible Benefits Selection

**Feature Branch**: `007-benefits`

**Created**: 2026-07-27

**Status**: Draft

**Input**: User description: "Benefits — the money module. Employees see their guaranteed (fixed) benefits and build a flexible basket from 4 categories subject to server-enforced rules (pool ceiling by type × tenure, 50% single-benefit cap for full-time, max-2 for part-time, medical insurance rate-card-priced and exempt from the 50% cap). Save (autosave draft) and submit (locks) within an admin-controlled plan-year window. HR configures the cycle, ceilings, fixed amounts, catalog, and medical rate card, and views submissions. Design ported faithfully from benefitsselector_3.html."

## Clarifications

### Session 2026-07-27

- **Pool ceilings (EGP) by tenure band** — FT: 20,000 / 30,000 / 45,000 / 65,000 · PT: 14,000 / 21,000 / 30,000 / 42,000, across bands 6mo–2y / 2–4y / 4–7y / 7–10y.
- **Basket catalog (grouped, ported from `benefitsselector_3.html`):** items are grouped into 5 categories for display — **Health & protection** (Personal Medical Insurance, Annual health check-up) · **Wellbeing** (Gym membership, Coaching / therapy, Sports expenses) · **Life & family** (Schooling / education, Childcare / nursery, Caregiver support) · **Personal growth** (Personal learning) · **Lifestyle & flexibility** (Mobile device, Home-office setup). Personal Medical Insurance covers the employee only; spouse/children are separate priced options in the medical modal. No separate per-category cap and no extra per-benefit eligibility — the pool ceiling + 50% cap (FT) / max-2 (PT) govern.
- **Full-time rule:** no single (non-medical) benefit may exceed 50% of the pool; up to 4 picks (⇒ practically 2–4). **Part-time rule:** max 2 picks; budget = the part-time ceiling.
- **Medical insurance:** single tier; self 8,000 (always included, auto-marked), spouse 8,000, child <18 4,500, child ≥18 8,000; **exempt from the 50% cap** but capped at the pool ceiling. Dependants entered manually in the selection for now (not pulled from the registry).
- **Guaranteed/fixed benefits are real figures** by tenure (see Assumptions) and are **display-only**.
- **Employment type + tenure band come from the profile** (HR-set), not chosen by the employee.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See my guaranteed benefits (Priority: P1)

An employee opens Benefits and first sees the **fixed/guaranteed** benefits they automatically receive (marriage allowance, summer allowance, professional development, special events, loans), with amounts reflecting their tenure band. These are informational — nothing to select.

**Why this priority**: Employees should see everything they already get before making choices; it frames the flexible basket and is the simplest, safest slice.

**Independent Test**: Sign in as a full-time employee in a given band and confirm the guaranteed benefits show the correct figures for that band; a part-time employee sees the part-time set (no summer/loans).

**Acceptance Scenarios**:

1. **Given** an employee with a known type + band, **When** they open Benefits, **Then** the guaranteed benefits are shown first with the amounts for their band.
2. **Given** a part-time employee, **When** they view guaranteed benefits, **Then** they see the part-time set (marriage, professional development, special events) and not summer allowance or loans.
3. **Given** the guaranteed section, **When** the employee views it, **Then** it is display-only (no selection controls).

### User Story 2 - Build and save my flexible basket (Priority: P1)

An employee builds a flexible basket by selecting from the 4 categories and allocating amounts (in steps of 1,000). A live meter shows allocated vs. their pool ceiling and warns on rule breaches. Their draft autosaves so they can return to it.

**Why this priority**: This is the core of the module — the actual employee choice, with the money rules.

**Independent Test**: Select two benefits, allocate amounts within the ceiling and under the 50% cap, and confirm the meter, remaining headroom, and autosaved draft are correct.

**Acceptance Scenarios**:

1. **Given** a full-time employee, **When** they allocate to a single non-medical benefit more than 50% of their pool, **Then** the system flags the breach and the basket cannot be submitted while it persists.
2. **Given** any employee, **When** total allocation exceeds their pool ceiling, **Then** the system flags "over budget" and blocks submission.
3. **Given** a part-time employee, **When** they try to select a 3rd benefit, **Then** the system prevents it (max 2).
4. **Given** allocations in progress, **When** the employee leaves and returns, **Then** their draft basket is restored (autosaved).
5. **Given** amounts, **When** the employee adjusts them, **Then** they change in steps of 1,000 and the meter/remaining headroom update live.

### User Story 3 - Configure medical insurance (Priority: P1)

When an employee selects Personal Medical Insurance, they configure cover: self is always included; they can add spouse and children (entered by bracket). The premium is computed from the rate card, shown, and is exempt from the 50% cap but capped at the pool ceiling.

**Why this priority**: Medical is the special, rate-card-priced, cap-exempt benefit — its own rules make it a distinct first-class flow.

**Independent Test**: Select medical, include spouse and one under-18 child, and confirm the premium equals self + spouse + child rate, exempt from the 50% cap, and capped at the ceiling if it would exceed it.

**Acceptance Scenarios**:

1. **Given** an employee selecting medical, **When** the selection is made, **Then** self (8,000) is automatically included.
2. **Given** the medical configuration, **When** the employee adds spouse and/or children (under-18 / 18-plus counts), **Then** the premium = 8,000 + (spouse ? 8,000 : 0) + 4,500 × under-18 + 8,000 × 18-plus.
3. **Given** a computed medical premium, **When** it exceeds 50% of the pool, **Then** it is still allowed (exempt), but **When** it would exceed the pool ceiling, **Then** it is capped at the ceiling.
4. **Given** medical is configured, **When** the basket meter updates, **Then** the medical amount is counted toward the pool total but excluded from the 50% single-benefit check.

### User Story 4 - Submit within the plan-year window (Priority: P1)

An employee submits their basket while the plan-year window is open. Submission is validated against all rules server-side and, once accepted, the basket is locked for the year (unless HR reopens it). Outside the window, saving/submitting is not available.

**Why this priority**: Submission is the committing action and the point where server-side enforcement is non-negotiable.

**Independent Test**: With the window open, submit a valid basket and confirm it locks; attempt to submit a rule-breaking basket and confirm the server rejects it; with the window closed, confirm submission is unavailable.

**Acceptance Scenarios**:

1. **Given** an open window and a valid basket, **When** the employee submits, **Then** the basket is accepted, marked submitted, and locked.
2. **Given** a basket that breaks any rule, **When** the employee submits, **Then** the server rejects it with the specific reason(s) — client-side checks are not trusted.
3. **Given** a closed window, **When** the employee opens Benefits, **Then** they can view but not save/submit.
4. **Given** a submitted (locked) basket, **When** the employee returns, **Then** it is read-only unless HR has reopened it.

### User Story 5 - HR configures the benefits cycle (Priority: P1)

HR / Super User configures the plan-year window (open/close), the pool ceilings (type × band), the guaranteed/fixed amounts (type × band), the basket catalog (the 4 categories), and the medical rate card; and views all employee submissions.

**Why this priority**: The employee experience is meaningless without the admin-configured rules and figures behind it; and the window controls when selection happens.

**Independent Test**: As HR, open a plan year, confirm employees can then submit; change a ceiling and confirm the employee's pool reflects it; view the submissions list.

**Acceptance Scenarios**:

1. **Given** HR, **When** they open a plan-year window, **Then** employees can save/submit; **When** they close it, **Then** they cannot.
2. **Given** HR, **When** they set pool ceilings and fixed amounts per type × band, **Then** employees see the correct pool and guaranteed figures.
3. **Given** HR, **When** they edit the basket catalog or medical rate card, **Then** the employee selection reflects the change for new/unsubmitted baskets.
4. **Given** HR, **When** they open the submissions view, **Then** they can see each employee's submitted basket and status.
5. **Given** a submitted basket, **When** HR reopens it, **Then** the employee can edit and resubmit while the window is open.

### Edge Cases

- **No open plan year**: employees see guaranteed benefits and a read-only/"selection not open" basket; no save/submit.
- **Employee with missing type or band**: cannot compute a pool — the basket is unavailable and the employee/HR is told the profile is incomplete (no guessed pool).
- **Medical premium exceeds the pool ceiling**: capped at the ceiling (never over-pool), and this is shown clearly.
- **Full-time basket with only one benefit** allocated 100%: blocked by the 50% cap (must spread across ≥2), except a lone medical selection (exempt) is allowed up to the ceiling.
- **Rule change after submission**: a submitted (locked) basket is not silently altered; if HR reopens it, it is re-validated against current rules.
- **Rounding / non-1,000 amounts**: amounts are constrained to steps of 1,000.
- **Placeholder figures**: nothing is presented as final while any configured figure is still marked placeholder.
- **Client tampering**: any basket that passes client checks but breaks a rule is rejected by the server on save/submit.

## Requirements *(mandatory)*

### Functional Requirements

**Inputs from the profile**
- **FR-001**: The system MUST derive the employee's pool ceiling and guaranteed amounts from their employment type and tenure band (from the registry); employees MUST NOT choose these.
- **FR-002**: The system MUST show the guaranteed/fixed benefits (display-only) with the amounts for the employee's type × band, presented compactly as one line each (label + amount).

**Flexible basket & rules (server-authoritative)**
- **FR-003**: The system MUST offer the basket catalog for selection, grouped for display into 5 categories (Health & protection, Wellbeing, Life & family, Personal growth, Lifestyle & flexibility) with the items ported from `benefitsselector_3.html`. The catalog is admin-configurable; the grouping and item set are not fixed at 4.
- **FR-004**: The system MUST enforce that total allocation does not exceed the employee's pool ceiling.
- **FR-005**: The system MUST enforce, for full-time employees, that no single non-medical benefit exceeds 50% of the pool.
- **FR-006**: The system MUST enforce, for part-time employees, a maximum of 2 selected benefits.
- **FR-007**: The system MUST allow amounts to be allocated in steps of 1,000.
- **FR-008**: The system MUST price Personal Medical Insurance from the rate card (self 8,000 always included; spouse 8,000; child <18 4,500; child ≥18 8,000), exempt it from the 50% cap, and cap it at the pool ceiling.
- **FR-009**: The system MUST count the medical premium toward the pool total while excluding it from the 50% single-benefit check.
- **FR-010**: The system MUST let the employee configure medical dependants manually (spouse toggle; children counts by under-18 / 18-plus bracket) for now.
- **FR-011**: The system MUST validate the entire basket against all rules on the server at save and submit; client-side checks are for UX only and are never trusted.
- **FR-012**: The system MUST show a live summary (allocated vs. ceiling, remaining headroom, selection count, rule warnings), and MUST keep this summary visible while the employee scrolls the basket — a sticky side panel on wide screens and a pinned floating bar (total · remaining · save/submit) on small screens.

**Lifecycle & window**
- **FR-013**: The system MUST autosave the basket as a draft so an employee can leave and return.
- **FR-014**: The system MUST allow submission only while the plan-year window is open, and lock the basket once submitted.
- **FR-015**: The system MUST prevent saving/submitting when no plan-year window is open.
- **FR-016**: The system MUST allow HR / Super User to reopen a submitted basket for editing (within an open window).

**Admin configuration**
- **FR-017**: HR / Super User MUST be able to open and close the plan-year window.
- **FR-018**: HR / Super User MUST be able to configure pool ceilings per (employment type × tenure band).
- **FR-019**: HR / Super User MUST be able to configure the guaranteed/fixed benefit amounts per (type × band).
- **FR-020**: HR / Super User MUST be able to configure the basket catalog (the categories) and the medical rate card.
- **FR-021**: HR / Super User MUST be able to view all employee submissions and their status.
- **FR-022**: The system MUST NOT present any figure as final while it is flagged as placeholder/pending.

**Design fidelity**
- **FR-023**: The employee selection experience MUST faithfully port the **layout & interaction model** of `benefitsselector_3.html` (the guaranteed panel, the basket list, the live meter, and the medical modal) without redesigning its structure, **recolored into the product's navy/gold palette** (not the original paper/pine).

**Claims & reimbursement (Phase-2, built)**
- **FR-024**: On submission the employee MUST see a clear confirmation banner, after which a "Your benefits & claims" area lets them request/claim the benefits they're entitled to.
- **FR-025**: Every benefit (guaranteed + basket) MUST carry an HR-configurable **claim policy**: **None** (paid automatically, no claim), **Note** (request with an optional note), or **Proof** (mandatory proof-of-payment upload). Editable in Admin → Benefits.
- **FR-026**: For Proof benefits the employee MUST upload a proof file (Vercel Blob); the claim enters **Pending review**. HR/Super User MUST review and either **Release** (reimbursed) or **Reject** (with a reason), enforced server-side.
- **FR-027**: The employee MUST be able to file **multiple partial claims** against a benefit up to its allocation; the server MUST reject a claim that exceeds the remaining allocation (pending + released count against it).
- **FR-028**: The employee MUST see a per-benefit reimbursement tracker — allocated, reimbursed, pending, and left-to-claim — plus their claim history and statuses.
- **FR-029**: HR MUST be able to **Reopen** a submitted basket (edit) and fully **Reset** it (clear to start fresh); Reset MUST be blocked when the employee has any claims for the plan year, so nothing is lost.

### Key Entities *(include if feature involves data)*

- **Plan Year**: a benefits cycle with an open/close window (status). Selections are only editable while open.
- **Pool Ceiling**: the maximum basket budget for an (employment type × tenure band) — the confirmed EGP figures.
- **Guaranteed Benefit**: a fixed benefit (marriage, summer, professional development, special events, loans) with amounts per (type × band); display-only.
- **Benefit Catalog Item**: a selectable basket item with a display `category` (Health & protection, Wellbeing, Life & family, Personal growth, Lifestyle & flexibility); medical is special (rate-card priced, cap-exempt).
- **Medical Rate Card**: the per-cover prices (self, spouse, child <18, child ≥18).
- **Benefit Selection (basket)**: an employee's basket for a plan year — status (draft / submitted / reopened), and its lines.
- **Selection Line**: one chosen benefit with its amount (or, for medical, its computed premium + the dependant configuration).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An employee can view their guaranteed benefits and complete a valid basket in under 5 minutes.
- **SC-002**: 100% of rule breaches (over-ceiling, over-50%-cap for full-time, over-2 for part-time) are caught by the server and cannot be submitted.
- **SC-003**: The pool total, remaining headroom, and 50%-cap checks are always correct, including with a cap-exempt medical premium in the basket.
- **SC-004**: Medical premiums equal the rate-card computation in 100% of configurations and never exceed the pool ceiling.
- **SC-005**: No save or submit is possible outside an open plan-year window (0 exceptions).
- **SC-006**: A submitted basket is immutable until HR reopens it (0 silent changes).
- **SC-007**: HR configuration changes (ceiling, fixed amounts, catalog, rate card) are reflected in the employee experience for unsubmitted baskets without developer involvement.
- **SC-008**: The ported selection screen matches the reference design (visual review sign-off).

## Assumptions

- **Confirmed pool ceilings (EGP):** FT 20,000 / 30,000 / 45,000 / 65,000 · PT 14,000 / 21,000 / 30,000 / 42,000 across bands 6mo–2y / 2–4y / 4–7y / 7–10y.
- **Confirmed guaranteed amounts by band (EGP)** — FT: Marriage 18,000/24,000/30,000/36,000 · Summer 2,500/3,500/5,000/6,000 · Professional development 5,000/9,500/18,000/21,500 · Special events 6,000/8,500/12,000/18,000 · Loans = one month's salary from year 1 (no fixed figure). PT: Marriage 9,000/12,000/15,000/18,000 · Professional development 5,000/7,000/9,000/11,000 · Special events 6,000/8,500/12,000/18,000 (no summer, no loans).
- **Medical:** single tier; self always included; dependants entered manually for now (spouse toggle + children counts by bracket); exempt from the 50% cap; capped at the pool ceiling.
- **Basket:** no per-category caps and no extra per-benefit eligibility beyond the pool + 50% cap (FT) / max-2 (PT).
- **Reimbursement/claims** (submitting invoices against a chosen benefit) is **Phase 2**, not v1 — v1 ends at a submitted, locked selection.
- **One active plan year at a time** in v1.
- **No emails** — employees are not notified; they see status in-app.
- **Depends on** Foundation (employment type + tenure band from the registry) and the design tokens from the ported selector.
