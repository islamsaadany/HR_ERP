# Implementation Plan: Petty Cash & Payback Requests

**Branch**: `claude/finance-petty-cash-payroll-we46wn` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-petty-cash-payback/spec.md`

## Summary

Add two Finance surfaces to the existing app. **Petty cash**: accounts with a named custodian and a
signed balance, periods that close with one shared arithmetic and carry their closing balance
forward, spend lines with attached receipts logged by the custodian as they spend. **Payback
requests**: any employee submits an out-of-pocket spend with evidence; Finance approves, rejects
with a reason, or records payment.

The technical shape is dictated by what already exists. Nothing here is new ground for the codebase:
the `FINANCE` role and `requireFinance()` guard, the private-blob upload plus access-checked serving
route used for benefit-claim proof, the fire-and-forget Resend client with its master toggle, the
`formatEGP2`/`formatDate` display standards, and the navy/gold admin panel conventions all carry
over unchanged. The one genuinely new decision is how two-decimal money is represented, resolved in
[research.md](./research.md): `Decimal(10,2)` in Postgres (matching `MedicalRateBand.annualPremium`),
integer **piastres** for every calculation in TypeScript, converted at one boundary inside the single
reconciliation module.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 15 (App Router), React 19

**Primary Dependencies**: Prisma, NextAuth v5 (credentials), Tailwind CSS, `@vercel/blob`, `resend`

**Storage**: PostgreSQL (Neon). Schema changes ship with a matching idempotent
`prisma/sql/0NN_*.sql` in the same commit, applied at deploy by `scripts/apply-sql.mjs`
(next free number: **067**)

**Testing**: No testing regime (constitution V). `npx tsc --noEmit` and `npm run build` must pass.
The reconciliation arithmetic is pure and gets unit coverage under `tests/` as a tool, not a gate

**Target Platform**: Vercel (server components + server actions); custodians log spend from a phone

**Project Type**: Web application — single Next.js app, no separate frontend/backend

**Performance Goals**: Server-rendered pages; a period holds tens of lines, an account a few
periods a year. No pagination needed at this scale; list queries stay indexed by account and period

**Constraints**: Money is EGP to exactly two decimals, never float arithmetic. Every evidence file
is private and streamed through an authorization check. Email never blocks a state change

**Scale/Scope**: ~5 petty cash accounts, ~12 periods/account/year, ~30 lines/period, company-wide
payback requests. 6 new pages/surfaces, 1 new serving route, ~10 new models

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| **I. Align Before Building** | ✅ Pass | Eight scoping decisions answered by the CEO before drafting (2026-08-24), plus his ruling on the submitter/approver exception. No code until the spec was signed off. |
| **II. UI Changes Require Approval** | ⚠️ Gated | Every screen here is new UI. **Static HTML mockups under `design-mockups/petty-cash-payback/` must be approved before any component is written** — the plan schedules this as a hard gate between the data layer and the UI layer. Existing files that gain a tab or nav entry get a `ui-versions/` snapshot first. |
| **III. Money & Rules Server-Authoritative** | ✅ Pass | Balance and reconciliation derive in **one** module (`src/lib/finance/pettycash.ts`) consulted by every page, action and export; every state transition is validated in a server action behind a role/ownership guard; the client computes nothing it is trusted on. |
| **IV. Spec-Driven & Docs Move With Code** | ✅ Pass | Spec written first; `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, `IMPLEMENTATION_PLAN.md` and `CLAUDE.md` update in the same commits as the code. |
| **V. Engineered Enough, Explicit Over Clever** | ✅ Pass | One derivation, no abstraction over a single caller, edge cases enumerated in the spec and mapped to concrete refusals in `contracts/`. |
| **Email limited to two workflows** | ⚠️ Amendment | This is the third (payback). Requested by the CEO on 2026-08-24; the amendment to `.specify/memory/constitution.md` and `CLAUDE.md` lands in the same commit as the email code, together with the correction adding `FINANCE` to the constitution's roles line. |
| **Migrations are Claude's job** | ✅ Pass | `prisma/sql/068_petty_cash_payback.sql`, idempotent, committed with the schema change; the deploy log's `[apply-sql]` lines are checked and reported. |

**No unjustified violations.** The two ⚠️ rows are a scheduled gate and a CEO-authorised amendment,
not shortcuts — both are tracked as tasks, so neither can be forgotten.

## Project Structure

### Documentation (this feature)

```text
specs/040-petty-cash-payback/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0 — the decisions that were not obvious
├── data-model.md        # Phase 1 — models, enums, indexes, state machines
├── quickstart.md        # Phase 1 — how to prove it works
├── contracts/
│   ├── server-actions.md   # Every action: inputs, guards, refusals
│   └── routes.md           # Pages and the evidence serving route
└── checklists/requirements.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                      # + 9 models, 5 enums (see data-model.md)
└── sql/068_petty_cash_payback.sql     # idempotent, same commit

src/
├── lib/
│   ├── finance/
│   │   ├── money.ts                   # piastres ↔ Decimal, the ONLY arithmetic boundary
│   │   ├── pettycash.ts               # THE derivation: balance + period reconciliation
│   │   ├── access.ts                  # canSeePettyCashAccount / canManagePettyCash — one source
│   │   └── evidence.ts                # upload validation (type, size), shared by both features
│   ├── email/templates.ts             # + paybackSubmittedToFinance / Rejected / Paid
│   └── roles.ts                       # unchanged; access.ts composes isFinance/isSuperUser
├── app/
│   ├── (app)/
│   │   ├── petty-cash/                # ONE surface: custodian and Finance, gated per account
│   │   │   ├── page.tsx               #   accounts list (all for Finance, own for a custodian)
│   │   │   ├── [accountId]/page.tsx   #   period reconciliation + lines
│   │   │   ├── actions.ts             #   line add/edit/delete, submit period
│   │   │   └── finance-actions.ts     #   account/custodian/funding/open/close/reopen (Finance)
│   │   ├── payback/
│   │   │   ├── page.tsx               #   the employee's own requests + new request
│   │   │   └── actions.ts             #   submit, withdraw own
│   │   ├── finance/
│   │   │   ├── page.tsx               #   + "Payback requests" sub-tab
│   │   │   └── payback-actions.ts     #   approve, reject, record payment, correct payment
│   │   └── admin/expense-lists/       #   Super User: sections & categories
│   │       ├── page.tsx
│   │       └── actions.ts
│   └── api/expense-evidence/[id]/route.ts   # access-checked stream; 404, never 403
├── components/
│   ├── pettycash/                     # ReconciliationPanel, LineTable, LineForm, FundingPanel…
│   ├── payback/                       # RequestForm, MyRequests, ReviewQueue
│   └── AppShell.tsx                   # + nav entries (snapshot to ui-versions/ first)
└── design-mockups/petty-cash-payback/ # approved HTML mockups (gate before components)
```

**Structure Decision**: The existing single-app layout is kept exactly as it is. Petty cash gets
**one** set of pages rather than a custodian copy and a Finance copy — the same page asks
`canSeePettyCashAccount` and shows Finance-only controls (funding, close, reopen) when the viewer
holds them. Two parallel surfaces over the same data would be the second copy of an access rule,
which is the failure mode `CLAUDE.md` names repeatedly.

## Key design decisions

1. **One derivation, and it is pure.** `pettycash.ts` exports `accountBalance(...)` and
   `periodReconciliation(...)` over plain inputs — no Prisma calls inside — so the pages, the close
   action, and any future export all read the same numbers, and the arithmetic is testable without a
   database. Every figure that can go negative stays signed and is rendered with an explicit
   sentence ("Forefront owes Raneem 4,617.16"), never floored.

2. **The lock protects state, not a ceiling.** Petty cash has no ceiling to breach — a float can
   legitimately go negative. The invariants worth a `SELECT … FOR UPDATE` on the account row are
   *one open period per account* and *no line lands in a period that is closing*. Both writes take
   the account lock; nothing else does.

3. **Evidence is one model with two optional parents.** A spend line and a payback request each own
   files with identical rules, so `ExpenseEvidence` carries a nullable FK to each and a check
   constraint that exactly one is set. One upload validator, one serving route, one access rule —
   re-decided at the door and answering **404** for anyone not entitled.

4. **The payment record is shaped for spec 041 now.** `PaybackRequest` gets `paymentRunId String?`
   (no relation yet, no run model in this feature) and its status enum is written so 040 inserts
   `PAYMENT_SUBMITTED` between `APPROVED` and `PAID` without a data migration. The column is
   documented as reserved so nobody repurposes it.

5. **Sections and categories are flat, independent lists.** The workbook pairs them freely
   (`Team/office supply`, `Community/Media Coverage`) and leaves Category blank half the time, so
   Section is required, Category optional, and neither constrains the other. Archiving hides a value
   from new records without touching history.

## Phase gates

| Gate | What must be true to pass |
|---|---|
| **G1 — Data layer** | ✅ **Passed 2026-08-24.** Schema + `067_*.sql` committed together; migration applied twice against a throwaway local Postgres with its partial index and check constraint proven; derivation written and covered by tests over the workbook's own figures; `npx tsc --noEmit` clean. |
| **G2 — Mockups approved** | ✅ **Passed 2026-08-24.** `design-mockups/petty-cash-payback/2026-08-24_petty-cash-and-payback.html` — six screens in one page (accounts, account + reconciliation, log a spend, closing a period, the employee's requests, Finance's queue) rather than five separate files, so the CEO reviewed one artifact. Signed off with all three open questions answered as drawn: number + standing column, the custodian sees the budget, and a missing receipt is acknowledged rather than blocking. |
| **G3 — Feature complete** | ✅ **Passed 2026-08-24.** All FRs implemented; `npx tsc --noEmit` and `npm run build` clean; 133 tests pass; the four steering docs, the spec and the constitution amendment all landed. |
| **G4 — Deployed** | ⏳ **Open.** Awaiting the deploy: the build log's `[apply-sql]` lines must confirm `067` applied, and the result be reported in one line. |

## Complexity Tracking

*No constitution violations require justification.* The two flagged rows are a scheduled approval
gate (mockups) and an amendment the CEO explicitly requested (the third email workflow) — both are
tracked as tasks rather than waived.
