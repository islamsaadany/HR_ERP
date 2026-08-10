# Quickstart — Validating the Claim Reimbursement Workflow

Feature: spec 020. This is a **validation/run guide**, not implementation. Use it to prove the feature works end-to-end after `/speckit-implement`.

## Prerequisites

- App builds: `npx tsc --noEmit` and `npm run build` both clean.
- DB migrated via the numbered `prisma/sql/0NN_claim_reimbursement_workflow.sql` (pasted into Neon, or applied to a throwaway local Postgres for verification).
- Four roles available for testing: an Employee, an HR Admin, a **Finance** user, and a Super User.
- (Optional) Email on: set `RESEND_API_KEY` + `EMAIL_FROM` in env and, in the app, set `emailEnabled=true` with an HR inbox and Finance inbox. **Without these, the flow still works and no email is sent** — verify that path too.

## Scenario A — Happy path (Submitted → Approved → Reimbursed)

1. **Employee** submits a flexible claim while the plan year is open.
   - Expect: claim shows **Submitted**; it counts against the pool/50% caps; HR inbox receives **T1** (if email on).
2. **HR** opens the submissions tab, **Approves** it.
   - Expect: claim becomes **Approved — awaiting payment**; Finance inbox receives **T2** with payee + covered amount.
3. **Finance** opens the payments queue, **Confirms payment** (enter amount + transfer date).
   - Expect: claim becomes **Reimbursed**; `amountTransferred`/`transferDate`/`paidBy` recorded; employee receives **T4**.
4. **Employee** reloads benefits: the claim chip reads **Reimbursed**.

## Scenario B — Rejection

1. Employee submits a claim.
2. HR **Rejects** with a reason.
   - Expect: claim becomes **Rejected**; it no longer counts toward caps (allowance freed); employee receives **T3** including the reason.
3. Reject **without** a reason → employee still receives T3 (no reason line).

## Scenario C — Access control (must fail)

- A plain **HR Admin** hits the Finance confirm-payment action → **denied**.
- A plain **Finance** user hits Approve/Reject → **denied**.
- A plain **Employee** opens the payments queue → **denied**.
- A **Super User** can do all of the above.

## Scenario D — Resilience / env-gating

- With `RESEND_API_KEY` unset: run Scenario A fully → all state changes succeed, **no email attempted**, no user-visible error.
- With email on but the **Finance inbox blank**: approve a claim → claim becomes Approved, that one email is skipped with a soft admin warning, no crash.
- Simulate a Resend failure (bad key): confirm payment → claim still becomes **Reimbursed** (fire-and-forget); error logged only.

## Scenario E — Money rules unchanged

- Submit claims until the 50%-per-benefit cap or pool ceiling is hit → the next claim is rejected by the server rules exactly as before, counting **Submitted + Approved + Reimbursed** toward the totals; a **Rejected** claim frees its allowance.

## Scenario F — Scope guard

- A **medical commitment** and the **guaranteed bulk Release** sheet behave exactly as today and send **no** emails.

## Expected artifacts to update in the same change

- `CLAUDE.md` (remove/qualify "No emails, ever (v1)"), `PROJECT_DETAILS.md` (claims workflow + roles + settings), `IMPLEMENTATION_PLAN.md` (decision log: email reversal), `IMPLEMENTATION_PROGRESS.md` (feature status), `.specify/memory/constitution.md` (Technology constraint amendment, with version bump).
