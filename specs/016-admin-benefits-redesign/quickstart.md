# Quickstart / Validation: Admin Benefits Redesign

## Gates
```bash
npx tsc --noEmit
npm run build
```

## Structure (US1–US4)
- `/admin/benefits` shows **three tabs** in order Submissions & Claims · Benefits Catalogue · Amounts;
  default is Submissions & Claims; no Configuration/Claim-requirements tab.
- Catalogue tab: one table with Name · Category · Order · Claim requirement · Coverage % per benefit;
  hide/show + add work; medical coverage locked at 100%.
- Amounts tab: pool ceilings + guaranteed amounts + medical rate card, each editable.
- Every config table starts **read-only**; Edit reveals inputs for that table only; Save returns to
  read-only with the new values; switching tabs discards unsaved edits.

## Manual release (US5) — throwaway Postgres proof
Seed a plan year, an employee, and an allocation (a guaranteed benefit or a submitted basket line), then:
- Record a manual release: amount + a **past** approval date → a `BenefitClaim` with `status = RELEASED`,
  `decidedAt` = the entered date, `reviewedById` = actor; it is **not** in the pending queue; the
  benefit's reimbursed increases and left-to-claim decreases.
- **Cap**: recording more than the remaining allocation is rejected/clamped (total RELEASED+PENDING ≤ allocation).
- **Future date**: rejected.
- **No allocation target**: rejected with a clear message.
- **Access**: a non-admin request is denied.

## Regression (US-preservation / SC-005)
- Plan-year popup, submissions view, pending claims Release/Reject, CSV export, reopen/reset all still work.
- No employee-facing screen changes; money-rule outcomes unchanged.
