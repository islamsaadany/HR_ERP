# Implementation Plan: Learning Track — Courses, Assignment & Tracked Progress

**Branch**: `claude/lms-section-repo-review-meb9cj` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-learning-track-lms/spec.md`

## Summary

Add a Learning module to HR_ERP: HR Admins author courses (course → sections → lessons → blocks),
publish them behind a completeness gate, and route them to employees through live registry-derived
audiences, ad-hoc groups, or direct assignment; employees work through them in a player that tracks
progress, resumes where they stopped, and can require a video be genuinely watched.

The technical spine is **one access derivation** (`src/lib/learning/access.ts`) answering "may this
person open this course" across four routes, in the shape of `src/lib/benefits/pool.ts` — pure core,
thin DB wrappers, both per-person and bulk readers. Three design choices carry most of the risk and
are settled in [research.md](./research.md): audiences are stored as **rules** compiled to a single
`where` clause rather than expanded into rows (D2); grandfathering is **derived** from an in-progress
enrollment rather than maintained as a flag (D4); and the impersonation guard lives in the **actor
resolver** so a future action cannot be written without it (D7).

One decision is deliberately left open — **how video is delivered** — because it trades
confidentiality against cost and effort. See *Open Decision* below.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22 · React 19.2 · Next.js **15.5.22** (App Router, RSC-first)

**Primary Dependencies**: Prisma 6.16 · NextAuth v5 (beta.32, credentials) · Zod 4 · Tailwind v4
(CSS-first tokens, house `ff-*` conventions) · `@vercel/blob` 2.3. **No new runtime dependency** —
notably no shadcn/Radix, no Supabase, no `pdf-lib` (certificates are deferred).

**Storage**: PostgreSQL (Neon) via Prisma. Twelve new models, `prisma/sql/060_learning_track.sql`,
purely additive, applied by `scripts/apply-sql.mjs` at deploy (constitution 1.2.1).

**Testing**: pure-function tests only, per constitution Principle V — `computeProgressPercent`,
`audienceWhere`, `bandStartDateRange`, and `resolveRoutes` (the four-route access rule), lifted from
FFLMS's unit tests where they exist. No CI gate, no e2e suite, no standing obligation. Verification
before hand-over is `npx tsc --noEmit`, `npm run build`, and the migration proven on a throwaway
Postgres 16 including a second run.

**Target Platform**: Vercel (Node runtime), modern browsers; the player must work on mobile Safari
and Chrome since employees will watch on phones.

**Project Type**: Web application — Next.js App Router monolith, server-authoritative.

**Performance Goals**: no per-employee query in any whole-company view — the roster and the Learning
list each resolve in a bounded number of queries regardless of headcount (research D2/D3).

**Constraints**: server-authoritative access on every read and write · no email · no cron · no new
env var · no new `User` column · nothing named `Module` or `Announcement` · dates rendered dd/mm/yyyy
via the one `formatDate` · navy = action, green = done-state only.

**Scale/Scope**: ~20–50 employees, tens of courses, hundreds of lessons. Small enough that the
"nothing denormalised" choice (research D6) costs nothing and buys correctness.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design. Constitution v1.2.1.*

| Principle | Gate | Status after Phase 1 |
|---|---|---|
| **I — Align Before Building** | Scope, authoring model, assignment model and provenance agreed before specifying; both spec clarifications answered by the product owner before planning. | ✅ Pass |
| **II — UI Changes Require Approval** | No component is written before an approved HTML mockup; four surfaces identified below; snapshots to `ui-versions/` are moot (all files are new) but the mockup gate is not. | ✅ Pass — **gate open, mockups owed next** |
| **III — Benefits Money Server-Authoritative** | No money in this feature. The *pattern* is honoured where it applies: one derivation of the access rule, enforced server-side on every path. | ✅ Pass (n/a, pattern applied) |
| **IV — Spec-Driven & Docs Move With Code** | spec → plan → tasks → implement. `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md` (Phase 9) and `IMPLEMENTATION_PLAN.md` are updated in the implementing commits. | ✅ Pass |
| **V — Engineered Enough, Explicit Over Clever** | One rule per concept, no cached percentage, no second auth idiom. Pure-function tests only; no regime introduced. | ✅ Pass |
| **Tech constraints** | Next 15 · Prisma · Vercel Blob · no email · no cron · no new env var · numbered idempotent SQL applied by the deploy runner · roles unchanged. | ✅ Pass |

**No violations. Complexity Tracking is therefore empty and omitted.**

## Open Decision — Video delivery

Everything else is settled; this is not, and it should not be settled silently.

**What is true in the codebase today**: Blob is used exclusively as `access: "private"`
(`profile/documents-actions.ts:27`, `admin/knowledge/actions.ts:41`), and private blobs are streamed
back through a Function by `src/lib/blob-serve.ts` — which returns the whole body and **implements no
HTTP Range**, the thing video seeking and resume depend on. Uploads go through a server action, and
`next.config.mjs` sets no `serverActions.bodySizeLimit` (Next's default is 1 MB) while
`documents-actions.ts` advertises a 10 MB cap — worth verifying on its own account, independent of
this feature.

| Option | What it means | Cost |
|---|---|---|
| **A — Links only** | No uploads. HR pastes an unlisted YouTube/Vimeo link. Both are fully trackable, so watch-gating and checkpoints work unchanged. | Zero storage work; best playback. Content lives outside our control, and "unlisted" is public-but-unguessable. |
| **B — Client-direct upload, public blob** | Browser uploads straight to Blob; the video plays from the Blob CDN with Range and seeking for free. | Small implementation. The blob URL is public-but-unguessable — anyone with the link watches without signing in. |
| **C — Client-direct upload, private blob + Range-capable streaming route** | Fully authenticated: every byte passes `courseAccessFor()`. | We implement Range correctly, and all video bandwidth flows through Functions — a 500 MB course video watched by 40 people is real cost and real function-duration risk. |

**Recommendation: A for this release, with B added later only if HR actually needs to host video we
cannot put on Vimeo.** It is the only option with no new failure mode, it needs no upload path at
all, the trackability employees experience is identical, and it defers the confidentiality question
until there is a real video to have it about. If training content is genuinely confidential, C is the
only honest answer and its cost should be accepted deliberately.

*This choice affects: the `LessonBlock` upload fields, `POST /api/learning/upload`,
`GET /api/learning/blocks/[id]/video`, and roughly one task group in `tasks.md`. It affects nothing
else — `src/lib/learning/video.ts` and the player are identical under all three.*

## Project Structure

### Documentation (this feature)

```text
specs/038-learning-track-lms/
├── spec.md              # 46 FRs, 11 SCs, 4 stories — clarifications resolved
├── plan.md              # This file
├── research.md          # D1–D9: decisions and rejected alternatives
├── data-model.md        # 12 models, invariants, migration shape
├── quickstart.md        # How to prove it works
├── contracts/
│   └── server-actions.md
├── checklists/
│   └── requirements.md  # 16/16
└── tasks.md             # NOT created by /speckit-plan
```

### Source Code (repository root)

```text
src/
├── lib/learning/                 # the module's brain — no React, no Prisma in the pure files
│   ├── access.ts                 # ★ THE derivation: 4 routes, 3 entry points, 1 rule (FR-015/042)
│   ├── audience.ts               # audienceWhere() + bandStartDateRange() — rules → one where clause
│   ├── progress.ts               # lifted from FFLMS progress-calc.ts (pure)
│   ├── video.ts                  # lifted from FFLMS lib/video.ts (pure, client-safe)
│   ├── actor.ts                  # requireLearner() — the impersonation guard (FR-026)
│   └── queries.ts                # roster / learning-list readers built on access.ts
├── app/(app)/
│   ├── learning/                 # employee surfaces
│   │   ├── page.tsx              # "My learning" list
│   │   ├── [courseId]/page.tsx   # the player
│   │   └── actions.ts            # LEARNER writes only
│   └── admin/learning/           # HR surfaces
│       ├── page.tsx              # course list
│       ├── [courseId]/page.tsx   # builder (tabs: Content · Access · People)
│       ├── groups/page.tsx
│       ├── actions.ts            # authoring
│       └── access-actions.ts     # audiences, groups, assignment
├── components/learning/          # all new; each behind an approved mockup
│   ├── CourseBuilder.tsx  SectionList.tsx  LessonEditor.tsx  BlockEditor.tsx
│   ├── AudiencePicker.tsx  GroupManager.tsx  ReopenDialog.tsx
│   ├── CoursePlayer.tsx  LessonNav.tsx  VideoLesson.tsx  CheckpointPrompt.tsx
│   └── CourseRoster.tsx
└── app/api/learning/…            # cover / file / video streaming routes

prisma/
├── schema.prisma                 # + 12 models, + 5 enums, no User columns
└── sql/060_learning_track.sql    # additive, idempotent, deploy-applied

tests/
└── learning-access.test.ts, learning-progress.test.ts, learning-audience.test.ts
```

**Structure Decision**: the module follows the shape the codebase already uses — pure derivations in
`src/lib/<domain>/`, server actions beside the routes that call them, components in
`src/components/<domain>/` — rather than importing FFLMS's `src/server/services/` layering. Mixing two
architectures in one repository costs more than either one's merits. The *discipline* FFLMS's service
layer enforces (no database access from a page; a pure rule with a thin wrapper) is kept, expressed in
this codebase's existing idiom.

## Surfaces needing an approved mockup before any component is written

Per Principle II and CLAUDE.md's MOCKUP-FIRST rule, four surfaces. Each is a self-contained HTML file
under `design-mockups/learning/<YYYY-MM-DD>_<desc>.html`, navy/gold, published as an Artifact for
sign-off:

1. **Course builder** (HR) — the section/lesson tree, block editing, and the reopen dialog. The
   densest screen and the one most likely to need iteration.
2. **My learning** (employee) — the list of held courses with progress. Must read as "what do I owe"
   rather than a catalogue.
3. **The course player** (employee) — lesson navigation, content area, the video with its gate and
   checkpoint prompt, mark-complete.
4. **Course roster** (HR) — who holds this course, by which route, at what progress, with the
   grandfathered/withdrawn distinction visible (FR-046).

## Phase status

- **Phase 0 — Research**: ✅ complete → [research.md](./research.md) (D1–D9; D8 is the open decision above)
- **Phase 1 — Design & contracts**: ✅ complete → [data-model.md](./data-model.md),
  [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)
- **Phase 2 — Tasks**: not started — `/speckit-tasks`, after the video decision and the mockups
