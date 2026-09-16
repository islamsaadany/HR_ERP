# Implementation Plan: Learning Tracks — priorities and deadlines per employee

**Branch**: `claude/elegant-heisenberg-80hdml` (spec directory `043-learning-tracks`) | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/043-learning-tracks/spec.md`

## Summary

A **track** is a named, ordered path of published courses, assigned to a person or a group. Being on
a track grants its courses, so it becomes the **fifth access route** and is resolved inside the
module's existing single access derivation rather than beside it. A step may carry a deadline of
either kind — a period in days from when that person joined the track, or a fixed calendar date —
and both resolve to one real date through one function that every screen, comparison and reminder
reads. A course still unfinished past its deadline causes a daily job to email the employee, bounded
at five messages, never twice, behind both the platform email toggle and a new Learning-level switch
that can only narrow.

The technical shape follows from three things the module already does well, and the plan's job is to
extend them rather than add parallel machinery:

1. **`resolveRoutes` is pure and takes facts.** Adding a route is a member on a union, a boolean on
   `AccessFacts`, one line in the rule, and the fact populated in the three fact-gatherers. Nothing
   else in the codebase learns what a track is.
2. **`ConfirmationReminderLog` already solves "never twice"** — a row per (subject, person, day) with
   a unique constraint. The learning reminder copies that shape rather than inventing one.
3. **Course ordering already has one derivation** (`src/lib/learning/order.ts`, built 2026-09-15).
   The sequence a person meets their courses in gains a track dimension in one place, not two.

## Technical Context

**Language/Version**: TypeScript, Next.js 15 (App Router) + React 19

**Primary Dependencies**: Prisma (PostgreSQL/Neon), NextAuth v5, Tailwind, Resend (email), Vercel Cron

**Storage**: PostgreSQL. Five new tables (see [data-model.md](./data-model.md)); migration `078` —
`077_funding_transferred_at.sql` is the current highest.

**Testing**: No testing regime, by settled policy. Verification is a `scripts/verify-course-tracks.mts`
against a throwaway Postgres, plus driving the real app in a real browser. Both are required before
handover, not optional.

**Target Platform**: Vercel; used on desktop and as an installed PWA on phones.

**Project Type**: Web application, single Next.js project (`src/app`, `src/lib`, `src/components`).

**Performance Goals**: The employee learning page and the manager's team page must stay at a bounded
number of queries whatever the headcount or the number of tracks — the existing readers are written
that way deliberately and adding a per-course or per-track query would undo it.

**Constraints**:

- The daily reminder job runs against every employee with an overdue step. It must be one bounded
  sweep, not a query per person, and must not send twice under a double run.
- Deadlines display dd/mm/yyyy; a date-only value is never parsed to print it.
- Next.js server-action body limit and blob storage are irrelevant here — no uploads in this feature.

**Scale/Scope**: ~50–200 employees, tens of courses, a handful of tracks. Nothing here is
large-scale; the constraints above are about correctness and query shape, not throughput.

## Constitution Check

*Checked against `.specify/memory/constitution.md` v2.0.0.*

| Gate | Status | How this plan satisfies it |
|------|--------|---------------------------|
| **I. Align Before Building** | ✅ | Four decisions and three clarifications taken with the CEO before the spec; this plan adds no product decision of its own. The mockup gate below is where UI alignment happens. |
| **II. UI Changes Require Approval** | ⚠️ **Gate, not a violation** | Three new surfaces and two edited ones. **No component may be written until a static mockup under `design-mockups/learning/` is signed off**, and every edited UI file is snapshotted to `ui-versions/` first. This is a task in the sequence, not an afterthought. |
| **III. Benefits Money Server-Authoritative** | ✅ N/A | No money. |
| **IV. Spec-Driven & Docs Move With Code** | ✅ | Spec 043 written and clarified first; constitution amended to 2.0.0 before planning. `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md` and the spec update in the same commits as the code. |
| **V. Engineered Enough, Explicit Over Clever** | ✅ | The feature adds exactly one new derivation (deadline resolution) and extends two existing ones (access, order). Everything else is storage and screens. |
| **Email — six workflows, conditions** | ✅ | See *Reminder conditions* below; each condition in the constitution maps to a named artefact. |
| **Scheduled work — four crons** | ✅ | `/api/cron/learning`, `CRON_SECRET`-authenticated, logs each send. |
| **Appointment, never a new Role** | ✅ | Authority is `canManageLearning` (existing) and the org-chart-derived manager capability (existing). No new role, no new appointment table. |
| **Migrations are Claude's job** | ✅ | `prisma/sql/078_learning_tracks.sql`, idempotent, same commit as the schema change. |
| **`"use server"` exports only async functions** | ✅ | Writes live in `src/lib/learning/tracks.ts` and `src/lib/learning/deadlines.ts`; actions are the access check plus a call. Result types live in a plain module. |

### Reminder conditions — where each one actually lives

The constitution's reversal is conditional, and a condition with no named home is an intention. Each
maps to something a reviewer can point at:

| Condition (constitution v2.0.0) | Where it is enforced |
|---|---|
| Bounded at five messages | `REMINDER_SCHEDULE` in `src/lib/learning/deadlines.ts` — day 0, then 7/14/21/28 |
| Bound fixed, not configurable | It is a `const` in that module. No column, no settings field. Asserted by the verify script. |
| Never sent twice | `LearningReminderLog` with `@@unique([userId, courseId, sentOn])` — the `ConfirmationReminderLog` shape |
| Fire-and-forget, failure never recorded as success | The log row is written only on a successful send; the job never throws out |
| Stops when the obligation is met | The sweep selects only incomplete enrollments, so completion removes the person from the query |
| Module switch that can only narrow | The job checks `emailEnabled` (platform) **and** `LearningSettings.deadlineRemindersEnabled`; both must be true |
| Silencing must not hide the fact | Overdue is derived on read by `resolveDeadline`, which the screens call regardless of any switch |

## Project Structure

### Documentation (this feature)

```text
specs/043-learning-tracks/
├── spec.md              # written + clarified
├── plan.md              # this file
├── research.md          # the five decisions that needed a look at the code first
├── data-model.md        # the five new tables and what they may not do
├── quickstart.md        # how to prove it works
├── contracts/
│   └── internal-api.md  # the derivations and actions this feature exposes
├── checklists/
│   └── requirements.md  # written at specify time
└── tasks.md             # NOT created here — /speckit-tasks
```

### Source code

```text
src/
├── lib/learning/
│   ├── access.ts              # EDIT: + "TRACK" route, + hasTrackAssignment fact, + 1 rule line
│   ├── order.ts               # EDIT: track order vs company order, in the one place
│   ├── tracks.ts              # NEW: the track reads + the raw writes (create/assign/reorder)
│   ├── deadlines.ts           # NEW: resolveDeadline (both kinds → one date), overdue, REMINDER_SCHEDULE
│   ├── track-access.ts        # NEW: the one query that answers "is this person on a track holding this course"
│   ├── settings.ts            # NEW: the Learning-level switch (read + write)
│   └── queries.ts             # EDIT: myLearning gains track position + deadline
├── app/(app)/admin/learning/
│   ├── tracks/page.tsx        # NEW: the track list
│   ├── tracks/[trackId]/page.tsx  # NEW: build one track — courses, order, deadlines, who is on it
│   ├── tracks/actions.ts      # NEW: "use server" — access check + call, async exports only
│   └── settings/page.tsx      # EDIT: + the reminder switch
├── app/(app)/learning/
│   ├── page.tsx               # EDIT: track grouping, position, overdue
│   └── team/page.tsx          # EDIT: per-report track position + overdue + the manager's additions
├── app/api/cron/learning/route.ts  # NEW: the fourth cron
├── components/learning/
│   ├── TrackBuilder.tsx       # NEW (mockup first)
│   ├── TrackAssignees.tsx     # NEW (mockup first)
│   ├── DeadlineField.tsx      # NEW (mockup first) — the two kinds, one control
│   └── ReminderSwitch.tsx     # NEW (mockup first)
├── lib/email/templates.ts     # EDIT: + the overdue notice (employee) and the manager notice
prisma/
├── schema.prisma              # EDIT: five models
└── sql/078_learning_tracks.sql  # NEW, idempotent
scripts/
└── verify-course-tracks.mts   # NEW
design-mockups/learning/
└── 2026-09-NN_learning-tracks.html  # NEW — the approval gate for every component above
```

**Structure Decision**: The existing single-project Next.js layout, unchanged. Learning already owns
`src/lib/learning/` and `src/app/(app)/admin/learning/`; tracks are a sub-route of that admin area
rather than a new top-level module, because a track is a way of handing out courses and belongs with
the courses. No new module switch entry is needed — tracks live inside Learning, which already has
one — and that is stated here so nobody adds a second.

## Sequencing

Ordered so each stage is independently shippable and the riskiest thing is proven first.

**Stage 0 — the mockup gate.** One mockup covering the track list, the track builder (courses, order,
deadlines), the assignee panel, the employee's view of a track, and the reminder switch. Signed off
before any component exists. Nothing else in this stage.

**Stage 1 — US1: a track exists, is assigned, and grants its courses.** Schema + migration `078`, the
fifth access route, the track reads and writes, the admin screens, the employee's list grouping by
track. Shippable alone: a new joiner gets an ordered start. **This is where the load-bearing risk
is**, so the verify script's access matrix is written here, not later.

**Stage 2 — US2: deadlines and the chase.** `deadlines.ts`, the deadline field on a step, overdue on
every screen, `LearningSettings` + the switch, the email templates, the cron, the reminder log.
Shippable alone on top of Stage 1.

**Stage 3 — US3: the manager's additions.** Personal additions, the per-person order, the refusals
enforced server-side against the current org chart.

**Stage 4 — US4: seeing it.** The team page speaking in tracks and deadlines; the track's own roster.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **A fifth access route** | A track grants its courses (CEO, option A). Without it a track is only a sort order, and every assignment has to be done twice. | Making the track a pure ordering layer was the alternative and was rejected in the spec: it leaves tracks silently full of holes. The cost is contained by putting the route *inside* `resolveRoutes` rather than beside it — the rule stays one function, and the four existing routes are untouched. |
| **Two kinds of deadline** | Both real cases exist: an onboarding path assigned all year round can only mean "within N days of starting", a compliance deadline can only mean a date. | Either alone makes the other case impossible or a manual chore. Contained by `resolveDeadline` — the two kinds exist only at the point of storage and the point of editing; every reader sees one date. |
| **A sixth email workflow and a fourth cron, emailing employees** | The CEO's decision, and the constitution was amended to 2.0.0 for it before this plan. | Alternatives (no dates; manager-only visibility) were put to him and declined. The conditions in the constitution are mapped to named artefacts in the table above so the reversal cannot quietly widen. |
| **A second settings singleton (`LearningSettings`)** | The switch belongs in Learning's own settings, where the person who owns the consequence will look for it. | Adding a column to `NotificationSettings` was considered and rejected: that record is surfaced at Admin → Notifications, so the control would appear in the wrong place and a learning manager — who cannot open that screen — could not reach the brake they are supposed to be able to pull. |
