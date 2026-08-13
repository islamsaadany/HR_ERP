# Feature Specification: HR Bulk-Release of a Guaranteed Benefit (+ Configurable Sheet)

**Feature Branch**: `013-benefits-bulk-release`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "HR needs to release a single guaranteed benefit — e.g. the summer allowance — to the whole applicable team at once, and download a sheet of employee + amount for payroll/Finance to action. HR picks one fixed allowance benefit; the system computes each applicable active employee's amount (band-derived) and lists them. The **default sheet** has a row-number column, then employee name, then tenure, then the allowance value — and the person generating the report can **choose which non-confidential columns from the registry to include**, making it dynamic and self-serve. **Salary is confidential (HR can't see it), so it is never a column, and the salary-based benefit (Loans) is excluded.** HR/Super User only. Fixed allowance benefits only — not the flexible basket. Does not move money."

> **Relationship to other specs**: Extends the **Benefits admin** surface from spec `007`. It reads the existing
> **guaranteed-benefit configuration** (amounts by type × band) and the **employee registry** (spec `001` fields) —
> it adds no new money rules and changes nothing about the flexible basket or claims.

## Clarifications

### Decisions already made (do not re-open)

- **Access:** HR Admin / Super User only, enforced server-side; the feature lives in the admin Benefits area.
- **Scope:** the **fixed allowance benefits** (summer, marriage, professional development, special events) — **Loans is excluded** (salary-based, confidential), and the **flexible basket** is out of scope (its amounts flow through the employee's own claims).
- **Population:** **active employees** only, filtered to those the chosen benefit **applies to** (by employment type — e.g. summer allowance is full-time only, so part-timers are excluded).
- **Amounts:** the benefit's **configured amount for the employee's tenure band** (the same figure for everyone in a band — not confidential).
- **Salary is out of bounds:** monthly salary is **confidential and not visible to HR**, so it is **never a column** on these sheets, and the **salary-based benefit (Loans) is excluded** from bulk-release entirely (its amount would be the person's salary, and loans aren't released team-wide anyway).
- **Default sheet columns (in order):** **# (row order) · Employee name · Tenure (band) · Allowance value (EGP) · Status**.
- **Release status is tracked per person:** each **employee** has their own release status for the benefit in a plan year — starts **Not released**; HR marks an employee (or a bulk selection) **Released** (records date + who); the sheet's **Status** column shows each person's own status.
- **Bulk mark helper:** HR can select employees to mark released with **Select all / Select none**.
- **Configurable columns (self-serve report generator):** the person generating the sheet can **add/remove non-confidential columns**; the default preset above is what loads first.
- **Output:** a downloadable **sheet (CSV)**, consistent with the existing Finance submissions export.
- **No money movement:** the feature produces the hand-off sheet for payroll/Finance; it does not pay anyone.

### Session 2026-08-05 (clarify)

- **Q (DC-1): Track a release, or just generate the file?** → **A: track a release status per person, shown as a Status column.** Each **employee** has their own release status for the benefit in a plan year: starts **Not released**; HR marks an employee (or a bulk selection) **Released**, recording the date + actor; the sheet's **Status** column shows each person's own status (e.g. "Released — 5 Aug 2026" / "Not released"). *(Tracking release state — unrelated to salary.)*
- **Q (DC-2): Which benefits can HR pick, and any selection helpers?** → **A: show all the fixed allowance benefits**, HR picks one (the salary-based **Loans is excluded**). When marking people released, HR can select the employee rows with **Select all / Select none**.
- **Q (DC-3): File format?** → **A: CSV**, consistent with the existing Finance submissions export.
- **Q (DC-4): Offered columns and salary?** → **A: salary is confidential and never offered.** Default columns are **# · name · tenure · allowance value · status**; HR may optionally add basic **non-confidential** fields (email, department, title, employment type, start date, phone, reporting manager). **Excluded from the picker:** monthly salary, date of birth, marital status, dependants. Column choices apply **per download**; **no saved presets in v1** (named presets are the deferred FR-B11).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Release a benefit to the whole team and download the default sheet (Priority: P1)

An HR Admin opens the admin Benefits area, chooses a guaranteed benefit (e.g. **Summer allowance**), and downloads the sheet. By default it lists every applicable active employee as **# · Name · Tenure · Allowance value**, plus a total and headcount — ready to hand to payroll/Finance to pay out in one batch.

**Why this priority**: This is the core — one action produces a correct, ready-to-use payroll sheet with a sensible default layout.

**Independent Test**: As HR, pick Summer allowance and download with defaults; confirm the sheet has a row-number column, then name, tenure, and the band-correct allowance value for each active full-time employee, excludes part-timers, and shows a correct total and count.

**Acceptance Scenarios**:

1. **Given** HR on the Benefits admin area, **When** they choose a guaranteed benefit and export with defaults, **Then** they receive a sheet whose columns are **# · Employee name · Tenure · Allowance value · Status**, with a total and count.
2. **Given** a full-time-only benefit (summer allowance), **When** the sheet is generated, **Then** part-time employees are **excluded**.
3. **Given** the sheet, **When** HR opens it, **Then** the first column is a **1-based row number** ordering the rows.
4. **Given** employees not yet released, **When** HR selects some (or Select all) and marks them **released**, **Then** each selected employee's release date + actor are recorded and their Status reads "Released — {date}" while unselected employees stay "Not released".
5. **Given** a non-HR user, **When** they attempt to reach the export or the mark-released action, **Then** it is **refused** (server-side role check).

### User Story 2 - Choose which columns to include (self-serve report generator) (Priority: P1)

Before downloading, the report generator can **add or remove columns** from the available registry fields (e.g. add email + department, drop tenure), tailoring the sheet to what payroll/Finance need — without asking anyone. The row-number column always leads and the allowance value is always available.

**Why this priority**: The dynamic, self-serve column choice is the point of this refinement — it makes the export reusable for different downstream needs instead of one fixed layout.

**Independent Test**: Start from the default preset, add "email" and "department" and remove "tenure", download, and confirm the sheet's columns match the selection in the chosen order, still led by the row number and including the allowance value.

**Acceptance Scenarios**:

1. **Given** the export screen, **When** HR opens the column picker, **Then** the default preset (**# · Name · Tenure · Allowance value**) is pre-selected and the other available fields are offered.
2. **Given** the picker, **When** HR adds/removes columns, **Then** the downloaded sheet contains exactly the selected columns in the presented order, always led by the row number.
3. **Given** the picker, **When** HR selects fields, **Then** only fields HR/Super User is authorized to see are offered (no fields beyond their access), and personal fields irrelevant to payroll (DOB, marital status, dependants) are not offered.
4. **Given** any selected columns, **When** the sheet is generated, **Then** the **allowance value** and **row number** are present regardless (they anchor the sheet), and the total/headcount still reflect the population.

### User Story 3 - Correct amounts, ineligible excluded, missing-data flagged (Priority: P1)

The allowance value for each employee is computed from the benefit's configured value for their **tenure band**. Employees the benefit doesn't apply to are excluded; applicable employees **missing the data to compute an amount** (no band, or a null configured amount for their band) are **flagged as needs-attention**, not silently dropped.

**Why this priority**: A payroll sheet must be correct and complete regardless of which columns are chosen — a silently missing or wrong amount is a real payroll error.

**Independent Test**: Seed employees across bands (and one applicable employee with no band); confirm each amount matches the config for their band and the band-less employee appears flagged rather than omitted or shown as zero.

**Acceptance Scenarios**:

1. **Given** employees across tenure bands, **When** the sheet is generated, **Then** each employee's allowance value equals the benefit's configured amount for their band.
2. **Given** an applicable employee with no tenure band (or a null configured amount for their band), **When** the sheet is generated, **Then** that employee is **flagged as needs-attention** (amount blank + a marker), not omitted and not shown as a real amount.
3. **Given** the export, **When** HR reviews it, **Then** the **total** sums only the resolvable amounts and the flagged rows are distinguishable.

### User Story 4 - (Deferred) Track what was released (Priority: P3)

*Deferred per DC-1.* HR can see that a benefit was released (when, by whom) and is warned before releasing the same benefit twice in a cycle.

**Acceptance Scenarios**:

1. **Given** a prior release, **When** HR revisits the benefit, **Then** the last release (date + person) is shown and a re-release warns first. *(Deferred.)*

### Edge Cases

- **No applicable employees** → the export is empty but valid, with a clear "0 employees" indication rather than an error.
- **Applicable but un-computable** (missing band / null configured amount for their band) → flagged rows, excluded from the total.
- **No columns selected / only the amount** → the row number + allowance value still produce a usable sheet (anchors always present).
- **Employee left mid-cycle** (status not active) → excluded (active-only rule).
- **Loans (salary-based benefit)** → not offered in the picker at all (FR-B01), so its salary amount never reaches a sheet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-B01**: The system MUST let an **HR Admin / Super User** select a single **guaranteed benefit** (from the fixed allowance benefits) and generate a team-wide release sheet; access MUST be enforced **server-side** (non-HR refused). The **salary-based benefit (Loans) MUST NOT appear** in the picker (its amount is the confidential salary; loans aren't released team-wide).
- **FR-B02**: The sheet MUST include **every active employee the benefit applies to** (by employment type), and MUST **exclude** employees the benefit does not apply to and employees who are not active.
- **FR-B03**: Each employee's allowance value MUST be the benefit's **configured amount for their tenure band** (a per-band figure, not confidential). Salary-based benefits are out of scope (FR-B01), so **monthly salary is never computed or shown**.
- **FR-B04**: Applicable employees **missing the data needed to compute an amount** (no tenure band, or a null configured amount for their band) MUST be **flagged as needs-attention** and MUST NOT be shown as a real amount or silently omitted.
- **FR-B05**: The **default sheet** MUST have the columns **# (1-based row order) · Employee name · Tenure (band) · Allowance value (EGP) · Status**, in that order, plus a **total** (summing resolvable amounts) and an **employee count**.
- **FR-B06**: The report generator MUST be able to **choose which columns to include** from the available registry fields (add/remove relative to the default preset). The **row-number column MUST always lead** and the **allowance value MUST always be included**; the downloaded sheet MUST contain exactly the selected columns in the presented order.
- **FR-B12**: Each **employee** MUST have their own **release status for the benefit in a plan year** — **Not released** by default, becoming **Released** (with the release **date** and the **actor**) when HR marks them. HR MUST be able to mark **one employee or a bulk selection** (with **Select all / Select none**). The action MUST be HR/Super-User-only and server-side.
- **FR-B13**: The export MUST include a **Status column** showing **each employee's own** release status for the chosen benefit (e.g. "Released — {date}" or "Not released").
- **FR-B07**: The column picker MUST offer **only non-confidential fields** and MUST **exclude monthly salary** (confidential — not visible to HR) as well as date of birth, marital status, and dependants. Available set: row #, employee name, email, department, title, employment type, tenure band, start date, phone, reporting manager, status, allowance value.
- **FR-B08**: The export MUST be a **downloadable file** (CSV by default, per DC-3), encoded so names/currency render correctly in common spreadsheet tools.
- **FR-B09**: The feature MUST NOT move money, change benefit configuration, or alter the flexible basket / claims — it is **read-only** over the registry and guaranteed-benefit config.
- **FR-B10**: When a benefit is already marked **Released**, the system SHOULD make its status visible before a re-release (so HR doesn't re-run it unintentionally). Un-releasing / re-releasing behaviour (if allowed) MUST be HR/Super-User-only.
- **FR-B11** *(deferred, DC-4)*: The system MAY let HR **save a column selection as a named preset** for reuse. Out of scope for v1 (per-download selection only) unless clarified otherwise.

### Key Entities *(include if feature involves data)*

- **Guaranteed Benefit** (existing): the fixed allowance benefit chosen for release, with amounts by employment type × tenure band. The salary-based benefit (Loans) is excluded from this feature. Read-only here.
- **Employee** (existing `User`): the **non-confidential** registry fields (name, email, department, title, employment type, tenure band, start date, phone, manager, status) that are the population and the selectable columns. Monthly salary is confidential and is **not** exposed here. Read-only here.
- **Benefit Release** (new, persisted): the release status **per employee × benefit × plan year** — status (Not released / Released), release timestamp, and the actor who released it. Drives each row's Status column.
- **Release Sheet** (derived): the computed rows of {row #, selected employee columns, allowance value, status, needs-attention?} + total + count for one benefit and one column selection at export time.
- **Column Selection** (transient in v1): the set + order of columns the report generator chose for this download. *(A saved, named preset is the deferred FR-B11 enhancement.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: HR can produce a complete release sheet for a benefit in **one action** (select benefit → download), with no per-employee data entry.
- **SC-002**: **100%** of the employees on the sheet are active and applicable to the chosen benefit; **0** ineligible employees appear.
- **SC-003**: Every allowance value matches the benefit's configured value for that employee's band (or their monthly salary for salary-driven), verifiable against the config.
- **SC-004**: **No applicable employee is silently missing** — every applicable active employee is either listed with an amount or flagged as needs-attention.
- **SC-005**: The downloaded sheet contains exactly the columns the report generator selected (default preset when untouched), always led by the row number and including the allowance value.
- **SC-006**: The sheet's total equals the sum of the resolvable per-employee amounts (flagged rows excluded), with zero discrepancy.

## Assumptions

- **Default preset** (per the product owner): **# · Employee name · Tenure · Allowance value**; loads first, fully editable before download.
- **Per-download column selection**: choices aren't saved; named presets are a later enhancement (FR-B11).
- **Offered columns**: non-confidential registry fields + the allowance value. **Monthly salary is excluded** (confidential, not visible to HR); DOB / marital status / dependants excluded.
- **Salary-based benefit (Loans) excluded** from bulk-release entirely (its amount is the confidential salary; loans aren't team-wide).
- **Release status is tracked per employee** (DC-1): a persisted record per **employee × benefit × plan year** (status + date + actor), surfaced as the Status column and set via "Mark as released". This **adds a schema change** (a Benefit Release record).
- **Any fixed allowance benefit is selectable** (DC-2) except Loans; **CSV** format (DC-3), consistent with the existing Finance export. When marking people released, HR selects rows with **Select all / Select none**.
- **Applicability by employment type** is read from the existing guaranteed-benefit config (a benefit exists for FT and/or PT).
- **Reuses** the existing admin Benefits area, role gating, and CSV export approach from spec `007`; no new money rules. Adds the Benefit Release record (schema change); saved column presets remain a later enhancement.
- **Amounts are the per-band entitlement figures** from config (not confidential); actual disbursement happens outside the app.

## Follow-ups (2026-08-13)

- **Distinct "Reimbursed (backfilled)" status**: a benefit an employee already
  received via HR's manual back-fill (an already-approved `BenefitClaim` with
  status `REIMBURSED`, recorded outside the app — spec 016) is a **separate**
  mechanism from a `BenefitRelease`. The release view now surfaces those people
  as **"Reimbursed (backfilled) — <date>"** (and counts them in the footer) so a
  paid person is no longer shown as "Not released". Release (payroll marking) and
  reimbursement (already paid) remain distinct records.
- **Truthful needs-attention reason**: when no amount resolves, the Status names
  the actual cause — **no employment type**, **no tenure band**, or **no allowance
  set for their type/band** — instead of always saying "no tenure". (A part-time
  employee with no configured part-time band amount is the common case.)
