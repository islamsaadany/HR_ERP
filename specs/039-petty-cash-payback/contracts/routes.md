# Contract: Pages & Routes

Server components, `export const dynamic = "force-dynamic"` where the data changes under the viewer,
navy/gold, dates `dd/mm/yyyy`, money via `formatEGP2`.

## Pages

| Route | Who reaches it | What it shows |
|---|---|---|
| `/petty-cash` | Finance, Super User, or the custodian of ≥ 1 active account | Accounts with their signed balance and the state of the current period. Finance sees every account and the "New account" control; a custodian sees only theirs. Redirects to `/dashboard` for anyone else. |
| `/petty-cash/[accountId]` | `canSeePettyCashAccount` | The reconciliation panel, the period's lines with their receipts, and the period picker. Finance-only controls — record funding, open/close/reopen a period, change custodian — render only under `canManagePettyCash`. |
| `/payback` | any signed-in employee | Their own requests with status and outcome, and the "Request a payback" form. Never anyone else's. |
| `/finance` → *Payback requests* sub-tab | `requireFinance()` | The review queue (Submitted), then approved-awaiting-payment, then history. Added as a third tab beside the existing Confirmation queue and Recoveries. |
| `/admin/expense-lists` | `requireSuperUser()` | Sections and categories: add, rename, archive, restore. |

**Navigation** (`AppShell.tsx`, snapshot to `ui-versions/AppShell/` before editing):
- "Petty cash" appears when the viewer is Finance/Super User **or** custodians an active account —
  the same derivation the pages use, so the door and the room can never disagree.
- "Payback" appears for everyone.

## Serving route

### `GET /api/expense-evidence/[id]`

Streams one evidence file from the **private** blob store after re-deciding access at the door.

**Access** — the viewer must be one of:
- the uploader,
- the owner of the parent record (the payback requester, or the custodian of the line's account),
- Finance or Super User.

**Anyone else, and any missing record, gets `404` — never `403`** (research R5): "forbidden" would
confirm that a receipt exists, and existence alone leaks who spent what.

**Response**: `streamPrivateBlob(evidence.blobUrl, { fileName: evidence.fileName })`, which sets
`Content-Type`, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-cache`.

**Unauthenticated**: redirect to `/signin`, matching the existing proof route.

## Freshness

Both petty cash pages are `force-dynamic` and revalidate on every action. A custodian adding a line
on their phone while Finance has the period open on a laptop is exactly the "server pages people
monitor go stale" case from `CLAUDE.md`, so `/petty-cash/[accountId]` carries `AutoRefresh`
(router.refresh on focus + 30s) — the existing component, not a new mechanism. The Finance payback
tab gets the same treatment, since a request can arrive while the queue sits open.

## What is deliberately not built

- No CSV/Excel export of a period. The workbook is being replaced, not re-exported; an export can be
  added when someone needs one, and inventing a format now would be the second place the
  reconciliation arithmetic lives.
- No printable reimbursement voucher.
- No mobile app or offline capture — the page is used from a phone browser, which is what the
  custodian does today with the spreadsheet.
