# Quickstart: Validating the Medical Policy Year

How to prove this feature works. There is no test runner in this project, so validation follows the pattern used for specs 018, 023 and 028: pure-function checks and database assertions run with `tsx` against a throwaway Postgres, then a browser pass over the surfaces that changed.

## Prerequisites

```bash
npm install
npx prisma generate
```

A local Postgres 16 lives under `/usr/lib/postgresql/16/bin` and runs as the `postgres` user with its socket in `/tmp`. Never point any of this at the production `POSTGRES_URL`.

```bash
# throwaway database
initdb -D "$SCRATCH/pgdata"
pg_ctl -D "$SCRATCH/pgdata" -o '-k /tmp -p 55432 -c listen_addresses=' -l "$SCRATCH/pg.log" start
createdb -h /tmp -p 55432 -U postgres hrerp_test

export POSTGRES_URL="postgresql://postgres@localhost:55432/hrerp_test?host=/tmp"
export DATABASE_URL_UNPOOLED="$POSTGRES_URL"
npx prisma db push --skip-generate
```

## 1. The exact-sum invariant (do this first)

The central claim: **charges across all cycles equal the committed premium, exactly.** Everything else is detail. Assert it over a spread of awkward inputs, not one happy path:

- The live case: 12-month term (1 Jun 2026 – 31 May 2027), 40,000 premium, Jan–Dec cycles → 23,333 (7 mo) + 16,667 (5 mo).
- A premium that does not divide evenly by the month count (e.g. 10,000 over 12 months) — the remainder must land in the final cycle and the sum must still be exact.
- A term contained entirely within one cycle → a single charge for the whole premium.
- A term with **zero** overlap with the current cycle → nothing charged now, everything carried.
- A one-month term, and a 24-month term.
- Premium of 0.

For each: `sum(charges) === premium`, and no charge is negative.

## 2. The month-counting trap

Guard the bug that fixing this feature could introduce (research D4):

- `wholeMonthsBetween('2026-06-01', '2027-05-31')` → **12**.
- `wholeMonthsBetween('2026-06-01', '2027-06-30')` → **13**, not 12 — the misconfiguration guard.
- `poolCycleFraction` for a 13-month window → **1**, never 13/12. A fraction above 1 means every employee has been handed more than their ceiling.
- `remainingWholeMonths` still returns 12 for a 13-month range, since the pool logic depends on it.

## 3. Migration `047`

Apply it the way the operator will — **from the file**, against a database that already holds a committed medical premium:

```bash
psql -h /tmp -p 55432 -U postgres -d hrerp_test -f prisma/sql/047_medical_policy_year.sql
psql -h /tmp -p 55432 -U postgres -d hrerp_test -f prisma/sql/047_medical_policy_year.sql   # idempotent
```

Then assert:
- Existing commitments survive with their premium **unchanged** — no employee's committed figure moves.
- Each has exactly one charge, equal to its premium, against its original plan year.
- A policy year was created from the open plan year's dates.
- Re-running changes nothing.

## 4. Cycle open applies carried charges

- Commit a premium spanning two cycles; confirm cycle A's charge is applied and cycle B's is not.
- Open cycle B; confirm B's charge becomes applied **with no HR action beyond opening the cycle** (FR-005).
- Repeat with a `LEFT` employee: the charge must be marked outstanding and **not** applied (research D7).

## 5. The pool reflects the cycle charge, and the model settles

The transition year, end to end:

1. Seed the Jan–Dec 2026 cycle and the 1 Jun 2026 – 31 May 2027 policy term.
2. Commit a 40,000 premium.
3. Confirm the 2026 pool falls by **23,333**, not 40,000 — the employee keeps 21,667 of flexible budget where charging in full would leave them 5,000.

Then prove it **settles**, which is what shows the model is right rather than merely different:

4. Open the 2027 cycle and commit the next policy term.
5. Confirm the 2027 pool absorbs 16,667 (carried) + the new term's 7-month share — **exactly 12 months of premium**, the same as a naive full-premium charge would give.

## 6. No policy year configured

With no `MedicalPolicyYear` row, commit medical and confirm the result is **identical** to the current production behaviour: one charge, the whole premium, against the active plan year (FR-002, SC-005).

## 7. Browser pass

`npm run dev` and check, as an employee and as HR:

- The employee's pool card shows the **cycle** figure, not the full premium.
- HR sees the full committed premium **and** the per-cycle breakdown (FR-012).
- Nothing on either page reads as a wrong number without explanation — the failure mode that made `BenefitClaim.fullCost` necessary in spec 018.

Reminder: the **UI mockup gate is still open**. Do not edit components before the design is approved; use this section to validate once it is.

## Before handing over

```bash
npx tsc --noEmit
npm run build
```

Both must be clean, and `prisma/sql/047_*.sql` must be committed alongside any `schema.prisma` change.
