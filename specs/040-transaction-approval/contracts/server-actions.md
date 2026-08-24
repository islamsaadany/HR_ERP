# Contract: Server Actions & Routes

Every mutation is a server action behind a server-side guard, refusing with a sentence the screen
shows. Same shape as spec 039, including the module-level `function fail(back, msg): never`.

**Guards**

| Guard | True for |
|---|---|
| `canSubmitTransactions(role)` | `FINANCE` ∨ `SUPER_USER` |
| `canConfirmBatches(userId)` | holds the appointment — **no role fallback** (research R1) |
| `canSeeSalaryRuns(role, userId)` | `FINANCE` ∨ `SUPER_USER` ∨ a confirmer. **Never `HR_ADMIN`** |
| `canAppointConfirmers(role)` | `SUPER_USER` only |

---

## Finance — submitting (`app/(app)/finance/batch-actions.ts`)

### `submitTransactions(formData)`
**Guard**: `canSubmitTransactions`.

| Input | Rule |
|---|---|
| `itemIds[]` | ≥ 1 payable; each must be awaiting payment and **not** already awaiting confirmation |
| `valueDate` | required, not in the future |
| `bankReference` | optional, ≤ 100 chars |
| `note` | optional |
| `reference` | auto-generated (e.g. `AUG-26-01`), overridable |

Inside one transaction: re-check each payable's state, snapshot payee/purpose/amount onto the items,
compute the total **once**, create the submission as `SUBMITTED`, and move each payback request to
`PAYMENT_SUBMITTED`. Then, outside it, email the confirmers.

**Refusals**: `"Two of those are already awaiting confirmation."` · `"Nothing selected."` ·
`"The value date can't be in the future."` · `"Nobody is appointed to confirm transactions yet — ask
a Super User to appoint someone, or this will just sit here."` *(this one warns and still submits —
it records transactions that already exist in the bank)*

### `submitSalaryRun(formData)`
**Guard**: `canSubmitTransactions`.

| Input | Rule |
|---|---|
| `salaryMonth` | required, a month; not in the future |
| `totalAmount` | required, > 0, ≤ 2 decimals (`parseAmountInput`) |
| `headcount` | required, integer > 0 |
| `bankReference` | optional |
| `isExtraRun` + `extraRunReason` | a second ordinary run for a month is refused; an extra run requires a reason |
| `attachment` | optional, image/PDF, ≤ 10 MB, private blob |

**Refusals**: `"A salary run for August 2026 has already been submitted. Tick 'extra run' and say
why if this is a second transfer for that month."` · `"Enter how many people this run covers."`

**Never accepts** any per-person figure. There is no field for one.

### `withdrawSubmission(formData)`
**Guard**: `canSubmitTransactions`. Only from `SUBMITTED`. Reason required. Deletes the items, returns each payback
request to `APPROVED`, records who withdrew it and why.

---

## The confirmer (`app/(app)/confirmations/actions.ts`)

### `markComplete(formData)`
**Guard**: `canConfirmSubmissions`, **plus** `canDecide` — the sender may not confirm their own batch
unless they hold top-level access (FR-011).

Inside one transaction: re-check it is still `SUBMITTED`, set `COMPLETE`, store `confirmedTotal`,
`decidedById` and `decidedAt`, and move every payback item to `PAID` with the transfer date taken
from the value date. Then, outside it, email each payback requester.

**Refusals**: `"That batch has already been decided."` · `"You sent this batch, so somebody else has
to confirm it."`

### `returnToFinance(formData)`
**Guard**: same. Note required. Sets `RETURNED`, deletes the items, returns each payback request to
`APPROVED`. **Nobody is told they were paid.**

---

## Appointments (`app/(app)/admin/confirmers/actions.ts`)

`appointConfirmer` · `removeConfirmer`. **Guard**: `canAppointConfirmers` (Super User only). The
subject must be an active employee. A Super User may appoint themselves — that is the recovery path
from an empty list (research R1). An appointed confirmer who is not a Super User cannot reach these
actions at all.

---

## Pages

| Route | Who | What |
|---|---|---|
| `/confirmations` | appointed confirmers | What is waiting, newest first, with totals. Nothing else. |
| `/confirmations/[batchId]` | appointed confirmers | Each item — payee, purpose, amount, evidence — then Confirm or Return to Finance. |
| `/finance` → *Awaiting confirmation* tab | Finance | Records by state; tick payables and submit; withdraw. |
| `/finance/salary` | Finance, confirmers, Super User (**never HR Admin**) | Monthly runs and the form to send one. |
| `/admin/confirmers` | Super User | Who may confirm. |

**Navigation**: a "Confirmations" entry appears only for people holding the appointment, with a count
of what is waiting — the same derivation the page uses.

---

## Email

| Trigger | To | Contains |
|---|---|---|
| Transactions submitted | every eligible confirmer | kind, count, total, who submitted, link. **No payee names, no per-person amounts** |
| Batch confirmed | each payback requester in it | their own amount and the transfer date (the existing paid template) |
| Daily, if anything waits beyond the lead | every eligible confirmer | how many are waiting, their combined total, link. Logged so nobody is told twice in a day |

All fire-and-forget, honouring the master switch. No state depends on an email being delivered.

---

## Cron

`GET /api/cron/confirmations`, authenticated with `CRON_SECRET`, daily. Finds `SUBMITTED` submissions older
than the configured lead, emails eligible confirmers once per batch per day, writes a reminder log
row. **It may never email anyone who is not an appointed confirmer.**
