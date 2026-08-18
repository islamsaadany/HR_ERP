# Feature Specification: Benefits Reporting

**Feature Branch**: `claude/user-data-edit-attributes-eom3zv`

**Created**: 2026-08-18

**Status**: Built (2026-08-18 — mockup signed off, implemented, verified 46/46 against a production build incl. SC-001)

**Input**: User description: "A reporting page for HR in benefits management to see the status per person, the benefits basket value and what was released, etc. — and if they click on the person they get a full detailed report popup with more data."

## Context

HR runs the benefits cycle but has no single view of it. The claims queue shows work to do; the release sheet shows one benefit at a time; the employee's own page shows one person at a time. Nobody can answer "where does the whole company stand this cycle — who has used what, who has money left, who has claims waiting?" without stitching screens together.

This feature is a **read-only reporting surface** over the existing benefits engine. It computes every figure through the SAME primitives that enforce claims — derived tenure band, prorated pool ceiling, the medical **cycle charge** (what this cycle's pool absorbs, not the full premium — spec 027), covered claim totals including pending (the engine reserves them), and the per-cycle 50%-cap setting — so the report can never disagree with what an employee's Benefits page shows or what the server would allow. Guaranteed benefits are shown as their own column and never counted into the pool (they have their own allocations).

Decisions locked at alignment (2026-08-18): pool math **identical to the claim engine** (pending claims count as used, with their own visible column); a **cycle picker defaulting to the open cycle**; access for **HR Admin, Finance, and Super User**; per-person detail in a **popup modal** (no separate page); a report-wide **formatted Excel download** in the house workbook style.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - HR scans the cycle at a glance (Priority: P1)

An HR Admin opens Admin → Benefits → Reporting. Summary tiles show the company-wide totals for the selected cycle; below them, one row per eligible employee: pool ceiling (marked when prorated), medical charged to this cycle, flexible claims used, pending amount, remaining, guaranteed paid, utilization, and a status chip. They sort by remaining, filter by department or status, search a name, and download the whole table as a formatted Excel workbook.

**Why this priority**: The overview IS the feature — without the table there is nothing to click into.

**Independent Test**: Seed two employees with different usage; confirm the table rows match each employee's own Benefits page figures exactly, and the Excel matches the table.

**Acceptance Scenarios**:

1. **Given** an open cycle with configured pools, **When** HR opens Reporting, **Then** every ACTIVE employee with a derivable pool (employment type + known ceiling) appears with ceiling, medical cycle charge, flex used, pending, remaining, guaranteed paid, and utilization — each figure equal to what the employee's own page derives.
2. **Given** a mid-cycle joiner, **Then** their ceiling shows the prorated figure with a proration marker.
3. **Given** an employee with a submitted (undecided) claim, **Then** the claim's covered amount counts in "used/remaining" (engine behaviour) AND appears in the Pending column.
4. **Given** the cycle picker, **When** HR selects a past cycle, **Then** every figure recomputes for that cycle (its own cap setting, its own charges).
5. **Given** the summary tiles, **Then** they equal the column sums of the visible table.
6. **Given** Download Excel, **Then** the workbook carries the same rows and figures, styled in the house conventions (navy header, frozen panes, filters, dd/mm/yyyy dates).
7. **Given** a non-HR/Finance employee, **When** they request the page or export, **Then** access is refused server-side.

---

### User Story 2 - HR opens one person's full report (Priority: P1)

HR clicks a row and a popup opens with the person's complete cycle story: how the ceiling was derived (band, employment type, proration), the medical block (policy term, covered people, full premium vs this cycle's charge, carried-forward), each guaranteed release/claim with dates, and a claim-by-claim table (date, benefit, receipt vs covered, status, decision note, proof link).

**Why this priority**: The row answers "where do they stand"; the popup answers "why".

**Independent Test**: Open the popup for a seeded employee and confirm every line reconciles to the row's totals.

**Acceptance Scenarios**:

1. **Given** a person with a medical commitment, **Then** the popup names the covered people, the full premium, this cycle's charge, and any carried-forward amount.
2. **Given** claims in mixed statuses, **Then** each shows its receipt value, covered amount, status, HR decision note, and a working proof link (authorized route).
3. **Given** a clamped claim, **Then** the popup shows receipt vs covered so the clamp is visible.
4. **Given** the popup totals, **Then** they equal the row's figures exactly.

---

### Edge Cases

- Employee with no employment type or no configured ceiling: listed with "—" figures and a "No pool" status rather than dropped silently (HR should see who is unconfigured).
- Employees who left mid-cycle: excluded from the default view, includable via a filter, never counted in tiles by default.
- A cycle with the 50% cap disabled (spec 031) reports under that cycle's own setting.
- Rejected claims never count anywhere except the popup's claim history.
- No open cycle: the picker lists past cycles; with none at all, an empty state explains there is nothing to report.

## Requirements *(mandatory)*

- **FR-001**: The page MUST be gated server-side to HR Admin, Finance, and Super User — page and Excel export alike.
- **FR-002**: Every per-person figure MUST be computed with the same engine primitives the claim path uses (derived tenure band, prorated ceiling, medical cycle charge, covered totals incl. pending, per-cycle cap flag). No figure may be stored/denormalised for the report.
- **FR-003**: The table MUST offer: sort on money columns and name, filter by department and status, name search, and a cycle picker (default: open cycle, else most recent).
- **FR-004**: Summary tiles MUST equal the visible table's column sums.
- **FR-005**: The status chip per person MUST be derived: No pool (unconfigurable), No activity, Active, Pending review (n), Pool exhausted.
- **FR-006**: The row click MUST open a popup with ceiling derivation, medical detail, guaranteed items, and claim-by-claim history with proof links; popup totals MUST equal the row.
- **FR-007**: Download Excel MUST produce a formatted workbook (house style) of the current table.
- **FR-008**: The page is read-only — no action on it mutates benefits data.

## Success Criteria *(mandatory)*

- **SC-001**: For any employee, the report row's ceiling/used/remaining equal their own Benefits page to the pound.
- **SC-002**: HR can answer "who still has money left this cycle" in one sort, and "why does this person's remaining look wrong" in one click.
- **SC-003**: The Excel opens in Excel correctly formatted with all rows of the current filter.

## Dependencies

- The benefits rules engine (`src/lib/benefits/*`): `prorate`, `flexCap`, `deriveTenureBand`, `medicalCycleCharge`, eligibility/proration, config ceilings.
- The house Excel conventions (exceljs, as used by incentive + campaign exports).

## Out of Scope

- Any mutation (approve/release/reset live elsewhere).
- Cross-cycle aggregate analytics (one cycle at a time).
- Email/scheduled report delivery.
