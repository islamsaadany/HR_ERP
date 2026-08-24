# Implementation Plan: Bank Confirmations & Monthly Salary Runs

**Branch**: `claude/finance-petty-cash-payroll-we46wn` | **Date**: 2026-08-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-transaction-approval/spec.md`

## Summary

Finance creates the transactions in the bank, ticks the same items here, and submits them for
confirmation. The appointed confirmer — the CEO — is emailed with a count, a total and a link; he
confirms them in the bank as he always has, and marks them **complete** here. Only then are the
people being paid told. A **salary run** travels the same path carrying a month, a total and a
headcount, with no per-person figure anywhere.

Nothing here gates a payment. The bank does that, on two signatures. This feature is the
notification and the record — the framing the CEO corrected twice on 2026-08-24, which is why the
words throughout are *create*, *submit*, *confirm* and *complete*, never *approve* or *send*.

Spec 040 did the groundwork: the money helpers, the access derivation, the refusal pattern and the
private-evidence route. This plan adds four models, one enum member, four surfaces and one scheduled
reminder.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 15 (App Router), React 19

**Primary Dependencies**: Prisma, NextAuth v5, Tailwind, `@vercel/blob`, `resend` — no new packages

**Storage**: PostgreSQL (Neon). Schema changes ship with `prisma/sql/068_*.sql` in the same commit,
applied at deploy (next free number: **068**)

**Testing**: No regime (constitution V). `npx tsc --noEmit` and `npm run build` must pass. The
submit/confirm rules get unit coverage because they decide who can release money

**Target Platform**: Vercel. The confirmer reads the email on a phone and taps through to one screen

**Project Type**: Web application — the existing single Next.js app

**Performance Goals**: A handful of submissions a month, tens of items each. No pagination needed

**Constraints**: No payee name or amount may appear in an email. No individual salary may be stored,
shown or exported. Email never blocks a state change. A completed record is immutable

**Scale/Scope**: ~10 submissions/month, ~12 salary runs/year, 1–2 appointed confirmers. 4 new models,
1 enum member, 4 new surfaces, 1 cron route

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design.*

| Principle | Status | How this plan satisfies it |
|---|---|---|
| **I. Align Before Building** | ✅ Pass | Twelve decisions taken with the CEO across two rounds, including his rejection of the first draft's premise. The spec was rewritten and re-read before this plan. |
| **II. UI Changes Require Approval** | ⚠️ Gated | Four new screens. **Mockups must be approved before any component is written**; existing files that gain a tab or nav entry get a `ui-versions/` snapshot first. |
| **III. Money & Rules Server-Authoritative** | ✅ Pass | Who may submit, who may confirm, and the frozen total are all decided server-side. The submission total is computed once at submission and stored; nothing recomputes it later, so the figure emailed and the figure confirmed cannot diverge. |
| **IV. Spec-Driven & Docs Move With Code** | ✅ Pass | Spec first, rewritten when the premise proved wrong; the four steering files update in the same commits. |
| **V. Engineered Enough, Explicit Over Clever** | ✅ Pass | One derivation for confirmation rights, one for the state machine; refusals as sentences; edge cases mapped to concrete messages in `contracts/`. |
| **Roles are appointments, and role-holders are implicit** | ⚠️ Deliberate departure | FR-003 makes top-level access **not** an implicit confirmer, reversing the reasoning used for Learning managers — because "payments wait for me and nobody else" would otherwise be untrue. Lock-out, the risk that pattern exists to prevent, is covered by self-appointment (FR-004). Documented in the spec, this table, and `research.md`. |
| **Email limited to three workflows** | ✅ Pass | This adds messages to the third (finance), which spec 040 already established. No fourth workflow. |
| **A scheduled job may nudge staff, never employees** | ⚠️ Amendment | The daily job gains a second audience: appointed confirmers. Same rule, wider list — recorded in the constitution alongside the code. |
| **Migrations are Claude's job** | ✅ Pass | `prisma/sql/068_*.sql`, idempotent, committed with the schema; the deploy log's `[apply-sql]` lines checked and reported. |

## Project Structure

### Documentation (this feature)

```text
specs/041-transaction-approval/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/{server-actions.md, routes.md}
└── checklists/requirements.md
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                       # + 4 models, 2 enums, 1 enum member
└── sql/069_payment_batches.sql         # idempotent, same commit

src/
├── lib/finance/
│   ├── confirmers.ts                   # THE derivation: may this person confirm?
│   ├── batches.ts                       # pure: what a submission totals, what it may become
│   └── access.ts                       # + canSubmitTransactions / canSeeSalaryRuns
├── lib/email/templates.ts              # + transactionsAwaitingConfirmation, confirmationReminder
├── app/
│   ├── (app)/
│   │   ├── confirmations/              # the confirmer's screen — one list, one tap
│   │   │   ├── page.tsx
│   │   │   ├── [id]/page.tsx
│   │   │   └── actions.ts              #   confirm, return to Finance
│   │   ├── finance/
│   │   │   ├── page.tsx                #   + "Awaiting confirmation" sub-tab
│   │   │   ├── batch-actions.ts        #   submit, withdraw
│   │   │   └── salary/page.tsx         #   the monthly run
│   │   └── admin/confirmers/           #   Super User: who confirms
│   └── api/cron/confirmations/route.ts # the daily reminder
└── components/confirmations/           # WaitingList, SubmissionDetail, SalaryRunForm
```

**Structure Decision**: The confirmer gets **their own small surface** at `/confirmations` rather
than a tab inside Finance. He is not a Finance user and should not have to walk through Finance's
workspace to do a ten-second job; the email links straight to it. Finance sees the same records from their
side, under the Payments page they already use.

## Key design decisions

1. **The total is stored, not derived.** This is the one place in the Finance module where a figure
   is deliberately *not* recomputed on read. A submission's total is what the confirmer was emailed and
   what he confirms; recomputing it later would let those two diverge, which is precisely the failure
   this feature exists to prevent. Items are locked while a submission stands, so the stored figure cannot
   go stale.

2. **Confirmation rights are exactly the appointed people.** `canConfirmBatches` reads the
   appointment table and nothing else — no role fallback. This is the documented departure; the
   comment in the code says why, so nobody "fixes" it into consistency with Learning later.

3. **One enum member, positioned deliberately.** `PaybackStatus` gains `PAYMENT_SUBMITTED` where
   spec 040 reserved room. In Postgres that is an `ALTER TYPE … ADD VALUE`, which must run outside a
   transaction block — and which must insert `BEFORE 'REJECTED'`, not before `PAID`, or the
   database's order ends up disagreeing with the order the schema declares. Verified both ways
   against a real database.

4. **Two payable kinds, one join table.** An item points at either a payback request or a float
   movement, and carries the payee, purpose and amount **as submitted**, so the history survives a
   later correction to the source record. (The `paymentRunId` columns 040 reserved turned out to be
   the wrong shape and are dropped — membership belongs with the snapshot.)

5. **The reminder reuses the existing cron.** A second route under the same secret and the same rule:
   it may nudge staff, never employees.

## Phase gates

| Gate | What must be true to pass |
|---|---|
| **G1 — Data layer** | Schema + `068_*.sql` committed; the enum change proven against a throwaway Postgres; confirmation and batch rules written and unit-covered; `npx tsc --noEmit` clean. No UI. |
| **G2 — Mockups approved** | The confirmer's screen, the submission detail, Finance's send screen and the salary run published and **explicitly signed off**. No component before this passes. |
| **G3 — Feature complete** | All FRs built; type-check and build clean; the four steering files, the spec and the constitution amendment landed. |
| **G4 — Deployed** | `[apply-sql]` confirms `068` applied; reported in one line. |

## Complexity Tracking

| Departure | Why | What was rejected |
|---|---|---|
| Top-level access is not an implicit confirmer (FR-003) | The CEO's instruction was that payments wait for him and nobody else; an implicit power held by every top-level account would make the product's own promise false | Mirroring the Learning-manager pattern, which would have been consistent but wrong here. Lock-out is instead prevented by self-appointment |
| A submission's total is stored rather than derived | The emailed figure and the confirmed figure must be the same number by construction | Recomputing on read, the house default — rejected because it reintroduces exactly the drift this feature prevents |
