# Quickstart & Validation: Benefits Claim-Based Living Allowance

How to validate the feature end-to-end. Implementation details live in `tasks.md` / the code;
this is a run/verify guide.

## Prerequisites

- `npm ci` done; `npx tsc --noEmit` and `npm run build` pass.
- Migration `prisma/sql/025_claim_based_allowance.sql` applied to a **throwaway local Postgres**
  (per CLAUDE.md §3a) — never to Neon from a session. Local PG 16 lives under
  `/usr/lib/postgresql/*/bin` (`initdb`/`pg_ctl`, run as `postgres`, socket in `/tmp`).
- Seed: at least one OPEN `PlanYear`, a `PoolCeiling` for the test employee's type × tenure,
  a `MedicalRateCard`, and a few `active` catalog items with coverage rates (e.g. 100 / 80 / 50).

## Migration sanity (local PG)

1. Apply `025_*.sql`. Confirm:
   - `SelectionLine` and `BenefitSelection` tables are gone.
   - `MedicalCommitment` exists with a unique `(userId, planYearId)`.
   - `BenefitClaim` is intact.
2. `SELECT` from `MedicalCommitment` → empty (clean start).

## Scenario A — Claim a flexible benefit as you spend (US1)

1. As an employee, open `/benefits`. There is **no basket to submit**.
2. On an 80%-covered benefit (pool = EGP 50,000), file a claim with full cost **10,000** + proof.
3. **Expect**: covered = **8,000** recorded (pending); pool remaining shows **42,000**; the "left on this benefit" hint = **17,000** (25,000 cap − 8,000).
4. File a second claim on the same benefit for full cost **25,000** (covered 20,000).
5. **Expect**: rejected — "exceeds the 50% cap — EGP 17,000 left on this benefit." Nothing stored.

## Scenario B — Pool ceiling (US1 / FR-006)

1. With claims + medical already near the ceiling, file a claim that would cross it.
2. **Expect**: rejected — "Your pool is fully used — contact HR." Nothing stored.

## Scenario C — Commit medical once (US2)

1. Configure self + spouse + 2 children; commit.
2. **Expect**: premium computed from the rate card, drawn from the pool (pool remaining drops by the premium); medical shown as **committed**.
3. Try to deselect / reduce dependants.
4. **Expect**: blocked; directed to contact HR.
5. (Large family) premium > ceiling → premium capped at ceiling + "contact HR" message.

## Scenario D — No count limit (US3)

1. File claims against **six** different benefits within budget.
2. **Expect**: all accepted (subject only to 50% + ceiling). No count-based rejection.

## Scenario E — HR override (US4)

1. As HR (admin benefits), edit or remove the employee's committed medical.
2. **Expect**: change applies; employee's pool usage updates; employee still can't self-edit.

## Scenario F — Orientation copy (US5)

1. As a first-time employee, open `/benefits`.
2. **Expect**: tour describes claim-as-you-go, full-price entry + company %, claim-again up to 50%,
   and "medical is the one thing you commit to"; final button reads **"Got it"**; **no** "pick up to N"
   or "submit your basket" text anywhere.

## Scenario G — Admin 0% guard (US6)

1. As admin, try to save a catalog item at **0%** coverage.
2. **Expect**: rejected — coverage must be 1–100%.

## Gate before hand-off

- `npx tsc --noEmit` ✅  · `npm run build` ✅
- Scenarios A–G pass on local PG.
- UI files edited → snapshot in `ui-versions/` + user visual sign-off (constitution II).
- Steering docs updated in the same commit (specs 007/012/017, PROJECT_DETAILS, IMPLEMENTATION_PROGRESS,
  constitution count-limit wording).
- `prisma/sql/025_*.sql` committed with the schema change; user told exactly which file to paste into Neon.
