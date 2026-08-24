# Phase 1 Data Model: Bank Confirmations & Monthly Salary Runs

Target: `prisma/schema.prisma` plus the idempotent `prisma/sql/068_payment_batches.sql` in the same
commit. Money is `Decimal(10,2)` read through `src/lib/finance/money.ts`, exactly as spec 039.

---

## Enums

```prisma
/// What a batch is for. SALARY carries no per-person data and is visible to fewer people.
enum PaymentBatchType { EXPENSES SALARY }

/// SENT is the only state in which a batch waits on anybody.
enum PaymentBatchStatus {
  SENT       // entered in the bank, waiting for the confirmer
  CONFIRMED  // confirmed in the bank and ticked off here — immutable
  SENT_BACK  // returned to Finance with a note; items released
  WITHDRAWN  // Finance pulled it back before a decision; items released
}
```

**One member added to an existing enum** (reserved by spec 039):

```prisma
enum PaybackStatus {
  SUBMITTED
  APPROVED
  PAYMENT_SUBMITTED  // ← new: sent to the bank, waiting for confirmation
  PAID
  REJECTED
}
```

---

## Models

### `TransactionConfirmer`

The appointment. Holders are **only** the people listed here — top-level access does not confer it
(research R1). The comment in the schema says why, so it is not "corrected" into consistency with
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
| `reference` | `String` | human-facing, e.g. "AUG-26-01"; unique per year is not enforced |
| `type` | `PaymentBatchType` | |
| `status` | `PaymentBatchStatus @default(SENT)` | a batch exists only once it is sent |
| `bankReference` | `String?` | the bank's own reference |
| `valueDate` | `DateTime` | when the transfers are dated at the bank |
| `note` | `String?` | |
| `totalAmount` | `Decimal @db.Decimal(10,2)` | **frozen at send** — see research R2 |
| `itemCount` | `Int` | frozen with the total, so the email and the screen agree |
| `sentById` / `sentAt` | `String` / `DateTime` | |
| `decidedById` / `decidedAt` | `String?` / `DateTime?` | who confirmed, sent back or withdrew |
| `decisionNote` | `String?` | required when sending back or withdrawing |
| `confirmedTotal` | `Decimal?` | the total shown at the moment of confirming — equals `totalAmount` by construction, stored so the record answers "what did he confirm?" without inference |
| **Salary-only fields** | | |
| `salaryMonth` | `DateTime?` | first day of the month covered |
| `headcount` | `Int?` | how many people the run covers |
| `isExtraRun` | `Boolean @default(false)` | a second run in one month |
| `extraRunReason` | `String?` | required when `isExtraRun` |
| `attachmentUrl` / `attachmentName` | `String?` | the bank's file, private blob, served through the existing evidence route pattern |

Indexes: `status`, `type`, `sentAt`. Partial unique index (in SQL, Prisma cannot express it) so one
month cannot hold two ordinary salary runs:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentBatch_one_salary_run_per_month"
  ON "PaymentBatch" ("salaryMonth")
  WHERE "type" = 'SALARY' AND "isExtraRun" = false AND "status" <> 'WITHDRAWN';
```

### `PaymentBatchItem`

One payable in a batch. Two optional parents, exactly one set — the same shape (and the same check
constraint discipline) as `ExpenseEvidence` in spec 039.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `batchId` | `String` | → batch, cascade delete |
| `paybackRequestId` | `String?` | → `PaybackRequest`, set null |
| `pettyCashFundingId` | `String?` | → `PettyCashFunding`, set null |
| `amountAtSend` | `Decimal @db.Decimal(10,2)` | the amount **as sent**, so history survives a later correction to the source record |
| `payeeName` | `String` | snapshot, for the batch screen and the record |
| `purpose` | `String` | snapshot |

```sql
ALTER TABLE "PaymentBatchItem" ADD CONSTRAINT "PaymentBatchItem_one_parent"
  CHECK (("paybackRequestId" IS NULL) <> ("pettyCashFundingId" IS NULL));
```

Plus a unique index on each parent so one payable cannot sit in two live batches:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentBatchItem_one_live_payback"
  ON "PaymentBatchItem" ("paybackRequestId") WHERE "paybackRequestId" IS NOT NULL;
```

*(The equivalent for `pettyCashFundingId`. A withdrawn or sent-back batch deletes its items, so the
payable is free again — which is what "released" means in the spec.)*

### `ConfirmationReminderLog`

One row per reminder email sent, so a daily job cannot pester somebody twice about the same batch on
the same day and so "was he told?" is answerable.

| Field | Type | Notes |
|---|---|---|
| `id` · `batchId` · `userId` · `sentOn` (date) | | `@@unique([batchId, userId, sentOn])` |

---

## The derivations

`src/lib/finance/confirmers.ts` — **the** answer to "may this person confirm?", asked by the pages,
the actions, the email recipient list and the cron:

```ts
canConfirmBatches(userId): Promise<boolean>   // appointment table only — no role fallback
eligibleConfirmers(): Promise<User[]>          // active employees holding the appointment
```

`src/lib/finance/batches.ts` — **pure**, no Prisma:

```ts
batchTotal(items: {amountAtSend}[]): number            // piastres; used ONCE, at send
canDecide(batch, viewer): "yes" | reason               // sender ≠ confirmer, except top-level access
nextStatus(current, action): PaymentBatchStatus | null // the state machine in one place
describeBatch(batch): string                           // "3 transfers · 12,450.00 · sent by Mohamed"
```

---

## State machine

```
            ┌──────────── confirm ──────────→ CONFIRMED  (immutable; items → Paid)
SENT ───────┼──────────── send back ────────→ SENT_BACK  (items released)
            └──────────── withdraw ─────────→ WITHDRAWN  (items released)
```

- A batch is created **already sent** — there is no draft. Finance selects items and sends in one
  step, because the batch describes something that has already happened at the bank.
- `CONFIRMED` is terminal. A bank rejection afterwards is new payables, never an edit.
- Sending back or withdrawing deletes the batch's items, which frees the payables and returns each
  payback request from `PAYMENT_SUBMITTED` to `APPROVED`.

**Payback request lifecycle, as amended:**

```
SUBMITTED → APPROVED → PAYMENT_SUBMITTED → PAID
     └────→ REJECTED         └────→ back to APPROVED if the batch is sent back or withdrawn
```

---

## Migration notes (`prisma/sql/068_payment_batches.sql`)

- `ALTER TYPE "PaybackStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_SUBMITTED' BEFORE 'PAID'` — run as its
  own statement, not inside a transaction block, and idempotent by the `IF NOT EXISTS` clause
  (research R3). **Verify on a throwaway Postgres before shipping**, including a second run.
- Everything else follows 039's file: guarded `CREATE TYPE`, `CREATE TABLE IF NOT EXISTS`, indexes
  with `IF NOT EXISTS`, constraints added only when absent from `pg_constraint`.
- No column is added to any existing table except the enum member, so a running deployment is
  undisturbed.
