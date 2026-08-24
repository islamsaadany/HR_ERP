# Phase 0 Research: Petty Cash & Payback Requests

Only the questions whose answer was not already settled by the existing codebase are recorded here.
Anything the app already does one way (dates as dd/mm/yyyy, private blobs streamed through a check,
fire-and-forget email, navy/gold, server actions behind role guards) is reused without re-deciding.

---

## R1 — How is two-decimal money represented?

**Decision**: Store `Decimal(10,2)` in Postgres; do **every** calculation in integer **piastres**
(1 EGP = 100 piastres) inside `src/lib/finance/money.ts`; convert at that one boundary.

**Rationale**: The codebase already has both precedents — benefits money is `Int` EGP, and
`MedicalRateBand.annualPremium` is `Decimal(10,2)` because the operator's figures matter to the cent.
Petty cash is the second kind: the workbook's own totals carry cents (9,726.26 · 3,444.54 · 482.56),
and a reconciliation that rounds is a reconciliation that is wrong. `Decimal` keeps the column
readable to anyone querying Neon directly, which matters for a ledger Finance will inspect. But
Prisma hands `Decimal` to JavaScript where naive `+` on the coerced numbers reintroduces binary
float error precisely in the place it does the most damage (a closing balance that is out by
0.01 destroys trust in the whole screen). Integer piastres make every sum exact, and doing the
conversion in one module means there is exactly one place to be right.

**Alternatives considered**:
- *Store `Int` piastres directly*: exact and simplest in code, but a raw Neon query then shows
  `972626` for 9,726.26, and every ad-hoc SQL report Finance writes has to remember to divide.
  Rejected for readability of the ledger.
- *Use Decimal.js arithmetic throughout*: correct, but spreads a money type through components and
  serialization boundaries in a codebase that has never needed one. Rejected as over-abstraction
  (constitution V).
- *Let Postgres do all the arithmetic via `SUM()`*: exact, and used where a total is a pure
  aggregate — but the reconciliation mixes stored, derived and carried figures, and pushing it into
  SQL would put the one derivation somewhere it cannot be unit-tested. Aggregates are still computed
  in SQL where they are trivially aggregates; the assembly happens in the module.

---

## R2 — What actually needs locking, given there is no ceiling?

**Decision**: Take `SELECT … FOR UPDATE` on the `PettyCashAccount` row inside the transaction for
exactly two operations — **closing/reopening a period** and **writing a line or funding row** — and
nowhere else.

**Rationale**: `CLAUDE.md`'s money-lock rule exists because a ceiling can be breached by two writes
that each pass the check. Petty cash has **no ceiling**: a float is allowed to go negative, that is
what "amount to reimburse" means. Copying the ceiling pattern here without asking what it protects
would be cargo-culting. What *can* actually break is state: a line inserted while Finance is closing
the period lands in a closed period and silently changes a balance somebody has already signed off;
and two "open a period" calls race into two open periods, after which no line has an unambiguous
home. Both are settled by serialising on the account row — the same narrow, per-subject lock the
benefits module landed on after a Serializable transaction proved too broad.

**Alternatives considered**:
- *Serializable transactions*: rejected for the reason already learned in this codebase — it aborts
  unrelated subjects' writes (1 of 6 succeeded); a per-row lock gave 6 of 6.
- *A unique partial index alone* (`WHERE status = 'OPEN'`): necessary and included, but it only
  stops the second open period; it does nothing about a line racing a close. Both are used.

---

## R3 — Does a period own its lines, or is it a date window over them?

**Decision**: A line belongs to a period by an explicit `periodId`, chosen at entry (defaulting to
the account's open period). Funding rows do the same.

**Rationale**: The workbook is organised by tab, not by date — its lines are frequently undated
("not paid yet", "Sep", "10/02, 03/02") or dated outside the tab they sit on, because a receipt
surfaces late. If a period were a date window, those lines would silently move between periods or
vanish from both, and a closed period's figures could change afterwards. An explicit parent makes
"which period does this belong to" a stated fact rather than a computed guess, and lets the UI flag
a line dated outside its window as information rather than refusing it (spec edge case). Consistency
matters too: applying it to lines but deriving funding by date would give one screen two rules.

**Alternatives considered**:
- *Date window*: rejected above.
- *Both — explicit with a date-based default and a nightly reassignment*: rejected outright; a job
  that moves money between closed periods is the opposite of an audit trail.

---

## R4 — One surface for custodian and Finance, or two?

**Decision**: One set of pages under `/petty-cash`, gated per account by a single derivation
`canSeePettyCashAccount(user, account)` = Finance ∨ Super User ∨ the account's custodian. Finance-only
controls (record funding, close, reopen, change custodian) are gated by `canManagePettyCash(user)`
inside the same page.

**Rationale**: The alternative is the same tables, totals and evidence links written twice, guarded
by two rules that will drift — the exact failure `CLAUDE.md` documents for the Learning module ("one
derivation asked by the pages, the actions, the sidebar door and the serving routes alike"). One
surface also means the custodian and Finance are literally looking at the same numbers when they
disagree about a figure, which is the point of replacing an emailed spreadsheet.

**Alternatives considered**:
- *Custodian pages under `/petty-cash`, Finance pages under `/finance/petty-cash`*: rejected — two
  copies of one access rule and two copies of the reconciliation panel.
- *Everything under `/finance`*: rejected — a custodian is an ordinary employee, and putting them
  behind a Finance-labelled door misrepresents what they can do and clutters the Finance nav.

---

## R5 — 403 or 404 on an evidence file the viewer may not see?

**Decision**: **404**, for the new `/api/expense-evidence/[id]` route.

**Rationale**: This is settled house doctrine — `CLAUDE.md` states it for the Learning documents
route: "forbidden" confirms the file exists, so an unauthorised viewer learns that employee X filed
a receipt even when they cannot open it. Receipts carry vendor, amount and date; existence alone is
information.

**Note on existing code, not changed here**: `src/app/api/claims/[id]/proof/route.ts` returns **403**
in the same situation, predating the rule. It is out of scope for this feature — flagged so the
inconsistency is recorded rather than discovered later as a surprise, and so nobody "fixes" the new
route to match the old one.

---

## R6 — What are the evidence limits, and are they new?

**Decision**: Reuse the benefit-claim proof limits verbatim — **10 MB per file**, images and PDF
only — validated server-side in `lib/finance/evidence.ts` before anything is stored, with the limit
and accepted types shown in the UI. Files go to the **private** blob store with
`addRandomSuffix: true`, pathed `petty-cash/<accountId>/…` and `payback/<userId>/…`.

**Rationale**: `claim-actions.ts` already enforces exactly this for the same kind of artefact (a
receipt proving a payment), and a second, different limit for the same kind of file is a rule nobody
can remember. Multiple files per record is the only difference — the workbook routinely lists two or
three receipts for one purchase ("IMG_1006.JPG / IMG_1005.JPG") — so the limit is per file, with a
cap of 10 files per record to bound a runaway upload.

---

## R7 — Seeded sections and categories

**Decision**: Seed **sections** `Marketing · Community · Team` and **categories** `Office supply ·
Media coverage · Printings · Transportation · Catering · Venue · Booking · Gifts · Logistics · Tools
· Assets · Stationery · Employer branding · Social media · Team`, taken from the values the workbook
actually uses, normalised to sentence case. Both lists archivable, neither constraining the other.

**Rationale**: These are the operator's own words, so Finance and the custodian recognise them
immediately, and seeding them means the feature is usable the moment it deploys rather than after
someone types a taxonomy. Sentence-case normalisation is the only editorialising — the workbook
carries `office supply`, `Office supply`, ` Stationary` and `Team` as separate strings, which is
what an unmanaged free-text column does over two years.

---

## R8 — What must be shaped now for spec 040, without building it?

**Decision**: `PaybackRequest` carries `paymentRunId String?` (reserved, no relation, no index yet)
and its status enum is ordered so `PAYMENT_SUBMITTED` slots between `APPROVED` and `PAID`. Nothing
else is anticipated.

**Rationale**: Spec 040 changes exactly one transition — a request becomes `PAID` when the CEO
approves the run carrying it, not when Finance records the transfer. Reserving the column costs one
nullable field now and saves a data migration later. Anticipating anything further (a run model, an
approval state machine) would be building 040 inside 039, which the CEO explicitly scoped apart.
