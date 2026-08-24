# Quickstart: Validating Petty Cash & Payback

How to prove this feature actually works, using the tools available in a session. The figures below
are taken from the real workbook so the output can be compared against what Finance already knows.

## Prerequisites

```bash
npm install
npx tsc --noEmit      # must be clean
npm run build         # must pass
```

A local Postgres is available for anything touching the database
(`initdb`/`pg_ctl` under `/usr/lib/postgresql/*/bin`, run as `postgres`, socket in `/tmp`).
**Never** point any of this at the production Neon database.

## 1. The arithmetic, without a database

`src/lib/finance/pettycash.ts` is pure, so the reconciliation can be checked directly. These three
cases are the ones the workbook gets wrong or carries by hand:

| Case | Input | Expected |
|---|---|---|
| `JUL-AUG` | opening 0, top-up 9,000.00, float spend 13,617.16 | closing **−4,617.16**, described as *"Forefront owes {custodian} 4,617.16"* |
| `March` | opening 0, top-up 47,000.00, float spend 50,444.54 | closing **−3,444.54**, **same direction** as above — this is the sign inversion the workbook shows between these two tabs (SC-003) |
| `Oct-Nov` carry | budget 35,000.00, total expenses 35,229.23 | budget remaining **−229.23**, shown as an overspend and carried into the next period as its opening balance — never floored to zero (FR-009), and never a hand-typed line called *"December Overbudget"* |

Also assert that a `COMPANY_TRANSFER` line raises `totalExpenses` and consumes budget while leaving
`closingBalance` untouched (FR-014) — the `April` tab's Kamelizer bookings are exactly this.

```bash
createdb hrerp_test
TEST_DATABASE_URL="postgresql://…/hrerp_test" npx prisma db push
TEST_DATABASE_URL="postgresql://…/hrerp_test" npm test
```

`npm test` is a tool, not a gate (constitution V) — it is worth running here because this is money
arithmetic, which is the one case the house rules say to reach for it.

## 2. The migration, against a throwaway database

Per `CLAUDE.md`, a schema change is not "done" because the SQL looks right:

```bash
# as the postgres user, against a disposable local DB — never Neon
psql -f prisma/sql/068_petty_cash_payback.sql hrerp_test
psql -f prisma/sql/068_petty_cash_payback.sql hrerp_test   # again: must be a clean no-op
```

Then query what the pages actually read:

```sql
SELECT name, "sortOrder" FROM "ExpenseSection" ORDER BY "sortOrder";   -- 3 seeded rows
SELECT count(*) FROM "ExpenseCategory";                                -- 15 seeded rows
-- the partial index must refuse a second open period:
INSERT INTO "PettyCashPeriod" (…, "status") VALUES (…, 'OPEN');        -- expect a unique violation
-- the evidence check constraint must refuse two parents, and zero parents:
INSERT INTO "ExpenseEvidence" ("pettyCashLineId","paybackRequestId", …) VALUES ('a','b', …);
```

## 3. End-to-end, in the running app

```bash
npm run dev
```

**Petty cash**
1. As Finance: create an account with a custodian, open a period with a 9,000.00 budget, record a
   9,000.00 top-up. Balance reads 9,000.00.
2. As the custodian: add a `FLOAT` line for 1,530.00 with a photo attached. Balance reads 7,470.00.
   Add a `COMPANY_TRANSFER` line for 28,028.00 — expenses rise, balance does not move.
3. Add a line with no receipt. It shows the *missing receipt* flag.
4. As Finance: close the period. It refuses, naming the line with no receipt; tick the
   acknowledgement and it closes, recording who acknowledged what.
5. Open the next period: its opening balance equals the previous closing balance exactly.
6. Try to edit a line in the closed period — refused with a sentence, not an error page.

**Payback**
7. As an ordinary employee: submit a request with no file — refused. Attach a receipt — accepted,
   and it appears in Finance's queue.
8. As Finance: reject one with a reason (requester sees the reason and is emailed), approve another,
   then record payment with a same-day transfer date (accepted) and separately a tomorrow date
   (refused).
9. As that employee: confirm they see only their own requests.

**Access**
10. Copy an evidence URL (`/api/expense-evidence/<id>`), sign in as an unrelated employee, open it:
    must return **404**, not 403 and not the file.
11. As an ordinary employee, open `/petty-cash/<accountId>` for an account you don't custodian:
    redirected to `/dashboard`.
12. Turn the master email toggle off and repeat steps 7–8: every state change still happens, no
    email is attempted, no error surfaces.

## 4. Before handing over

- `npx tsc --noEmit` and `npm run build` clean.
- Mockups for all five screens approved before any component was written (constitution II), and a
  `ui-versions/` snapshot saved for every existing file that was edited.
- `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_PLAN.md` and `CLAUDE.md`
  updated in the same commits; the constitution amendment for the third email workflow recorded.
- After deploy: the build log's `[apply-sql]` lines confirm `067` applied, reported in one line.
