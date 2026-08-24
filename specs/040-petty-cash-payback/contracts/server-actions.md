# Contract: Server Actions

Every mutation is a server action (`"use server"`) behind a server-side guard. The client mirrors
nothing it is trusted on. Refusals are returned as a message the UI shows — none of them throw a
raw error at the user.

**Shared guards** (`src/lib/finance/access.ts`, the one source asked by pages, actions and routes):

| Guard | True for |
|---|---|
| `canManagePettyCash(role)` | `FINANCE` ∨ `SUPER_USER` |
| `canSeePettyCashAccount(user, account)` | `canManagePettyCash` ∨ the account's custodian |
| `canWritePettyCashLine(user, account, period)` | `canSeePettyCashAccount` ∧ period is `OPEN`, or Finance ∧ period is `OPEN`/`SUBMITTED` |
| `canReviewPayback(role)` | `FINANCE` ∨ `SUPER_USER` |
| `canManageExpenseLists(role)` | `SUPER_USER` |

---

## Petty cash — custodian actions (`app/(app)/petty-cash/actions.ts`)

### `addLine(formData)`
**Guard**: `canWritePettyCashLine`. **Lock**: account row `FOR UPDATE`.

| Input | Rule |
|---|---|
| `periodId` | must exist, belong to a visible account, be `OPEN` (or `SUBMITTED` for Finance) |
| `datePaid` | required, valid; a date outside the period window is **accepted and flagged**, not refused |
| `sectionId` | required, must be un-archived |
| `categoryId` | optional, must be un-archived if given |
| `description` | required, trimmed, 1–500 chars |
| `method` | `FLOAT` \| `COMPANY_TRANSFER` |
| `paymentDetails`, `payee` | optional, ≤ 200 chars |
| `amount` | required, > 0, ≤ 2 decimals, ≤ 9,999,999.99 |
| `files[]` | 0–10 files, each ≤ 10 MB, image or PDF |

**Refusals**: `"That period is closed — reopen it to add a line."` · `"Enter an amount greater than
zero."` · `"Amounts can have at most two decimals."` · `"This account has no active custodian — Finance
must name one before lines can be added."` · `"Receipts must be an image or a PDF, up to 10MB each."`

**Re-checked under the lock**: the period is still `OPEN`. This is the race the lock exists for — a
line must never land in a period Finance is closing.

### `editLine(formData)` / `deleteLine(formData)`
**Guard**: same, plus the period must not be `CLOSED`. `deleteLine` writes a `PettyCashLineDeletion`
snapshot in the same transaction (FR-017) and cascades the evidence rows.

### `addEvidence(formData)` / `removeEvidence(formData)`
**Guard**: `canSeePettyCashAccount`. Evidence may be **added to a closed period's line** (it changes
no figure) but never removed from one.

### `submitPeriod(formData)`
**Guard**: the account's custodian, or Finance. `OPEN → SUBMITTED`. Records who and when.

---

## Petty cash — Finance actions (`app/(app)/petty-cash/finance-actions.ts`)

### `createAccount` / `setCustodian` / `archiveAccount`
**Guard**: `canManagePettyCash`. A custodian must be an `ACTIVE` user. Archiving refuses while an
open period exists: `"Close the open period before archiving this account."`

### `openPeriod(formData)`
**Guard**: `canManagePettyCash`. **Lock**: account row.
Sets `openingBalance` from the previous period's closing balance (0 for the first). Refuses a second
open period — both by the partial unique index and by an explicit check under the lock, so the user
sees a sentence rather than a constraint error: `"This account already has an open period."`
Validates `endDate > startDate` and refuses a window overlapping an existing period.

### `recordFunding(formData)`
**Guard**: `canManagePettyCash`. **Lock**: account row.
`type` ∈ {`TOP_UP`, `RETURN`}, `amount > 0` (direction comes from the type, never a negative amount),
`date` not in the future, optional reference/note.

### `closePeriod(formData)`
**Guard**: `canManagePettyCash`. **Lock**: account row.
1. Recompute the figures under the lock — never trust a total the page rendered earlier.
2. If any line has no evidence: refuse unless `acknowledgeMissing === "yes"`, and when acknowledged,
   store `missingEvidenceAckAt/ById/Note` **plus the ids of the lines acknowledged** (FR-011).
3. `SUBMITTED|OPEN → CLOSED`, recording who and when.
4. Write the closing balance into the account's next period if one already exists.

**Refusal**: `"3 lines have no receipt attached. Tick the acknowledgement to close anyway."`

### `reopenPeriod(formData)`
**Guard**: `canManagePettyCash`. Requires a reason. Re-derives the following period's opening balance
in the same transaction (FR-012).

---

## Payback — employee actions (`app/(app)/payback/actions.ts`)

### `submitRequest(formData)`
**Guard**: any signed-in user, acting for themselves only — `userId` comes from the session, never
from the form.

| Input | Rule |
|---|---|
| `amount` | > 0, ≤ 2 decimals |
| `datePaid` | required, not in the future |
| `categoryId` | optional, un-archived |
| `description` | required, 1–500 chars |
| `payee` | optional |
| `files[]` | **1–10 required**, each ≤ 10 MB, image or PDF (FR-018) |

**Refusal**: `"Attach the receipt or invoice — a payback request can't be reviewed without it."`

### `withdrawRequest(formData)`
Own request only, and only while `SUBMITTED`.

---

## Payback — Finance actions (`app/(app)/finance/payback-actions.ts`)

### `approveRequest` / `rejectRequest`
**Guard**: `canReviewPayback`. Only from `SUBMITTED` — a request already decided refuses with
`"That request has already been decided."` Rejection requires a reason and emails the requester.

### `recordPayment(formData)`
**Guard**: `canReviewPayback`. Only from `APPROVED`.
`amountTransferred > 0`, `transferDate` not in the future (compared against end-of-today so a
same-day transfer passes — the rule already used by `confirmPayment`). Sets `PAID`, records
`paidById`/`paidAt`, emails the requester.

### `correctPayment(formData)`
**Guard**: `canReviewPayback`. Only from `PAID`. Changes `amountTransferred`/`transferDate` only —
does **not** change status, does **not** touch `paidById`/`paidAt`, and deliberately sends **no**
email (FR-023), matching `editPayment` for benefit claims.

### Duplicate hint (read-only, FR-022)
When rendering a request for review, if the requester custodians any active account, query their
petty cash lines with the same `amount` and `datePaid` within ±7 days and show them beside the
request. Information for Finance — it never blocks, and it is not a check the write path performs.

---

## Expense lists (`app/(app)/admin/expense-lists/actions.ts`)

`addSection` · `renameSection` · `archiveSection` · `restoreSection`, and the same four for
categories. **Guard**: `canManageExpenseLists` (Super User only, FR-027). Archiving never alters
existing records; renaming changes the label everywhere because records reference the row by id.

---

## Email (fire-and-forget, after the DB write, never inside the transaction)

| Trigger | To | Template |
|---|---|---|
| Payback request submitted | configured Finance inbox | `paybackSubmittedToFinance` |
| Request rejected | the requester | `paybackRejectedToEmployee` (includes the reason) |
| Payment recorded | the requester | `paybackPaidToEmployee` (amount + transfer date) |

All three respect the master toggle and the configured inbox, and a failure is logged and swallowed
— no state change is ever rolled back or blocked by email (FR-029).

**Petty cash sends no email at all.** The custodian and Finance are both looking at a live screen;
adding notifications for a ledger nobody is waiting on would widen the email surface for no one's
benefit.
