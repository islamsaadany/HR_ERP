# Quickstart: Validating Bank Confirmations & Salary Runs

## Prerequisites

```bash
npm install && npx tsc --noEmit && npm run build
```

A disposable local Postgres is available (`initdb`/`pg_ctl` under `/usr/lib/postgresql/*/bin`, run as
`postgres`, socket in `/tmp`). **Never point any of this at the production database.**

## 1. The rules, without a database

`src/lib/finance/batches.ts` is pure. Assert:

| Case | Expected |
|---|---|
| Finance sends, Finance tries to confirm | refused — *"You sent this batch"* |
| Finance sends, an appointed confirmer confirms | allowed |
| A Super User sends and confirms their own batch | allowed, and the batch records the same person on both halves (the CEO's ruling) |
| An appointed confirmer who is not the sender, on a `CONFIRMED` batch | refused — already decided |
| `batchTotal` over three items | exact to the piastre, matching the sum of `amountAtSend` |

## 2. The migration, against a throwaway database

```bash
psql -f prisma/sql/068_payment_batches.sql hrerp_test
psql -f prisma/sql/068_payment_batches.sql hrerp_test   # again: must be a clean no-op
```

Then prove the things Prisma cannot express:

```sql
-- the new status must exist, in the right position
SELECT enumlabel, enumsortorder FROM pg_enum
  JOIN pg_type t ON t.oid = enumtypid WHERE t.typname = 'PaybackStatus' ORDER BY enumsortorder;
-- expect: SUBMITTED, APPROVED, PAYMENT_SUBMITTED, PAID, REJECTED

-- one ordinary salary run per month
INSERT INTO "PaymentBatch" (…, "type", "salaryMonth", "isExtraRun") VALUES (…, 'SALARY', '2026-08-01', false);
INSERT INTO "PaymentBatch" (…, 'SALARY', '2026-08-01', false);   -- expect a unique violation
INSERT INTO "PaymentBatch" (…, 'SALARY', '2026-08-01', true);    -- an extra run: must succeed

-- a batch item has exactly one parent
INSERT INTO "PaymentBatchItem" (…, "paybackRequestId", "pettyCashFundingId") VALUES (…, 'a', 'b');  -- refused
INSERT INTO "PaymentBatchItem" (…, NULL, NULL);                                                     -- refused

-- one payable cannot sit in two live batches
```

## 3. End to end, in the running app

**Sending**
1. As Finance, approve two payback requests, then select both plus a float top-up and send them as
   one batch with today's value date. The batch shows 3 items and the correct total; each payback now
   reads *sent to the bank*.
2. Try to add one of those payables to a second batch — refused.
3. Try to edit one of the underlying requests — refused while the batch stands.

**Confirming**
4. As the appointed confirmer, open the link: the batch shows each payee, purpose, amount and
   receipt. Confirm it. Each payback becomes **Paid** and each requester is emailed.
5. Check the requester was told **only now** — nothing should have reached them when the batch was
   sent.
6. Send a second batch back with a note: its items return to awaiting payment and **nobody** is told
   they were paid.
7. As the Finance user who sent a batch, try to confirm it — refused with a sentence.

**Salary**
8. Send a salary run for a month: total, headcount, reference. Confirm the confirmer is emailed and
   that the email contains **no names and no per-person amount**.
9. Send a second ordinary run for the same month — refused; tick "extra run" with a reason — accepted.
10. Sign in as an HR Admin and open the salary screen — denied.

**Appointments**
11. With nobody appointed, send a batch: it is created, and the Finance screen says plainly that
    nobody can confirm it yet.
12. As a Super User, appoint yourself, then confirm — the recovery path works in one click.
13. As an appointed confirmer who is not a Super User, try to appoint somebody — refused.

**Email off**
14. Turn the master switch off and repeat 1 and 4: every state change still happens, no email is
    attempted, no error surfaces.

## 4. The one check that is a defect if it fails

Open every email this feature sends and confirm **no payee name and no individual amount appears in
any of them** (SC-007). The detail lives behind the link, on purpose.

## 5. Before handing over

- `npx tsc --noEmit` and `npm run build` clean.
- Mockups approved before any component was written; `ui-versions/` snapshots for every existing file
  touched.
- The four steering files, the spec, and the constitution's scheduled-work amendment updated in the
  same commits.
- After deploy: `[apply-sql]` confirms `068` applied — reported in one line.
