# Implementation Plan: Benefits Claim-Based Living Allowance

**Branch**: `claude/benefits-basket-profile-review-u4kfhn` (spec dir `018-benefits-claim-allowance`) | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/018-benefits-claim-allowance/spec.md`

## Summary

Replace the one-shot "select → allocate → submit → then claim" flexible-benefits basket with a **living, claim-based allowance**: employees file reimbursement claims against benefits as they spend, any time the plan year is open, multiple times per benefit, with no up-front allocation or submit. Two server-enforced limits govern spend — a **50%-of-pool cap per benefit** (now for full- and part-time) applied to cumulative covered claims, and the **pool ceiling** across the committed medical premium plus all covered claims. **Medical** becomes the single once-per-year commitment (locked, HR-editable). The max-benefits **count limit is removed** (rule kept dormant in code). Cost entered is the **exact receipt value** (no 1,000-step rounding); the system computes the covered % by service type.

Data model changes (per clarify Q3=B): add a dedicated **`MedicalCommitment`** record; **remove** `BenefitSelection` / `SelectionLine`; claims link directly to the catalog item (already the case). Cutover (Q1) is a **clean wipe** of selection data (test data); HR re-enters any real prior claims via the existing manual claim-entry flow (spec 016).

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 15.5 (App Router; Server Actions)

**Primary Dependencies**: Prisma 6 (`@prisma/client`), NextAuth v5, Tailwind CSS, `@vercel/blob` (proof uploads)

**Storage**: PostgreSQL (Neon). Schema reaches the DB only via numbered, hand-runnable `prisma/sql/` files (next: `025_*.sql`) pasted into Neon — never `prisma db push` from a session.

**Testing**: No unit-test framework in the repo. Verification gate = `npx tsc --noEmit` + `npm run build`, plus a local throwaway Postgres to validate the migration/queries (per CLAUDE.md §3a). Manual quickstart scenarios (see `quickstart.md`).

**Target Platform**: Vercel (server-rendered Next.js App Router).

**Project Type**: Web application (single Next.js project; App Router routes + server actions + `src/lib`).

**Performance Goals**: Interactive HR/employee CRUD — standard web latency; no special throughput targets. Claim evaluation is O(claims-per-user), trivially small.

**Constraints**: All money rules server-authoritative (constitution III). Navy/gold design language; benefits selector layout is a preserved asset — restructuring it here is an explicit, spec-approved change and still requires per-file `ui-versions/` snapshots + user UI sign-off at implement time.

**Scale/Scope**: Tens–low-hundreds of employees; a handful of plan years. Small data volumes.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Align Before Building | PASS | Spec + `/speckit-clarify` (3 Qs) completed and user-approved; this plan is the next gate before code. |
| II. UI Changes Require Approval | PASS (with obligations) | The benefits selector is restructured (basket/submit removed → claim-driven menu). This is spec-approved, but each edited UI file MUST be snapshotted to `ui-versions/` and the visual result explicitly approved by the user before merge. Navy/gold palette preserved. |
| III. Benefits Money & Rules Server-Authoritative | PASS | 50% cap, pool ceiling, medical handling, plan-year window all enforced server-side at claim/commit time. The count-limit rule is retained server-side but **dormant (flag off)** — constitution III lists it among enforced rules; keeping it server-side (just disabled) preserves the principle. Docs note: update the constitution/PROJECT_DETAILS wording to reflect "count limit configurable, default off" in the same change (Principle IV). |
| IV. Spec-Driven & Docs Move With Code | PASS | Implementation commit(s) must update specs 007/012/017, `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, and the `prisma/sql/025_*.sql` file together. |
| V. Engineered Enough, Explicit Over Clever | PASS | Reuse the existing coverage/claims helpers; a single server-side claim-evaluation function is the source of truth, mirrored by the client for display only. |

**Gate result: PASS** — no unjustified violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/018-benefits-claim-allowance/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (server-action contracts)
│   ├── commit-medical.md
│   ├── create-flexible-claim.md
│   └── evaluate-allowance.md
├── checklists/
│   └── requirements.md  # (from /speckit-specify + /speckit-clarify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                 # remove BenefitSelection + SelectionLine; add MedicalCommitment;
│                                 # drop SelectionStatus enum if unused; adjust User/PlanYear/CatalogItem relations
└── sql/025_claim_based_allowance.sql   # hand-runnable Neon migration (drop tables, wipe, create MedicalCommitment)

src/lib/benefits/
├── coverage.ts                   # unchanged (coveredAmount / outOfPocket)
├── rules.ts                      # add evaluateClaim() (50% + ceiling, FT+PT); count limit → dormant flag;
│                                 # remove/deprecate STEP rounding for cost entry
├── config.ts                     # add getMedicalCommitment(userId, planYearId) helper
└── claims.ts                     # tracker() reused; add per-benefit 50% allocation helper

src/app/(app)/benefits/
├── page.tsx                      # restructure: medical-commitment card + guaranteed + claimable flexible menu
├── actions.ts                    # replace saveBasket/reopen* with commitMedical() (+ HR-only edits stay in admin)
└── claim-actions.ts              # allow claims against any active catalog item (no submitted-basket requirement);
│                                 # enforce 50%-per-benefit + ceiling at claim time; medical not claimable

src/components/benefits/
├── BenefitsSelector.tsx          # remove basket/submit/allocation UI → medical commit + claimable list (snapshot!)
├── BenefitClaims.tsx             # reused/extended as the claim surface for flexible + guaranteed (snapshot!)
├── BenefitsOrientation.tsx       # copy rewrite: claim-as-you-go, no submit, medical is the one commitment (snapshot!)
└── (medical modal)               # commit flow (self + dependants) → commitMedical()

src/app/(app)/admin/benefits/
├── page.tsx                      # catalog form: reject 0% coverage (1–100); remove/redirect basket-reopen UI
└── actions.ts                    # HR override: edit/release an employee's MedicalCommitment (exception path)

Steering docs (same commit as code):
PROJECT_DETAILS.md · IMPLEMENTATION_PROGRESS.md · specs/007,012,017 · .specify/memory/constitution.md (count-limit wording)
```

**Structure Decision**: Single Next.js App Router project (existing layout). No new top-level structure; changes are localized to the benefits module (`src/lib/benefits`, `src/app/(app)/benefits`, `src/components/benefits`), the admin benefits surface, the Prisma schema, and one new `prisma/sql` migration.

## Complexity Tracking

No constitution violations requiring justification. (Section intentionally empty.)
