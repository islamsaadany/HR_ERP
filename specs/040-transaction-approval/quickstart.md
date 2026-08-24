# Quickstart: Validating Bank Confirmations & Salary Runs

## Prerequisites

```bash
npm install && npx tsc --noEmit && npm run build
```

A disposable local Postgres is available (`initdb`/`pg_ctl` under `/usr/lib/postgresql/*/bin`, run
as `postgres`, socket in `/tmp`). **Never point any of this at the production database.**

## 1. The rules, without a database

`src/lib/finance/batches.ts` is pure. `tests/batch-rules.test.ts` asserts:

| Case | Expected |
|---|---|
| Finance submits, Finance tries to mark complete | refused — *"You created these in the bank, so somebody else has to confirm them"* |
| Finance submits, an appointed confirmer marks complete | allowed |
| Someone holding **both** Finance and the appointment, on their own submission | still refused |
| A Super User submits and marks their own complete | allowed — the CEO's single exception |
| Anything already `COMPLETE`, `RETURNED` or `WITHDRAWN` | refused, whoever asks |
| `batchTotal` over three amounts with cents | exact to the piastre |
| `describeBatch` output | contains a count and a total, and structurally cannot contain a name |

## 2. The migration, against a throwaway database

```bash
psql -f prisma/sql/068_payment_batches.sql hrerp_test
psql -f prisma/sql/068_payment_batches.sql hrerp_test   # again: must be a clean no-op
```

Then prove the things Prisma cannot express:

```sql
-- the new status must sit where the schema declares it
SELECT string_agg(enumlabel, ' → ' ORDER BY enumsortorder) FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'PaybackStatus';
-- expect: SUBMITTED → APPROVED → PAYMENT_SUBMITTED → REJECTED → PAID

-- the reserved columns from 039 must be gone
SELECT count(*) FROM information_schema.columns WHERE column_name = 'paymentRunId';  -- 0

-- one ordinary salary run per month; a flagged extra run is allowed
INSERT INTO "PaymentBatch" (…, 'SALARY', '2026-08-01', false);   -- ok
INSERT INTO "PaymentBatch" (…, 'SALARY', '2026-08-01', false);   -- expect a unique violation
INSERT INTO "PaymentBatch" (…, 'SALARY', '2026-08-01', true);    -- ok

-- an item has exactly one parent, and a payable waits only once
INSERT INTO "PaymentBatchItem" (…, 'a', 'b');    -- refused: two parents
INSERT INTO "PaymentBatchItem" (…, NULL, NULL);  -- refused: none
```

## 3. End to end, in the running app

**Submitting**
1. As Finance, approve two payback requests, then tick both plus a float top-up and submit them with
   today's value date. The screen reads *3 transactions* with the right total; each payback now shows
   **At the bank**.
2. Try to submit one of those payables again — refused.
3. Try to edit one of the underlying requests — refused while it is awaiting confirmation.

**Confirming**
4. As the appointed confirmer, open the link: each transaction shows payee, purpose, amount and
   receipt. Press **Transaction complete**. Each payback becomes **Paid** and each requester is
   emailed.
5. Check the requester was told **only now** — nothing should have reached them at submission.
6. Return a second submission to Finance with a note: its payables go back to awaiting payment and
   **nobody** is told they were paid.
7. As the Finance user who submitted, try to mark it complete — refused with a sentence.

**Salary**
8. Submit a salary run for a month: total, headcount, reference. Confirm the CEO is emailed and that
   the email contains **no names and no per-person amount**.
9. Submit a second ordinary run for the same month — refused; tick "extra run" with a reason —
   accepted.
10. Sign in as an HR Admin and open the salary screen — denied.

**Appointments**
11. With nobody appointed, submit: the record is created, and Finance's screen says plainly that
    nobody can confirm it yet.
12. As a Super User, appoint yourself, then confirm — the recovery path works in one click.
13. As an appointed confirmer who is not a Super User, try to appoint somebody — refused.

**Email off**
14. Turn the master switch off and repeat 1 and 4: every state change still happens, no email is
    attempted, no error surfaces.

## 4. The check that is a defect if it fails

Open every email this feature sends and confirm **no payee name and no individual amount appears in
any of them** (SC-007). The detail lives behind the link, on purpose.

## 5. Before handing over

- `npx tsc --noEmit` and `npm run build` clean.
- Mockups approved before any component was written; `ui-versions/` snapshots for every existing file
  touched.
- The four steering files, the spec, and the constitution's scheduled-work amendment updated in the
  same commits.
- After deploy: `[apply-sql]` confirms `068` applied — reported in one line.
