# Implementation Plan: Mid-Year Starter Proration

**Branch**: `019-mid-year-proration` (developed on session branch `claude/claude-md-repo-fixes-yx8sbm`) | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/019-mid-year-proration/spec.md`

## Summary

Give a plan year an admin-set **start/end window**, then prorate three annual figures for employees who first become eligible mid-year: the **flexible pool ceiling**, the **guaranteed Professional-development** budget (both keyed to 6 months of service), and **medical** (keyed to 3 months). Prorated amount = `annual × remaining whole months ÷ 12`, measured from the benefit's eligibility date to the plan-year end; full amounts from the next plan year. All enforcement lives in the existing server-authoritative benefits rules; the client mirrors the figures for display. Medical rides the current placeholder rate card until the operator's real prorated figures arrive (a later data swap).

## Technical Context

**Language/Version**: TypeScript 5.9; Next.js App Router + React 19 (package.json pins `next@15.5.4`; steering docs say "16" — pre-existing drift, tracked separately).

**Primary Dependencies**: Prisma 6 (`@prisma/client`), PostgreSQL (Neon) via numbered `prisma/sql/` files; NextAuth v5; Tailwind v4. No new dependency required.

**Storage**: PostgreSQL (Neon). Schema reaches the DB only through hand-runnable numbered `prisma/sql/0NN_*.sql` files (no `prisma db push` from a session).

**Testing**: No automated suite in the repo. Verification per house rule 3a: `npx tsc --noEmit`, `npm run build`, and applying the new SQL to a throwaway local Postgres and querying the affected rows.

**Target Platform**: Vercel (server-rendered web app).

**Project Type**: Web application (Next.js full-stack — server actions + RSC pages + client components).

**Performance Goals**: Negligible — proration is arithmetic computed per request alongside existing benefits queries.

**Constraints**: Server-authoritative money rules (Constitution III); UI changes need mockup sign-off + `ui-versions/` snapshot (Constitution II); placeholder figures never presented as final.

**Scale/Scope**: Small internal tool (single company). One new schema field pair, one pure proration module, edits to ~5 server/page files, and 2 UI slices (one already mockup-approved).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Align Before Building (NON-NEGOTIABLE)** — PASS. Spec 019 and all three product decisions (window = admin-set dates; prorate pool + prof-dev; medical folded in at 3 months, placeholder rates) were confirmed by the user before this plan.
- **II. UI Changes Require Explicit Approval** — PASS *with a gate*. Two UI slices touch visuals: (a) the **medical-only employee view** — already mockup-approved; (b) **plan-year start/end date inputs** in the admin dialog and the employee-facing **"prorated / unlocks at 6 months"** indicators — **new UI, require a mockup + sign-off before `/speckit-implement` edits those components**. Every edited `.tsx` gets a `ui-versions/` snapshot first.
- **III. Benefits Money & Rules Server-Authoritative (NON-NEGOTIABLE)** — PASS. All proration is computed and enforced in `src/lib/benefits/` at claim/commit time (`evaluateClaim`, `commitMedical`, pool-ceiling lookup); the client only mirrors the prorated numbers.
- **IV. Spec-Driven & Docs Move With Code** — PASS. Spec/plan/tasks precede code; the four steering docs + this spec update in the same commits as the code.
- **V. Engineered Enough, Explicit Over Clever** — PASS. One small pure module (`proration.ts`) with explicit boundary handling (null window, null start date, entry-tier fallback), reused everywhere rather than duplicated.

No violations → Complexity Tracking omitted.

## Project Structure

### Documentation (this feature)

```text
specs/019-mid-year-proration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (server-action + pure-function contracts)
│   └── proration.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks output (not created here)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                       # PlanYear += startDate/endDate; GuaranteedBenefit += prorated flag
└── sql/
    └── 027_plan_year_window.sql        # NEW: add columns + mark Professional development prorated

src/
├── lib/
│   ├── derive.ts                       # += monthsSince() / add-months helper
│   └── benefits/
│       ├── proration.ts                # NEW: eligibility classify + prorate (pure, server+client shared)
│       ├── config.ts                   # getActivePlanYear returns the window; entry-tier ceiling helper
│       └── rules.ts                    # evaluateClaim/flexCap operate on the (already-prorated) ceiling
├── app/(app)/
│   ├── benefits/
│   │   ├── page.tsx                    # apply proration; allow medical-only (>=3mo, no band); prorated notes
│   │   ├── claim-actions.ts            # prorate pool ceiling + prof-dev allocation before evaluateClaim
│   │   └── actions.ts                  # commitMedical: 3-month gate + prorated premium + entry-tier fallback;
│   │                                   #   createPlanYear/editPlanYear accept start/end dates
│   └── admin/benefits/
│       └── page.tsx                    # plan-year window display (+ "dates missing" admin warning)
└── components/
    ├── admin/PlanYearDialog.tsx        # start/end date inputs (NEW UI — mockup)
    └── benefits/BenefitsBoard.tsx      # prorated indicators + medical-only view (medical-only = approved mockup)
```

**Structure Decision**: Single Next.js full-stack app (the repo's established layout). The core logic is a new pure module `src/lib/benefits/proration.ts` consumed by the server actions/pages (authoritative) and mirrored by client components (display only), matching the existing coverage/rules split (`coverage.ts` / `rules.ts`).

## Complexity Tracking

No constitution violations — section intentionally empty.
