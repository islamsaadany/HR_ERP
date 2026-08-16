# Implementation Plan: Medical Policy Year

**Branch**: `claude/employee-password-reset-hx1ugp` (spec dir `027-medical-policy-year`) | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/027-medical-policy-year/spec.md`

## Summary

The medical insurance term (1 Jun 2026 → 30 Jun 2027) does not follow the benefits plan year, so a premium sized to the policy is charged against a pool sized to the cycle. Give the policy its **own window and its own commitment**, and split each committed premium **across the benefits cycles it overlaps** — each cycle's pool absorbs only its months, the remainder is charged when the next cycle opens, and the charges sum back to the committed premium exactly.

Three pieces of work, in dependency order: a policy-year record the commitment hangs off; an overlap-and-charge calculation that is pure and testable; and the surfaces that read a *cycle charge* where they currently read a *premium*.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router) + React 19

**Primary Dependencies**: Prisma, PostgreSQL (Neon)

**Storage**: PostgreSQL. New tables + a hand-runnable `prisma/sql/047_*.sql`, applied by `scripts/apply-sql.mjs` at deploy or pasted into Neon.

**Testing**: No test runner in this project. Verification is `npx tsc --noEmit`, `npm run build`, pure-function checks executed with `tsx` against a throwaway local Postgres, and a Chromium pass over the affected pages. This matches how specs 018/023/028 were verified.

**Target Platform**: Vercel (server components + server actions)

**Project Type**: Web application

**Performance Goals**: Not a factor — the calculation is arithmetic over a handful of rows per employee, run at commit time and at cycle open.

**Constraints**: Money rules server-authoritative. Charges across cycles must sum to the committed premium exactly (no rounding drift). Behaviour with no policy window configured must be byte-identical to today.

**Scale/Scope**: ~50–200 employees, one active policy term, one open plan year.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| **I. Align Before Building** (non-negotiable) | ✅ Pass | The charging model was proposed, its alternative (medical outside the pool) offered, and the product owner chose overlap-charging before this plan was written. |
| **II. UI Changes Require Explicit Approval** | ⚠️ **Gate open** | This feature changes what the employee's pool card and HR's commitment list display. **A mockup must be approved before any component is edited.** Phase 1 identifies exactly which surfaces; no UI work starts until sign-off. |
| **III. Money & Rules Server-Authoritative** (non-negotiable) | ✅ Pass by design | Splitting happens at commit and at cycle open, both server-side. The client never computes or submits a charge. The pure functions live in `src/lib/benefits/` alongside the existing rule engine. |
| **IV. Spec-Driven & Docs Move With Code** | ✅ Pass | Spec exists and is current; `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, and the decisions log update in the implementing commit, with `prisma/sql/047_*.sql` regenerated alongside any schema change. |
| **V. Engineered Enough, Explicit Over Clever** | ✅ Pass | The split is a pure function over two date ranges and an integer. No inference from nullable columns; a policy term is an explicit record. |

**Post-Phase-1 re-check**: still passing. The design adds two tables and one pure module rather than threading nullable dates through existing ones, and the "no window configured" path returns today's behaviour by construction (see `research.md` D1 and D6).

## Project Structure

### Documentation (this feature)

```text
specs/027-medical-policy-year/
├── plan.md              # This file
├── research.md          # Phase 0 — the seven decisions this design rests on
├── data-model.md        # Phase 1 — entities, fields, invariants
├── quickstart.md        # Phase 1 — how to prove it works
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source code (repository root)

```text
src/lib/benefits/
  policy-year.ts        # NEW — pure: month counting, overlap, premium split
  proration.ts          # CHANGED — uncapped month helper; fraction clamped explicitly
  config.ts             # CHANGED — read the active policy year + a commitment's charges
src/app/(app)/benefits/
  actions.ts            # CHANGED — commitMedical writes commitment + cycle charges
  page.tsx              # CHANGED — pool reads THIS CYCLE's charge, not the full premium
src/app/(app)/admin/benefits/
  actions.ts            # CHANGED — editing a commitment re-splits it
  page.tsx              # CHANGED — show full premium + per-cycle charges
  plan-year-actions.ts  # CHANGED — opening a cycle applies carried charges
prisma/
  schema.prisma         # CHANGED — MedicalPolicyYear, MedicalCycleCharge
  sql/047_medical_policy_year.sql   # NEW
```

**Structure decision**: The split calculation goes in a new pure module (`policy-year.ts`) rather than into `rules.ts`, which is already the home of the claim/cap rules. Keeping it pure is what makes the exact-sum invariant cheaply provable with `tsx` — the pattern `rates.ts` and `proration.ts` already follow.

## Phase 0 — Research

Complete. See [research.md](./research.md). Seven decisions, the two load-bearing ones being:

- **D2 — the commitment moves to the policy year.** Committing "once per plan year" is what makes a mid-cycle renewal invisible. `MedicalCommitment` is keyed to the policy term instead, and cycle charges hang off it.
- **D4 — uncapping month counts is dangerous and must be surgical.** `remainingWholeMonths` stops at 12 today, and `poolCycleFraction` silently relies on that to avoid handing out a >100% pool. Uncapping it globally would inflate every pool on a 13-month cycle. A separate uncapped helper is added for policy terms and the pool fraction is clamped explicitly.

## Phase 1 — Design

Complete. See [data-model.md](./data-model.md) and [quickstart.md](./quickstart.md).

**Contracts**: none generated. The app has no external API surface for this feature — commitment and cycle-open both run as server actions inside the app. The "contract" that matters is the invariant set in `data-model.md`, which `quickstart.md` shows how to execute.

## Complexity Tracking

| Addition | Why it's necessary | Simpler alternative rejected because |
|---|---|---|
| `MedicalPolicyYear` table | The policy term must outlive and cross benefits cycles | Nullable `medicalStartDate`/`medicalEndDate` on `PlanYear` ties the policy to a cycle it is meant to be independent of, and gives no home for a commitment that spans two cycles |
| `MedicalCycleCharge` table | The per-cycle amount must be stored, not derived, so a charge already applied to a closed cycle can never be retroactively recomputed | Deriving the charge on read would silently restate history whenever a policy window or premium changed |
| New `policy-year.ts` module | Keeps the split pure and provable | Inlining into `actions.ts` would put the exact-sum invariant behind a database call and a session |

## Open items carried into implementation

1. **The pool-ceiling cap applies to the per-cycle charge, not the full premium.** Assumed in the spec with reasoning, confirmed as the design in research D5. Worth one explicit confirmation from the product owner before the commit path is written, because it changes what an employee owes.
2. **A departed employee's carried charge is surfaced, not auto-applied** (research D7). The reconciliation surface is a UI decision and needs the same mockup gate as the rest.
