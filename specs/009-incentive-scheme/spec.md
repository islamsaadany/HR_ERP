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
  commission), so each person's number can be shared alongside the amount.
- **FR-007**: Per-hour performance metrics (GP/hour, break-even, pricing floor)
  are **out of scope** until an hours column is provided; cost recovery uses
  contribution-weighted GP.

## Key entities
- **IncentiveCycle**: label, status, firm revenue/deliveryCost/totalExpenses.
- **IncentivePerson**: name, role, netMonthlySalary, utilization (`eligibleToLead`
  retained inert; no longer in the template or report — see clarifications).
- **IncentiveAssignment**: client, type, lead, bd, leadSource, revenue, directCost,
  vendorCost, markupPct, status.
- **IncentiveContribution**: client, person, share.

## Verification
The engine is proven against **Appendix A** (H1 2026) — `scripts/verify-incentive.ts`
(27/27: envelopes, deductions, lead fees, the Raya Holding floor, the Raya Trade
gate, the Profit Share table). The full parse→compute path is proven on the real
sample sheets — `scripts/verify-incentive-cycle.ts` (16/16, incl. El Abd blocked
at 93%). Migrations 013 applied and verified on a throwaway Postgres.

## Notes / later
- Add an hours column to unlock Appendix B (per-hour metrics).
- Loss-deferral and cash-release are surfaced as status; no automated ledger yet.
- An editable rule-config screen could follow if the rates ever change.
