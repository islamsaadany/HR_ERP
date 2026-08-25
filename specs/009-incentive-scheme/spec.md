# Spec 009 — Incentive Scheme (Partner Compensation)

## Summary
A **super-user-only, hidden** module that computes partner compensation from the
"Forefront Consulting — Team Benefits System v1.5" rules: **Business Partner Fee**,
**Commission**, **Profit Share** (proposed), the **70% margin** and **utilisation**
gates, loss-deferral, and reporting. It is distinct from the employee **Benefits**
module (the flexible-benefits selector). Sensitive compensation data — access is
restricted to `SUPER_USER`.

## Why
The firm compensates beyond salary via a rules-heavy scheme. Doing it by hand is
error-prone; this reproduces the document's figures exactly and server-side.

## Clarifications (settled)
- **Shape:** persisted **per-cycle** (a half-year, e.g. `H1-2026`).
- **Scope:** the whole document — Parts 1–3 + governance + reports. **Profit Share
  is computed but marked "proposed, not adopted" and excluded from released totals.**
- **Rules are hardcoded** in one server module (`src/lib/incentive/rules.ts`), not
  editable in-app; they are final. **Banker's rounding** matches the appendices.
- **Inputs are uploaded as CSV** per cycle (people / assignments / contributions +
  a firm-figures form), with **downloadable templates**.
- **Utilisation gate → manual `eligible_to_lead`** per person (no timesheet data).
  **Retired from the operator flow (2026-08-12):** the column is gone from the People
  template and the report — whoever is entered as a lead in the Assignments sheet is
  paid their lead fee, so the flag was redundant with the assignment itself. The DB
  field remains, inert at its default (`true`), leaving the verified engine untouched.
- **`utilization` retired from the operator flow (2026-08-13):** it fed no calculation
  (a leftover from the original utilisation gate). Removed from the People CSV template
  and the read-back table; the DB column and parser remain, inert (same treatment as
  `eligible_to_lead`).
- **Contributions flag-and-block:** a payable assignment whose contributions don't
  total ~100% (±1pp) is flagged and excluded until corrected — not normalised.
- **Commission rate:** `bd == lead_source` ⇒ self-generated **5%**, else referred **3%**.
- **Hidden:** not in anyone's navigation except super users; the route rejects others.

## Functional requirements
- **FR-001**: Only `SUPER_USER` may reach `/incentive`, its cycle pages, and the
  template download; the nav entry appears for super users only.
- **FR-002**: A super user creates cycles and, per cycle, uploads the People,
  Assignments, and Contributions CSVs (re-upload replaces the sheet) and enters
  the firm P&L figures. **Templates download pre-filled from data we already hold
  (2026-08-12):** People is seeded from the registry (Consulting Department + Data
  Management Unit — name, role, salary, start date); Assignments and Contributions
  carry the client list (and lead/bd) from the most recent prior cycle. Money and
  date columns are left blank. With no cycle context the static sample template is served.
- **FR-003**: The engine computes, server-side and to 2 dp: envelope (3% of GP),
  the 70% gate, contributor tiers/deductions (Lead keeps ≥40%), the contributor
  floor (5% of month) and cap (½ month), firm-retained residual, commission
  (3%/5% on net revenue; projects vs retainers), and Profit Share (proposed).
- **FR-004**: In-progress projects and un-closed work trigger nothing; active
  retainers and closed projects are payable. A lead marked `eligible_to_lead=No`
  does not receive a Lead fee this cycle.
- **FR-005**: Contributions that don't total ~100% for a payable assignment are
  flagged and that assignment is excluded from payouts until corrected.
- **FR-006**: Reports render: Business Partner Fee, contributor detail, by-person,
  commission, firm P&L, Profit Share (proposed), cost recovery, and a watch list.
- **FR-006a** (2026-08-12): The by-person section offers **Download calculation
  (.xlsx)** — a workbook with a Summary sheet plus one sheet per consultant showing
  their full derivation (assignments led, contributions with tier/allocation, and
  commission), so each person's number can be shared alongside the amount. The .xlsx
  carries **term tips** on the column headers and **zero-reason cell notes** (a 0 below
  the 70% gate vs a 0 below the 5% floor are explained distinctly).
- **FR-006b** (2026-08-12): The on-screen report is **restructured**: collapsible
  sections with Expand/Collapse-all; a leading **Review & validation** section (the
  three uploaded sheets read back) that **auto-opens on a data issue** and flags the
  offending client — the **Contributions** matrix gains a **Total-%** column that turns
  red (with ⚠ on the client name) when a client isn't 100%. The **Firm P&L** is an
  `Item | Value | %` table (whole-EGP values, hover note showing each %'s calculation,
  "Delivery cost" relabelled **Direct cost**, and a **Scheme cost** row that expands in
  place to BP fees / contributor / commission, with scheme-%-of-GP on that row). 0
  values in the fee tables carry a hover reason. The **watch list** is grouped
  **General/clients first, then per person**. Tables are **full-height** (horizontal-only
  scroll); tooltips render as a fixed floating layer so the scroll box never clips them.
  The manual `eligible_to_lead` flag is gone from the People template/report (see
  clarifications).
- **FR-006c** (2026-08-13): Report polish. The **Review & validation → Assignments**
  read-back shows every uploaded field (adds Lead source, Vendor cost, Markup %, Start
  date, Closure date). **Commission by person** sits directly above **Compensation by
  person** (the by-person table, renamed from "By person"), which gains a **Grand total**
  (= Total + Commission). The **"Ended"** status pill is blue (was grey). Section ⓘ tips
  move onto the column they explain (**Envelope**, **Tier**, **Multiple**). The BPF
  **Contributor** figure hovers to a per-person breakdown. Rows are **zebra-shaded**
  (white base, cool grey alt; the sticky first column is repainted so the tint covers it)
  in **Business Partner Fee**, **Contributor detail** (per client), **Compensation by
  person**, and **Cost recovery** (every other row). **Firm P&L** is squeezed and its %
  hover becomes a visible **Notes** column stating each % as a plain-language equation
  (e.g. *Direct cost ÷ Revenue*). **Cost recovery**'s Multiple is colour-banded (>3×
  best, 2–3× good, 1–2× poor, <1× critical). **Commission by person** is squeezed with a
  **click-a-name** expansion to the per-deal breakdown (client, self/referred, rate,
  net-revenue base, amount). `utilization` is removed from the People template/read-back
  (see clarifications). **Data-table headers are navy blue with light text** (shared
  `ff-data-table` style, app-wide), and the **sticky first column is repainted** so the
  header corner, zebra rows, and total/emphasis rows all fill their first column instead
  of showing white.
- **FR-006d** (2026-08-25): The **Review & validation** tables are **editable in
  place**, so a figure spotted as wrong on screen no longer means rebuilding a CSV
  and re-uploading. **Edit tables** turns all three sheets into a form — every cell
  editable, rows addable and removable, contribution columns addable (from the
  People table) and removable — and a single **Recalculate** saves the three sheets
  and re-renders the page, so every section below regenerates from the stored rows.
  Decisions: **Recalculate IS the save** (no second button, so the report can never
  show figures the database doesn't hold); a gold **Unsaved edits** chip is on
  screen for exactly as long as the edits are only in the browser, and the button is
  disabled until something changes; **Discard changes** confirms, then restores
  every cell from the database. Validation matches the importer (`validateReview`
  reuses its `parseSheetNumber`), reports **every** fault at once in a `role="alert"`
  banner that is scrolled to and focused, and writes nothing when any check fails.
  Two deliberate departures from the importer: **status is chosen from a dropdown,
  not derived** from the closure-date column (the operator is looking straight at
  it, and setting a closure date must not silently re-decide it); and a client whose
  shares don't total 100% **still saves** — that is a payout rule, already enforced
  by flag-and-block, not a save rule, so half-finished shares are storable. The
  contributions **Total** column re-adds live while typing, so a client is seen to
  reach 100% before anything is pressed. Renaming a person in People **follows them**
  into Lead / BD / Lead source and their contributions column (applied on blur, not
  per keystroke). The write is **replace-then-recreate** like an upload — the one
  statement order that can never trip the `(cycle, name)` / `(cycle, client)` unique
  indexes when two people trade names — with `eligibleToLead` and `utilization`
  carried across by row id so the two retired columns aren't silently dropped.
  Uploading is unchanged and still replaces a whole sheet.
- **FR-007**: Per-hour performance metrics (GP/hour, break-even, pricing floor)
  are **out of scope** until an hours column is provided; cost recovery uses
  contribution-weighted GP.

## Key entities
- **IncentiveCycle**: label, status, firm revenue/deliveryCost/totalExpenses.
- **IncentivePerson**: name, role, netMonthlySalary (`eligibleToLead` and `utilization`
  retained inert in the DB; neither is in the template or report — see clarifications).
- **IncentiveAssignment**: client, type, lead, bd, leadSource, revenue, directCost,
  vendorCost, markupPct, status.
- **IncentiveContribution**: client, person, share.

## Verification
The engine is proven against **Appendix A** (H1 2026) — `scripts/verify-incentive.ts`
(27/27: envelopes, deductions, lead fees, the Raya Holding floor, the Raya Trade
gate, the Profit Share table). The full parse→compute path is proven on the real
sample sheets — `scripts/verify-incentive-cycle.ts` (16/16, incl. El Abd blocked
at 93%). Migrations 013 applied and verified on a throwaway Postgres.

The in-place editing of the review tables (FR-006d) is proven on a throwaway
Postgres — `scripts/verify-incentive-review-edit.mts` (44/44): the round trip
(stored rows → cells → stored rows) returns identical shares and salaries; the
live Total flags 93% and clears at 100% inside the ±1pp tolerance; a bad payload
is refused with all seven faults named at once; a 93% client still saves; the
write stores a typed "95,000", carries `eligibleToLead`/`utilization` across a
rename, gives a new row the defaults, deletes removed rows with their
contributions, and survives two people trading names; and the real
`computeCycle` over the written rows unblocks the corrected client and pays its
lead. The screen itself was driven in a real browser (sign-in → edit → save →
rejected save): the live total, the dirty chip, the disabled-until-dirty button,
the rebuilt report, the announced error banner and zero page-level horizontal
overflow were all confirmed there — which is also where the missing
`startTransition` around the save was caught, without which the button never
reported "Recalculating…" nor blocked a second click.

## Notes / later
- Add an hours column to unlock Appendix B (per-hour metrics).
- Loss-deferral and cash-release are surfaced as status; no automated ledger yet.
- An editable rule-config screen could follow if the rates ever change.
