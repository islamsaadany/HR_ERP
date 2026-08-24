# Tasks: Petty Cash & Payback Requests

**Feature**: `specs/040-petty-cash-payback` | **Branch**: `claude/finance-petty-cash-payroll-we46wn`

**Input**: [plan.md](./plan.md) · [research.md](./research.md) · [data-model.md](./data-model.md) ·
[contracts/](./contracts/) · [quickstart.md](./quickstart.md)

**Tests**: Not requested, and there is no testing regime (constitution V). One exception is included
— T011 covers the reconciliation arithmetic, which is exactly the "changing money code, want to know
the numbers still hold" case the house rules keep `npm test` around for.

## Build order ≠ priority order

The spec ranks **US4 (accounts, funding, lists)** as P2 because it is set-up that is touched rarely.
It is nonetheless built **first**, because US1 and US2 have nowhere to write until an account and an
open period exist. This is stated here rather than silently reordering the phases.

---

## Phase 1: Setup

- [x] T001 Create `src/lib/finance/money.ts` — `toPiastres(Decimal|string|number)`, `fromPiastres(n)`, `parseAmountInput(raw)` returning a piastres integer or a refusal message (> 0, ≤ 2 decimals, ≤ 9,999,999.99), and `sumPiastres(...)`. This is the ONLY place money crosses between storage and arithmetic (research R1).
- [x] T002 [P] Confirm no new dependencies are needed — `@vercel/blob`, `resend` and `decimal.js` (via Prisma) are already in `package.json`. Add nothing.

---

## Phase 2: Foundational — Gate G1 (BLOCKS every later phase)

**No UI file may be created until this phase is complete and `npx tsc --noEmit` is clean.**

- [x] T003 Add the five enums to `prisma/schema.prisma`: `PettyCashAccountStatus`, `PettyCashPeriodStatus`, `PettyCashPaymentMethod`, `PettyCashFundingType`, `PaybackStatus` — with the comment recording that spec 041 inserts `PAYMENT_SUBMITTED` and the order must not change (data-model.md).
- [x] T004 Add `PettyCashAccount`, `PettyCashPeriod`, `PettyCashFunding`, `PettyCashLine` and `PettyCashLineDeletion` to `prisma/schema.prisma` per data-model.md, including the `paymentRunId String?` reserved column on funding and the back-relations on `User`.
- [x] T005 [P] Add `PaybackRequest`, `ExpenseEvidence`, `ExpenseSection` and `ExpenseCategory` to `prisma/schema.prisma` per data-model.md, including `paymentRunId String?` on `PaybackRequest`.
- [x] T006 Write `prisma/sql/068_petty_cash_payback.sql` — fully idempotent: guarded `CREATE TYPE`, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, the `PettyCashPeriod_one_open_per_account` partial unique index, the `ExpenseEvidence_one_parent` check constraint added only when absent from `pg_constraint`, and the section/category seeds via `INSERT … ON CONFLICT (name) DO NOTHING` (research R7).
- [x] T007 Verify T006 against a throwaway local Postgres, not by reading it: apply it twice (the second run must be a clean no-op), then query the seeded rows, force a second `OPEN` period to prove the partial index refuses it, and force both a two-parent and a zero-parent `ExpenseEvidence` insert to prove the check constraint refuses them (quickstart.md §2). Never point this at Neon.
- [x] T008 Write `src/lib/finance/pettycash.ts` — the ONE derivation. Pure, no Prisma: `periodReconciliation(...)` returning the `PeriodFigures` shape in data-model.md with `budgetRemaining` and `closingBalance` **signed**, `accountBalance(...)`, and `describeBalance(closing, custodianName)` returning the sentence every screen prints.
- [x] T009 [P] Write `src/lib/finance/access.ts` — `canManagePettyCash`, `canSeePettyCashAccount`, `canWritePettyCashLine`, `canReviewPayback`, `canManageExpenseLists`, composed from `isFinance`/`isSuperUser` in `src/lib/roles.ts`. Every page, action, nav entry and serving route asks these and nothing else (research R4).
- [x] T010 [P] Write `src/lib/finance/evidence.ts` — server-side validation (image/PDF only, ≤ 10 MB each, ≤ 10 files per record) and the private-blob `put()` helper pathing `petty-cash/<accountId>/…` and `payback/<userId>/…` with `addRandomSuffix: true` (research R6).
- [x] T011 [P] Add `tests/pettycash-reconcile.test.ts` (built at that path, not the `tests/finance/` one first planned — the suite is flat) covering the three workbook cases in quickstart.md §1: `JUL-AUG` (−4,617.16), `March` (−3,444.54, same direction), and the `Oct-Nov` overspend of −229.23 carried forward — plus a `COMPANY_TRANSFER` line raising expenses without moving the balance.
- [x] T012 Run `npx tsc --noEmit`, then commit Phase 1–2 as one commit containing the schema change **and** `prisma/sql/067_*.sql` together (constitution: migrations ship with the schema).

---

## Phase 3: Gate G2 — Mockups (BLOCKING, no component before this passes)

**Constitution II is non-negotiable: no `.tsx` file for this feature may be created until the CEO has
explicitly signed off on the mockups.**

- [x] T013 Build five self-contained static HTML mockups in `design-mockups/petty-cash-payback/2026-08-24_*.html`, navy/gold, no external assets: (1) petty cash accounts list, (2) account page with the reconciliation panel + line table, (3) add/edit line form with evidence attach, (4) payback request form + "my requests", (5) Finance payback review queue.
- [x] T014 Publish the mockups as an Artifact and **wait for the CEO's explicit approval**. Do not proceed past this task on any assumption of approval.
- [x] T015 Record the approved version in `specs/040-petty-cash-payback/plan.md` (gate G2 → passed, with the mockup filenames), and fold any requested changes back into the mockups before proceeding.

---

## Phase 4: User Story 4 — Accounts, funding and lists (P2, built first)

**Goal**: Finance can create an account with a custodian, open a period, record funding; a Super User
maintains the classification lists.

**Independent test**: Create an account, record a 9,000.00 top-up, see the balance read 9,000.00; add
a category and see it offered on a new line while an archived one is not.

- [x] T016 [US4] Create `src/app/(app)/petty-cash/finance-actions.ts` with `createAccount`, `setCustodian`, `archiveAccount` — guarded by `canManagePettyCash`, custodian must be an `ACTIVE` user, archiving refused while an open period exists (contracts/server-actions.md).
- [x] T017 [US4] Add `openPeriod` to `finance-actions.ts` — takes the account row `FOR UPDATE`, sets `openingBalance` from the previous period's closing via `pettycash.ts`, refuses a second open period with a sentence (not a constraint error), and refuses an overlapping window.
- [x] T018 [US4] Add `recordFunding` to `finance-actions.ts` — `TOP_UP`/`RETURN`, amount always positive with direction from the type, date not in the future, account row locked.
- [x] T019 [US4] Create `src/app/(app)/petty-cash/page.tsx` — accounts with signed balance and current-period state; every account for Finance, only their own for a custodian; "New account" under `canManagePettyCash` only.
- [x] T020 [P] [US4] Create `src/components/pettycash/FinancePanel.tsx` per the approved mockups — built as ONE Finance block (funding + the period lifecycle) rather than the two separate components first planned, because they are the same audience and the same panel on screen; the account form stayed inline on the accounts page, where it is a single disclosure.
- [x] T021 [P] [US4] Create `src/app/(app)/admin/expense-lists/page.tsx` and `actions.ts` — add/rename/archive/restore for sections and categories, guarded by `canManageExpenseLists` (Super User only).
- [x] T022 [US4] Snapshot `src/components/AppShell.tsx` to `ui-versions/AppShell/2026-08-24_pre-petty-cash-nav.tsx`, **then** add the "Petty cash" nav entry gated by the same derivation the page uses, and the admin link to Expense lists.

---

## Phase 5: User Story 1 — The custodian logs a spend (P1)

**Goal**: A custodian logs each spend with its receipt from their phone; the balance moves.

**Independent test**: Add a `FLOAT` line with a receipt → balance falls by the amount; add a
`COMPANY_TRANSFER` line → expenses rise, balance unchanged; a line with no evidence is flagged.

- [x] T023 [US1] Create `src/app/(app)/petty-cash/[accountId]/page.tsx` — period picker, line table, gated by `canSeePettyCashAccount`, redirecting to `/dashboard` otherwise; `force-dynamic`.
- [x] T024 [US1] Create `src/app/(app)/petty-cash/actions.ts` with `addLine` — full validation table from contracts/server-actions.md, account row locked, and the period's `OPEN` status **re-checked under the lock** so a line can never land in a period being closed.
- [x] T025 [US1] Add `editLine` and `deleteLine` to `actions.ts` — refused once the period is `CLOSED`; `deleteLine` writes a `PettyCashLineDeletion` snapshot in the same transaction (FR-017).
- [x] T026 [US1] Add `addEvidence` and `removeEvidence` to `actions.ts` — evidence may be **added** to a line in a closed period (it changes no figure) but never removed from one.
- [x] T027 [P] [US1] Create `src/components/pettycash/LineForm.tsx` — the fields in the approved mockup, multi-file attach with the 10 MB / image-or-PDF limits stated in the UI, amount input accepting two decimals.
- [x] T028 [P] [US1] Create `src/components/pettycash/LineTable.tsx` — lines with a *missing receipt* flag (derived, never stored), an *outside this period* flag for a line dated beyond the window, and evidence links to the serving route.
- [x] T029 [US1] Create `src/app/api/expense-evidence/[id]/route.ts` — re-decide access at the door via `access.ts`; uploader, record owner, account custodian, Finance or Super User may read; everyone else and every missing record gets **404, never 403** (research R5). Stream via `streamPrivateBlob`.
- [x] T030 [US1] Refuse new lines on an account whose custodian is no longer `ACTIVE`, with the sentence from the contract (FR-005).

---

## Phase 6: User Story 2 — Finance reconciles and closes (P1)

**Goal**: One panel of figures everyone reads the same way; closing locks the period and carries the
balance forward.

**Independent test**: 9,000.00 top-up against 13,617.16 of float spend reads −4,617.16 as "the
company owes the custodian"; closing carries that into the next period's opening balance.

- [x] T031 [US2] Create `src/components/pettycash/ReconciliationPanel.tsx` — opening, float advanced, spent from float, spent by company transfer, total expenses, budget and budget remaining (signed, overspend shown as overspend), closing balance, and the `describeBalance` sentence. Every figure comes from `pettycash.ts`; the component computes nothing.
- [x] T032 [US2] Add `submitPeriod` to `src/app/(app)/petty-cash/actions.ts` — `OPEN → SUBMITTED`, custodian or Finance, recording who and when.
- [x] T033 [US2] Add `closePeriod` to `finance-actions.ts` — account row locked, figures **recomputed under the lock** rather than trusted from the rendered page, missing-receipt lines listed and refused unless acknowledged, the acknowledgement plus the acknowledged line ids stored, then `CLOSED` with actor and timestamp.
- [x] T034 [US2] Add `reopenPeriod` to `finance-actions.ts` — reason required, and the following period's opening balance re-derived in the same transaction (FR-012).
- [x] T035 [US2] Enforce the closed-period lock across every write path — `addLine`, `editLine`, `deleteLine`, `recordFunding` — so the refusal is stated identically wherever it is hit.
- [x] T036 [P] [US2] Add `AutoRefresh` to `/petty-cash/[accountId]` (the existing component) — a custodian adds lines on a phone while Finance holds the page open on a laptop.

---

## Phase 7: User Story 3 — Payback requests (P1)

**Goal**: Anyone can ask for their money back with evidence; Finance approves, rejects or pays.

**Independent test**: Submit without a file → refused; with a file → in Finance's queue; reject with a
reason → requester sees and is emailed; approve then record payment → requester emailed; another
employee sees none of it.

- [x] T037 [US3] Create `src/app/(app)/payback/page.tsx` and `actions.ts` — `submitRequest` (requester from the session, never the form; 1–10 evidence files **required**) and `withdrawRequest` (own, `SUBMITTED` only).
- [x] T038 [P] [US3] Create `src/components/payback/RequestForm.tsx` and `MyRequests.tsx` per the approved mockups — status, decision reason, and payment details where present.
- [x] T039 [US3] Create `src/app/(app)/finance/payback-actions.ts` — `approveRequest`, `rejectRequest` (reason required), `recordPayment` (amount > 0, transfer date not in the future compared against end-of-today), `correctPayment` (amount/date only, no status change, no `paidById`/`paidAt` change, **no email**).
- [x] T040 [US3] Create `src/components/payback/ReviewQueue.tsx` — Submitted first, then awaiting payment, then history; evidence one click away.
- [x] T041 [US3] Implement the duplicate hint (FR-022) — when the requester custodians an active account, show their petty cash lines with the same amount within ±7 days beside the request. Read-only information for Finance; it never blocks a write.
- [x] T042 [US3] Snapshot `src/app/(app)/finance/page.tsx` to `ui-versions/finance-page/2026-08-24_pre-payback-tab.tsx`, **then** add the "Payback requests" sub-tab beside Confirmation queue and Recoveries, with `AutoRefresh`.
- [x] T043 [P] [US3] Add `paybackSubmittedToFinance`, `paybackRejectedToEmployee` and `paybackPaidToEmployee` to `src/lib/email/templates.ts`, matching the existing claim templates' tone and markup.
- [x] T044 [US3] Wire the three sends — after the DB write, never inside the transaction, honouring the master toggle and the configured Finance inbox, and swallowing failures so no state change is ever blocked (FR-029).
- [x] T045 [US3] Add the "Payback" nav entry for all employees in `AppShell.tsx` (snapshot already taken in T022).

---

## Phase 8: Polish & governance

- [x] T046 Amend `.specify/memory/constitution.md`: email widens to a **third** workflow (payback, CEO-approved 2026-08-24) **and** correct the Roles line to include `FINANCE`, which has existed since spec 020. Include the sync-impact report header the constitution's own convention requires.
- [x] T047 [P] Update `CLAUDE.md` — the third email workflow, and a new house-rule entry for what this feature taught: a reconciliation figure is derived once, kept signed, and stated in words, because the source workbook inverted its own sign between tabs.
- [x] T048 [P] Update `PROJECT_DETAILS.md` with the new models, routes, serving route and the money representation (Decimal storage, piastres arithmetic).
- [x] T049 [P] Update `IMPLEMENTATION_PROGRESS.md` with spec 040 as built, and `IMPLEMENTATION_PLAN.md` if any decision changed during implementation.
- [x] T050 Set `specs/040-petty-cash-payback/spec.md` **Status** to Implemented and tick `checklists/requirements.md` where implementation confirmed it.
- [ ] T051 Run `npx tsc --noEmit` and `npm run build` — both clean — then walk the quickstart §3 end-to-end scenarios in `npm run dev`, including the 404-not-403 evidence check and the email-off pass.
- [ ] T052 Push, then check the deploy log's `[apply-sql]` lines to confirm `068_petty_cash_payback.sql` applied, and report the result to the CEO in one line (constitution: the deploy-time run is verified, not assumed).

---

## Dependencies

```text
Phase 1 (T001–T002)
      ↓
Phase 2 — G1 data layer (T003–T012)          ← blocks everything below
      ↓
Phase 3 — G2 mockups approved (T013–T015)    ← blocks every .tsx file below
      ↓
Phase 4 — US4 accounts/funding/lists (T016–T022)
      ↓                              ↘
Phase 5 — US1 lines (T023–T030)       Phase 7 — US3 payback (T037–T045)
      ↓                                   (independent of petty cash except T041)
Phase 6 — US2 reconciliation (T031–T036)
      ↓
Phase 8 — polish & governance (T046–T052)
```

- **US3 (payback) is independent of US1/US2** apart from the duplicate hint (T041), which degrades to
  showing nothing if petty cash is not yet built. It can be delivered in parallel with Phase 5–6 by a
  second pass, or shipped first if priorities change.
- **T029 (the evidence route) serves both features** — it is placed in US1 because that is where it is
  first needed; US3 depends on it.

## Parallel opportunities

- Phase 2: T009, T010, T011 are independent files once T008's shape is fixed.
- Phase 4: T020 and T021 touch different trees.
- Phase 5: T027 and T028 are separate components.
- Phase 7: T038 and T043 are independent of the actions.
- Phase 8: T047, T048, T049 are three different documents.

## MVP scope

**Phases 1–6** — petty cash end to end (log, reconcile, close, carry forward) is the smaller half and
replaces the workbook by itself. Payback (Phase 7) is the natural second delivery and needs nothing
from the first beyond the shared evidence route.
