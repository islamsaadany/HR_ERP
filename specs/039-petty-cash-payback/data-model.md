# Phase 1 Data Model: Petty Cash & Payback Requests

Target: `prisma/schema.prisma`, with the matching idempotent migration
`prisma/sql/067_petty_cash_payback.sql` in the same commit.

All money columns are `Decimal @db.Decimal(10, 2)` and are read into TypeScript through
`src/lib/finance/money.ts` only (research R1). All dates are stored as `DateTime` and displayed
`dd/mm/yyyy` via `formatDate`.

---

## Enums

```prisma
enum PettyCashAccountStatus { ACTIVE ARCHIVED }

enum PettyCashPeriodStatus  { OPEN SUBMITTED CLOSED }

/// FLOAT draws on the custodian's cash; COMPANY_TRANSFER is the company paying a vendor
/// directly — it counts as period expenditure but never moves the float balance (FR-014).
enum PettyCashPaymentMethod { FLOAT COMPANY_TRANSFER }

/// Cash moving between the company and the float. RETURN is the custodian handing money back.
enum PettyCashFundingType   { TOP_UP RETURN }

/// Spec 040 inserts PAYMENT_SUBMITTED between APPROVED and PAID (research R8). Do not reorder.
enum PaybackStatus          { SUBMITTED APPROVED REJECTED PAID }
```

---

## Models

### `PettyCashAccount`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `name` | `String @unique` | e.g. "Marketing petty cash" |
| `custodianId` | `String` | → `User`. Must be an ACTIVE employee to accept new lines (FR-005) |
| `status` | `PettyCashAccountStatus @default(ACTIVE)` | |
| `createdById` | `String` | the Finance user who created it |
| `createdAt` / `updatedAt` | `DateTime` | |

Relations: `periods`, `fundings`, `lines` (through periods). Index on `custodianId`.

**No stored balance** (FR-003) — it is derived. The row exists partly to be locked (research R2).

### `PettyCashPeriod`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `accountId` | `String` | → `PettyCashAccount`, cascade delete |
| `label` | `String` | e.g. "Aug 2026" — `@@unique([accountId, label])` |
| `startDate` / `endDate` | `DateTime` | the window; lines outside it are flagged, not refused |
| `budget` | `Decimal?` | optional per-period figure (FR-006) |
| `openingBalance` | `Decimal @default(0)` | carried from the previous period's closing (FR-008) |
| `status` | `PettyCashPeriodStatus @default(OPEN)` | |
| `submittedAt` / `submittedById` | `DateTime?` / `String?` | custodian hands it to Finance |
| `closedAt` / `closedById` | `DateTime?` / `String?` | |
| `missingEvidenceAckAt` / `AckById` / `AckNote` | `DateTime?` / `String?` / `String?` | FR-011 |
| `reopenedAt` / `reopenedById` / `reopenReason` | `DateTime?` / `String?` / `String?` | FR-012 |

**One open period per account** is enforced by a partial unique index that Prisma cannot express, so
it lives in the migration:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "PettyCashPeriod_one_open_per_account"
  ON "PettyCashPeriod" ("accountId") WHERE "status" = 'OPEN';
```

### `PettyCashFunding`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `accountId` | `String` | → account |
| `periodId` | `String?` | the period it counts toward; set on creation like a line (research R3) |
| `type` | `PettyCashFundingType` | |
| `date` | `DateTime` | |
| `amount` | `Decimal` | **always positive**; `type` carries the direction (FR-002, edge case) |
| `reference` | `String?` | bank reference / instapay ref |
| `note` | `String?` | |
| `recordedById` | `String` | Finance user |
| `paymentRunId` | `String?` | **reserved for spec 040** — no relation, do not repurpose |
| `createdAt` | `DateTime` | |

### `PettyCashLine`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `periodId` | `String` | → period, cascade delete |
| `datePaid` | `DateTime` | |
| `sectionId` | `String` | → `ExpenseSection` — required (research R7) |
| `categoryId` | `String?` | → `ExpenseCategory` — optional |
| `description` | `String` | |
| `method` | `PettyCashPaymentMethod` | |
| `paymentDetails` | `String?` | the workbook's free-text "Payment details" |
| `payee` | `String?` | the workbook's "TO" |
| `amount` | `Decimal` | positive; corrections are edits or separate lines |
| `createdById` | `String` | who logged it — the custodian, usually |
| `createdAt` / `updatedAt` | `DateTime` | |

Relations: `evidence ExpenseEvidence[]`. Indexes on `periodId`, `sectionId`, `categoryId`.

A line is *missing receipt* when `evidence` is empty — a derived flag, never a stored one.

### `PettyCashLineDeletion`

Records what a deletion removed (FR-017), so a line does not simply vanish from a ledger.

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `periodId` | `String` | the period it was deleted from |
| `snapshot` | `Json` | the line's fields as they stood, including evidence filenames |
| `deletedById` | `String` | |
| `deletedAt` | `DateTime @default(now())` | |

### `PaybackRequest`

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` | → `User`, the requester |
| `amount` | `Decimal` | positive |
| `datePaid` | `DateTime` | |
| `categoryId` | `String?` | → `ExpenseCategory` |
| `description` | `String` | |
| `payee` | `String?` | |
| `status` | `PaybackStatus @default(SUBMITTED)` | |
| `submittedAt` | `DateTime @default(now())` | |
| `decidedById` / `decidedAt` / `decisionReason` | `String?` / `DateTime?` / `String?` | rejection requires a reason (FR-019) |
| `paidById` / `paidAt` | `String?` / `DateTime?` | who recorded the payment, and when they recorded it |
| `transferDate` / `amountTransferred` | `DateTime?` / `Decimal?` | the actual transfer (FR-021) |
| `paymentReference` | `String?` | |
| `paymentRunId` | `String?` | **reserved for spec 040** |

Relations: `evidence ExpenseEvidence[]`. Indexes on `userId`, `status`.

### `ExpenseEvidence`

One model, two optional parents (plan decision 3).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `blobUrl` | `String` | private store URL from `put()` |
| `fileName` | `String` | original name, for `Content-Disposition` |
| `contentType` | `String` | |
| `sizeBytes` | `Int` | |
| `uploadedById` | `String` | |
| `createdAt` | `DateTime @default(now())` | |
| `pettyCashLineId` | `String?` | → line, cascade delete |
| `paybackRequestId` | `String?` | → request, cascade delete |

Exactly one parent, enforced in the migration since Prisma cannot express it:

```sql
ALTER TABLE "ExpenseEvidence" ADD CONSTRAINT "ExpenseEvidence_one_parent"
  CHECK (("pettyCashLineId" IS NULL) <> ("paybackRequestId" IS NULL));
```

### `ExpenseSection` / `ExpenseCategory`

Identical shape, separate tables, independent of each other (research R7).

| Field | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `name` | `String @unique` | |
| `sortOrder` | `Int @default(0)` | |
| `archivedAt` | `DateTime?` | archived values stay on historical records (FR-026) |

---

## The one derivation

`src/lib/finance/pettycash.ts` — **pure**, no Prisma inside, so every screen, action and export reads
the same numbers and the arithmetic is testable without a database.

```ts
type PeriodFigures = {
  openingBalance: number;      // piastres, signed
  floatAdvanced: number;       // Σ TOP_UP − Σ RETURN in this period
  spentFromFloat: number;      // Σ lines where method = FLOAT
  spentByCompany: number;      // Σ lines where method = COMPANY_TRANSFER
  totalExpenses: number;       // spentFromFloat + spentByCompany
  budget: number | null;
  budgetRemaining: number | null; // SIGNED — an overspend is negative, never clamped (FR-009)
  closingBalance: number;      // opening + floatAdvanced − spentFromFloat (FR-008), SIGNED
};
```

Plus `describeBalance(closingBalance, custodianName)` returning the sentence the screens print —
"Forefront owes Raneem 4,617.16" / "Raneem holds 1,382.84 of company cash" / "Settled — nothing
owed either way" — so the direction is stated in words in exactly one place and can never invert
between screens the way the workbook's tabs do (SC-003).

`accountBalance(...)` is the same arithmetic over every period since inception, which by
construction equals the latest period's closing balance; it is derived, never stored (FR-003).

---

## State machines

**Period**: `OPEN → SUBMITTED → CLOSED`, plus `CLOSED → OPEN` (reopen, reason required).
- `OPEN`: lines and funding writable by the custodian and Finance.
- `SUBMITTED`: custodian has handed it over; Finance may still edit, the custodian may not.
- `CLOSED`: amounts, dates, classification and method frozen (FR-010). Evidence may still be
  attached — it changes no figure (spec edge case). Reopening re-derives the next period's opening
  balance (FR-012).

**Payback request**: `SUBMITTED → APPROVED → PAID`, or `SUBMITTED → REJECTED`.
- Rejection requires a reason and notifies the requester.
- `PAID` records amount transferred, transfer date, and who recorded it; a future transfer date is
  refused.
- Spec 040 inserts `PAYMENT_SUBMITTED` between `APPROVED` and `PAID`; nothing else changes.

---

## Migration notes (`prisma/sql/067_petty_cash_payback.sql`)

- Idempotent throughout: `CREATE TABLE IF NOT EXISTS`, `CREATE TYPE … ` guarded by a
  `DO $$ … EXCEPTION WHEN duplicate_object THEN NULL; END $$;` block, `CREATE INDEX IF NOT EXISTS`,
  and the check constraint added only when `NOT EXISTS` in `pg_constraint`.
- Seeds `ExpenseSection` and `ExpenseCategory` with the workbook's values via
  `INSERT … ON CONFLICT (name) DO NOTHING`, so a re-run adds nothing and never resurrects a value an
  admin has since archived.
- Adds no column to any existing table, so it cannot disturb a running deployment.
