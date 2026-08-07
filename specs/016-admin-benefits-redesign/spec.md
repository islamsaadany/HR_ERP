# Feature Specification: Admin Benefits Redesign + Manual Claim/Release Entry

**Feature Branch**: `016-admin-benefits-redesign`

**Created**: 2026-08-07

**Status**: Draft

**Input**: Reorganize the HR/Super-User Benefits admin into three clearer tabs (Submissions & Claims · Benefits Catalogue · Amounts), make the config tables view-first (read-only until Edit), fold Claim requirements + coverage % into a single Catalogue table, and add HR/Super-User **manual entry** of an already-approved claim or release (with its approval date). Layers on specs 007 (benefits admin), 013 (bulk release), and 012 (coverage rates).

> **Relationship to other specs**: This is a **reorganization + one new capability** for the admin Benefits
> area. It **preserves all existing behavior** (plan-year popup, submissions view, claims-to-review queue,
> CSV export, reopen/reset, coverage-% editing, server-authoritative money rules). It does **not** change
> any employee-facing screen or any money rule.

## Clarifications

### Decisions already made (do not re-open)

- **Tab order (three tabs):** **(1) Submissions & Claims** — first, most used · **(2) Benefits Catalogue** · **(3) Amounts**. The current *Configuration* and *Claim requirements* tabs are dissolved into Catalogue + Amounts.
- **Benefits Catalogue = one table** per flexible benefit: **Name · Category · Order · Claim requirement (None/Request/Proof) · Coverage %**, plus show/hide (deactivate, never delete) and add-a-benefit. The old *Claim requirements* tab is absorbed here. **Per-benefit Full-time/Part-time eligibility is deferred** to a future spec — no eligibility columns now.
- **Amounts tab** = pool ceilings (type × band), guaranteed amounts (FT/PT per band; Loans stays salary-driven/null), and the medical rate card (self/spouse/child<18/child18+).
- **View-first editing:** every config table (Catalogue + each Amounts table) renders **read-only first**, with an **Edit** button that opens *that* table for editing; **Save** returns it to read-only.
- **Manual claim/release entry** (in Submissions & Claims): HR / Super User records a claim/release that **already happened**, capturing the **approval date**, marked **already-released** (not in the pending queue), counting against the benefit's allocation. Server-authoritative, HR + Super User only.
- **Future (out of scope, note only):** grow Submissions & Claims into a full everyone × benefits table filterable by employee name or benefit, showing each claim/release status.
- **Design:** navy/gold; mirrors the existing `AdminBenefitsTabs` / employee `BenefitsTabs` pattern. No visual redesign of preserved elements.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reorganized tabs, most-used first (Priority: P1)

An HR admin opens `/admin/benefits` and lands on **Submissions & Claims** first. Two more tabs — **Benefits Catalogue** and **Amounts** — hold configuration. The old *Configuration* and *Claim requirements* tabs are gone; their content lives in Catalogue + Amounts.

**Why this priority**: The information architecture is the core of the redesign; everything else hangs off the new tab structure.

**Independent Test**: Open `/admin/benefits` → the default tab is Submissions & Claims; exactly three tabs exist in the order Submissions & Claims · Benefits Catalogue · Amounts; no *Configuration* or *Claim requirements* tab remains.

**Acceptance Scenarios**:

1. **Given** an HR admin on `/admin/benefits`, **When** the page loads, **Then** the **Submissions & Claims** tab is active by default.
2. **Given** the tab bar, **When** it renders, **Then** it shows three tabs in order: Submissions & Claims, Benefits Catalogue, Amounts.
3. **Given** the redesign, **When** an admin looks for claim-requirement or coverage settings, **Then** they are in the **Benefits Catalogue** table (not a separate tab).

### User Story 2 - The Benefits Catalogue as one table (Priority: P1)

The Catalogue tab is a single table with **Name · Category · Order · Claim requirement · Coverage %** per benefit, plus show/hide and add-a-benefit. HR edits everything about a benefit in one place.

**Why this priority**: Consolidating the scattered catalog + claim-requirement + coverage editors into one table is the redesign's biggest usability win.

**Independent Test**: On the Catalogue tab, confirm every active/hidden benefit appears as a row with its name, category, order, claim requirement, and coverage %, and that changing each of those saves.

**Acceptance Scenarios**:

1. **Given** the Catalogue table, **When** it renders, **Then** each benefit shows Name, Category, Order, Claim requirement, and Coverage %.
2. **Given** a benefit row in edit mode, **When** HR changes its claim requirement (None/Request/Proof) and saves, **Then** the change persists and is reflected for employees (same effect as the old Claim requirements tab).
3. **Given** a benefit row, **When** HR sets its Coverage %, **Then** it persists (spec 012 behavior), and **medical stays locked at 100%**.
4. **Given** a benefit, **When** HR hides it, **Then** it is deactivated (not deleted) and existing baskets are unaffected; HR can add a new benefit with a derived unique key.

### User Story 3 - Amounts in one place (Priority: P2)

The Amounts tab gathers the money settings: pool ceilings, guaranteed amounts, and the medical rate card.

**Why this priority**: Grouping the money knobs is valuable but lower-frequency than the catalog and claims.

**Independent Test**: On the Amounts tab, confirm pool ceilings, guaranteed amounts (FT/PT), and the medical rate card are all present and each saves.

**Acceptance Scenarios**:

1. **Given** the Amounts tab, **When** it renders, **Then** pool ceilings, guaranteed amounts, and the medical rate card are all shown.
2. **Given** any of those tables in edit mode, **When** HR saves a change, **Then** it persists with the same validation as today (Loans stays salary-driven/null; ceilings/amounts clamp non-negative).

### User Story 4 - View-first editing (Priority: P2)

Every config table shows as a **read-only** table first; an **Edit** button opens that table for editing; **Save** returns it to read-only.

**Why this priority**: Reduces accidental edits and visual noise; the page reads as a clear summary until you choose to change something.

**Independent Test**: Load the Catalogue and Amounts tabs → tables are read-only with an Edit button; click Edit → inputs appear for that table only; Save → it returns to read-only with the new values.

**Acceptance Scenarios**:

1. **Given** a config table, **When** the tab first loads, **Then** the table is read-only (no inputs) with an **Edit** action.
2. **Given** a table in edit mode, **When** HR clicks **Edit** on a different table, **Then** only the intended table enters edit mode (tables toggle independently).
3. **Given** a table in edit mode, **When** HR saves, **Then** the table returns to read-only showing the saved values.

### User Story 5 - Record an already-approved claim or release (Priority: P1)

An HR admin or Super User records a claim/release that already happened outside the app (e.g. someone already claimed and was paid), choosing the benefit and person, entering the **amount** and the **approval date**. It is stored as **already-released** (not pending), counts against that benefit's allocation, and appears in the history like any released claim.

**Why this priority**: Back-filling real history is required for the claim trackers to reflect reality; without it, allocations and "left to claim" are wrong for anyone paid before/outside the app.

**Independent Test**: As HR, record a released claim for an employee's benefit with an amount and a past approval date → it appears as released (not in the pending queue), the benefit's reimbursed total increases by the amount, and "left to claim" decreases accordingly.

**Acceptance Scenarios**:

1. **Given** HR on Submissions & Claims, **When** they record a manual claim/release with amount + approval date, **Then** it is saved with status **released/approved**, its decided date = the entered approval date, and it does **not** appear in the pending-review queue.
2. **Given** a manual release, **When** the employee/HR views that benefit's tracker, **Then** reimbursed increases by the amount and left-to-claim decreases; total reimbursement never exceeds the benefit's allocation.
3. **Given** a non-privileged user, **When** they attempt the manual-entry action, **Then** it is denied server-side.
4. **Given** a manual entry, **When** it is recorded, **Then** the acting admin and the approval date are captured for the audit trail.

### Edge Cases

- **Manual amount exceeds remaining allocation** — the entry MUST be prevented or clamped so total reimbursement (existing + manual) never exceeds the benefit's allocation (consistent with the claim rules; coverage terms per spec 012).
- **Manual entry for a benefit the employee didn't select / has no allocation** — guarded: a manual release requires an allocation to count against (guaranteed benefit or a submitted basket line), else it's rejected with a clear message.
- **Approval date in the future** — rejected (an "already happened" record can't be dated ahead).
- **Editing a table, then switching tabs** — unsaved edits are discarded on tab switch (read-only is the resting state); no partial saves.
- **Empty catalog / no plan year** — the Catalogue/Amounts tabs still render (empty states); manual entry and submissions require an active plan year (as today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The admin Benefits page MUST present exactly **three tabs** in order **Submissions & Claims · Benefits Catalogue · Amounts**, defaulting to Submissions & Claims. The former *Configuration* and *Claim requirements* tabs MUST be removed.
- **FR-002**: The **Benefits Catalogue** MUST be a single table with **Name, Category, Order, Claim requirement (None/Request/Proof), and Coverage %** per benefit, plus show/hide (deactivate) and add-a-benefit. It MUST absorb the former Claim-requirements editing; **no FT/PT eligibility column** is added.
- **FR-003**: The **Amounts** tab MUST contain pool ceilings (type × band), guaranteed amounts (FT/PT per band; Loans salary-driven/null), and the medical rate card — with today's validation.
- **FR-004**: Every configuration table (Catalogue + each Amounts table) MUST render **read-only by default** with an **Edit** action; entering edit mode reveals inputs for that table only; **Save** persists and returns it to read-only. Tables toggle **independently**.
- **FR-005**: HR / Super User MUST be able to **record a manual claim/release** that already happened — selecting the benefit + employee and entering the **amount** and **approval date** — stored as **released/approved** (not pending), with the decided date = the entered approval date and the acting admin captured.
- **FR-006**: A manual release MUST **count against the benefit's allocation** exactly like a released claim, and total reimbursement (existing + manual) MUST NOT exceed the benefit's allocation (covered terms per spec 012).
- **FR-007**: A manual release MUST require a valid **allocation target** (a guaranteed benefit the employee is eligible for, or a submitted basket line) and MUST reject a **future** approval date.
- **FR-008**: All new/changed admin actions (catalog edits incl. claim requirement + coverage %, amounts edits, manual entry) MUST be **server-authoritative** and restricted to **HR Admin + Super User**.
- **FR-009**: The redesign MUST **preserve** the plan-year popup, the submissions view, the claims-to-review queue (Release/Reject), CSV export, and reopen/reset — relocated as needed but functionally intact.
- **FR-010**: The redesign MUST NOT change any **employee-facing** screen or any **money rule** (pool ceiling, 50% cap, selection limits, coverage math, medical handling).

### Key Entities *(include if feature involves data)*

- **Benefit Claim** (reused, semantics extended): a manual entry is a `BenefitClaim` created directly in the **released/approved** state with a recorded **approval (decided) date** and reviewing admin, rather than progressing through pending → released. Amount is bounded by the benefit's remaining allocation.
- No new persistent entities are required if the existing claim model can represent a released claim with a back-dated decision date and reviewer. (A planning decision: confirm the claim model carries decided date + reviewer — it does today.)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The admin Benefits page shows **three tabs** (Submissions & Claims · Benefits Catalogue · Amounts), default Submissions & Claims; **zero** *Configuration*/*Claim requirements* tabs remain.
- **SC-002**: A benefit's name, category, order, claim requirement, and coverage % are all editable from the **single Catalogue table**, with **100%** of those edits persisting.
- **SC-003**: All config tables start **read-only**; editing requires an explicit Edit, and Save returns to read-only — verified across Catalogue + all Amounts tables.
- **SC-004**: HR can record an already-approved claim/release with an approval date; it appears as **released** (not pending), and the benefit's reimbursed/left-to-claim update correctly in **100%** of cases, never exceeding the allocation.
- **SC-005**: No employee-facing screen and no money-rule outcome changes as a result of this redesign (regression-checked).

## Assumptions

- **Reuses** the existing admin gating (HR Admin + Super User), the `BenefitClaim` model (decided date + reviewer already exist), the coverage-% field (spec 012), and the plan-year/window model.
- **Coverage-% editing moves** from the old Configuration catalog editor into the new Catalogue table (same server action/validation, relocated).
- **Manual entry is a released `BenefitClaim`** with a back-dated decision date; no new table unless planning finds the model insufficient.
- **The everyone × benefits filterable master table is deferred** (future spec); this spec keeps the current submissions + claims-queue views.
- **View-first is a display state**, not new persistence — unsaved edits are discarded on tab switch.
- **Navy/gold**, mirroring `AdminBenefitsTabs` / `BenefitsTabs`; no redesign of preserved elements.
