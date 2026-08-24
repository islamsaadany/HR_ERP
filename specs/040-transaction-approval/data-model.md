# Phase 1 Data Model: Bank Confirmations & Monthly Salary Runs

Target: `prisma/schema.prisma` plus the idempotent `prisma/sql/068_payment_batches.sql` in the same
commit. Money is `Decimal(10,2)` read through `src/lib/finance/money.ts`, exactly as spec 039.

**A note on names.** The user-facing vocabulary is the CEO's: Finance *creates transactions in the
bank* and *submits them for confirmation*; he *confirms* them there and marks them **complete**. The
model names below keep `PaymentBatch` as internal shorthand for "the transactions created in one
sitting" — that word must never reach a screen, where the UI says "3 transactions".

---

## Enums

```prisma
/// What a submission covers. SALARY carries no per-person data and is visible to fewer people.
enum PaymentBatchType { EXPENSES SALARY }

/// SUBMITTED is the only state that waits on anybody.
enum PaymentBatchStatus {
  SUBMITTED  // created in the bank, submitted here for confirmation
  COMPLETE   // confirmed in the bank; the money has moved. Immutable
  RETURNED   // handed back to Finance with a note; payables released
  WITHDRAWN  // Finance pulled it back before a decision; payables released
}
```

**One member added to an existing enum** (the position spec 039 reserved):

```prisma
enum PaybackStatus {
  SUBMITTED
  APPROVED
  PAYMENT_SUBMITTED  // ← new: created in the bank, awaiting confirmation there
  REJECTED
  PAID
}
```

The migration inserts it `BEFORE 'REJECTED'`, **not** before `PAID`. The type as created in 067 runs
`SUBMITTED, APPROVED, REJECTED, PAID`, so inserting before `PAID` would land the new member after
`REJECTED` and leave the database's order disagreeing with the order the schema declares — a trap
for the first person who sorts by that column. Verified against a real database both ways.

---

## Models

### `TransactionConfirmer`

The appointment. Holders are **only** the people listed here — top-level access does not confer it
(research R1). The schema comment says why, so it is not "corrected" into consistency with
`LearningManager` later.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String @unique` | → `User`, cascade delete |
| `appointedById` | `String?` | → `User`, set null. Only top-level access may write this row |
| `createdAt` | `DateTime @default(now())` | |

### `PaymentBatch`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `reference` | `String` | human-facing, e.g. "AUG-26-01" |
| `type` | `PaymentBatchType` | |
| `status` | `PaymentBatchStatus @default(SUBMITTED)` | it exists only once submitted |
| `bankReference` | `String?` | the bank's own reference |
| `valueDate` | `DateTime` | how the transactions are dated at the bank |
| `note` | `String?` | |
| `totalAmount` | `Decimal @db.Decimal(10,2)` | **frozen at submission** — research R2 |
| `itemCount` | `Int` | frozen with the total, so email and screen agree |
| `submittedById` / `submittedAt` | `String?` / `DateTime` | who created them in the bank |
| `decidedById` / `decidedAt` | `String?` / `DateTime?` | who confirmed, returned or withdrew |
| `decisionNote` | `String?` | required when returning or withdrawing |
| `confirmedTotal` | `Decimal?` | the total shown at the moment of confirming — equal to `totalAmount` by construction, stored so "what did he confirm?" needs no inference |
| **Salary-only** | | |
| `salaryMonth` | `DateTime?` | first day of the month covered |
| `headcount` | `Int?` | how many people the run covers |
| `isExtraRun` | `Boolean @default(false)` | a second run in one month |
| `extraRunReason` | `String?` | required when `isExtraRun` |
| `attachmentUrl` / `attachmentName` | `String?` | the bank's file, private blob |

Indexes: `status`, `type`, `submittedAt`. Plus a partial unique index Prisma cannot express, so one
month cannot hold two ordinary salary runs:

```sql
CREATE UNIQUE INDEX "PaymentBatch_one_salary_run_per_month"
  ON "PaymentBatch" ("salaryMonth")
  WHERE "type" = 'SALARY' AND "isExtraRun" = false AND "status" <> 'WITHDRAWN';
```

### `PaymentBatchItem`

One transaction inside a submission. Two optional parents, exactly one set — the same discipline as
`ExpenseEvidence` in spec 039.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `batchId` | `String` | → `PaymentBatch`, cascade delete |
| `paybackRequestId` | `String?` | → `PaybackRequest`, set null |
| `pettyCashFundingId` | `String?` | → `PettyCashFunding`, set null |
| `amountAtSubmission` | `Decimal @db.Decimal(10,2)` | the amount **as submitted**, so the history survives a later correction to the source record |
| `payeeName` / `purpose` | `String` | snapshots, for the screen and the record |

```sql
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_one_parent"
  CHECK (("paybackRequestId" IS NULL) <> ("pettyCashFundingId" IS NULL));

-- one payable can be awaiting confirmation only once
CREATE UNIQUE INDEX "PaymentBatchItem_one_live_payback"
  ON "PaymentBatchItem" ("paybackRequestId") WHERE "paybackRequestId" IS NOT NULL;
-- and the equivalent for "pettyCashFundingId"
```

Returning or withdrawing **deletes** the items, which is exactly what "released" means: the payable
is selectable again.

### `ConfirmationReminderLog`

One row per reminder sent, so the daily job cannot pester somebody twice about the same thing on the
same day, and so "was he actually told?" is answerable.

`id` · `batchId` · `userId` · `sentOn` (date), unique on `[batchId, userId, sentOn]`.

---

## The derivations

`src/lib/finance/confirmers.ts` — **the** answer to "may this person confirm?", asked by the pages,
the actions, the email recipient list, the sidebar door and the daily job:

```ts
canConfirmBatches(userId): Promise<boolean>   // the appointment table only — no role fallback
eligibleConfirmers(): Promise<{id, name, email}[]>   // appointed, and still employed
canAppointConfirmers(role): boolean           // Super User only; self-appointment allowed
hasAnyConfirmer(): Promise<boolean>           // so Finance's screen can say when nobody can confirm
```

`src/lib/finance/batches.ts` — **pure**, no Prisma:

```ts
batchTotal(items): number                     // piastres; called ONCE, at submission
canDecide(record, viewer): Decision           // submitter ≠ confirmer, except top-level access
nextStatus(current, action): BatchStatus|null // the state machine, in one place
releasesItems(status): boolean                // returned/withdrawn free the payables
describeBatch(record, total): string          // "3 transactions totalling EGP 12,450.00"
nextBatchReference(when, seq): string         // "AUG-26-01"
```

`describeBatch` takes counts and a formatted total and has nowhere to put a name — which is how
SC-007 (no payee names in email) is enforced structurally rather than by remembering.

---

## State machine

```
                 ┌── mark complete ──→ COMPLETE   (immutable; payables → Paid, requesters told)
SUBMITTED ───────┼── return ─────────→ RETURNED   (payables released, nobody told)
                 └── withdraw ───────→ WITHDRAWN  (payables released, nobody told)
```

- A submission is created **already submitted** — there is no draft, because it records transactions
  that already exist in the bank.
- `COMPLETE` is terminal. A bank rejection afterwards becomes new payables, never an edit.

**Payback request lifecycle, as amended by this feature:**

```
SUBMITTED → APPROVED → PAYMENT_SUBMITTED → PAID
     └────→ REJECTED         └────→ back to APPROVED if returned or withdrawn
```

---

## Migration notes (`prisma/sql/068_payment_batches.sql`)

- The `ALTER TYPE … ADD VALUE` runs as its own statement, first, outside any transaction block, and
  is idempotent via `IF NOT EXISTS`.
- Everything else follows 067: guarded `CREATE TYPE`, `CREATE TABLE IF NOT EXISTS`, indexes with
  `IF NOT EXISTS`, constraints added only when absent from `pg_constraint`.
- It also **drops** the two `paymentRunId` columns spec 039 reserved. Membership landed in
  `PaymentBatchItem`, which also snapshots payee, purpose and amount, so those columns had no
  meaning and were never written by any code.
