---

description: "Task list for spec 043 — Learning Tracks"
---

# Tasks: Learning Tracks — priorities and deadlines per employee

**Input**: Design documents from `/specs/043-learning-tracks/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/internal-api.md](./contracts/internal-api.md), [quickstart.md](./quickstart.md)

**Tests**: There is no testing regime in this project and none is wanted. Verification is a
`verify-*.mts` script against a throwaway Postgres plus driving the real app in a real browser —
both appear below as their own tasks, per stage, because folding them into "implement" is how they
get skipped.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, mapping to the user stories in spec.md

---

## Phase 1: The mockup gate (Stage 0)

**Purpose**: Nothing visual is written until the CEO has signed off a static mockup. This is
Principle II and it is a hard blocker on every component task below, not a preference.

- [ ] T001 Build the mockup at `design-mockups/learning/2026-09-16_learning-tracks.html` — self-contained HTML, navy/gold, covering all five surfaces: the track list, the track builder (courses in order, the deadline control showing BOTH kinds, the assignee panel), an employee's view of a track on their learning page, the manager's per-person list showing what is locked, and the reminder switch on Learning settings
- [ ] T002 Publish T001 as an Artifact and get explicit CEO sign-off; record the approval date in the mockup's footer

**Checkpoint**: No task marked `[UI]` below may start until T002 is approved.

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The five tables. Every story needs them, so they land once, in one migration.

**⚠️ No user story work begins until this phase is complete.**

- [ ] T003 Add the five models to `prisma/schema.prisma` — `LearningTrack`, `LearningTrackStep`, `LearningTrackAssignment`, `LearningPersonalStep`, `LearningReminderLog`, `LearningSettings` — exactly as specified in data-model.md, including every `@@unique` listed there
- [ ] T004 Write `prisma/sql/078_learning_tracks.sql` in the SAME commit as T003 — idempotent (`IF NOT EXISTS` throughout), including the CHECK constraint that a step and a personal step carry at most one of `dueDays` / `dueOn`
- [ ] T005 Prove `078` idempotent by a WATCHED second run: apply it to a throwaway database, insert a track, a step, an assignment and a reminder-log row, then apply it again and confirm no row is lost and no constraint is violated — a migration is idempotent when a second run has been watched, not when it says so at the top
- [ ] T006 [P] Create `src/lib/learning/track-results.ts` — the plain module holding every result type the actions return, because a `"use server"` file may export nothing but async functions
- [ ] T007 [P] Scaffold `scripts/verify-course-tracks.mts` with its namespacing in place from the start: `vct-` ids, its own email domain, its own track names, and no assertion about any count in the whole database

**Checkpoint**: schema on disk, migration proven, no behaviour yet.

---

## Phase 3: User Story 1 — a track exists, is assigned, and grants its courses (P1) 🎯 MVP

**Goal**: Whoever runs Learning builds a named path, assigns it to a person or group, and those
people hold its courses in that order.

**Independent test**: Create a track with three courses, assign it to an employee holding none of
them, sign in as that employee, see exactly those three in the track's order.

**This is where the load-bearing risk is** — the fifth access route — so its verification happens
here rather than at the end.

### The access route

- [ ] T008 [US1] Add `"TRACK"` to the `AccessRoute` union and `hasTrackAssignment: boolean` to `AccessFacts` in `src/lib/learning/access.ts`
- [ ] T009 [US1] Add the single rule line inside the `published && viewerIsActive` block of `resolveRoutes` in `src/lib/learning/access.ts` — nothing else in that function changes
- [ ] T010 [US1] Create `src/lib/learning/track-access.ts` — the one query answering "which courses does this person hold via a live track assignment", covering both direct and group assignments, shaped so `accessibleCoursesFor` stays a bounded number of queries
- [ ] T011 [US1] Populate `hasTrackAssignment` in all THREE fact-gatherers in `src/lib/learning/access.ts` — `courseAccessFor`, `accessibleCoursesFor`, `courseRoster` — so no entry point can disagree with another

### Reads and writes

- [ ] T012 [P] [US1] Create `src/lib/learning/tracks.ts` — the raw reads (list tracks, one track with steps, who is on it) and raw writes (create, update, delete, add/remove step, reorder steps, assign, revoke). No Prisma call for tracks lives anywhere else
- [ ] T013 [US1] Implement `reorderSteps` in `src/lib/learning/tracks.ts` using the guard shape proven in `src/lib/learning/order.ts` — iterate what the DATABASE says is in the track and refuse a list that does not account for all of it, then renumber canonically
- [ ] T014 [US1] Extend `src/lib/learning/order.ts` so a person's sequence is track courses (grouped by track, in step order) then everything else in the company order — extended in that file, never a second ordering module
- [ ] T015 [US1] Create `src/app/(app)/admin/learning/tracks/actions.ts` — `"use server"`, every export an async function, each one `requireLearningManager()` then validation then a call into `tracks.ts`
- [ ] T016 [US1] Extend `myLearning` in `src/lib/learning/queries.ts` to carry each course's track and position, without adding a query per course or per track

### Screens (blocked on T002)

- [ ] T017 [US1] Create `src/app/(app)/admin/learning/tracks/page.tsx` — the track list, with `AutoRefresh` since other people change it while it sits open
- [ ] T018 [US1] Create `src/components/learning/TrackBuilder.tsx` — courses in the track, add, remove, reorder by the drag handle already built for the course list
- [ ] T019 [US1] Create `src/components/learning/TrackAssignees.tsx` — who is on this track, add a person or a group, revoke
- [ ] T020 [US1] Create `src/app/(app)/admin/learning/tracks/[trackId]/page.tsx` composing T018 and T019
- [ ] T021 [US1] Snapshot `src/app/(app)/admin/learning/page.tsx` to `ui-versions/admin-learning-page/2026-09-16_before-tracks.tsx`, then add the door to Tracks
- [ ] T022 [US1] Snapshot `src/app/(app)/learning/page.tsx` to `ui-versions/learning-page/2026-09-16_before-tracks.tsx`, then group the employee's outstanding courses by track in the track's order

### Proving it

- [ ] T023 [US1] Extend `scripts/verify-course-tracks.mts` with the access matrix: the route is reported; all three entry points agree for the same person and course; a DRAFT or HIDDEN course on a track reaches nobody; revoking removes the course UNLESS started, where `IN_PROGRESS` keeps it and `grandfatheredOnly` is true; a course held by both a track and an audience rule survives losing either
- [ ] T024 [US1] Extend `scripts/verify-course-tracks.mts` with the reorder guard: a list missing a step is refused and writes nothing; a step added in another tab refuses the stale list; renumbering is gap-free
- [ ] T025 [US1] Drive it in a real browser against a real Postgres — build a track, assign it, sign in as the employee and confirm the three courses in order; confirm a draft course on the track is invisible; confirm the console is clean
- [ ] T026 [US1] Drive the same at 390px — the track builder and the employee list, no sideways scroll, nothing unreachable by thumb
- [ ] T027 [US1] Run `npx tsc --noEmit` and `npm run build`; update `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md` and `specs/043-learning-tracks/spec.md` in the same commit as the code

**Checkpoint**: shippable. A new joiner gets an ordered start. No deadlines yet.

---

## Phase 4: User Story 2 — deadlines and the chase (P2)

**Goal**: A step carries a deadline of either kind; an overdue course emails the employee, bounded
and never twice.

**Independent test**: Put an employee on a track with a past deadline, run the job, confirm one
email to them and one to their manager; run it again the same day and confirm nothing.

### The one derivation

- [ ] T028 [US2] Create `src/lib/learning/deadlines.ts` with `resolveDeadline(step, joinedAt)` — both kinds in, one real date out, `null` for no deadline — plus `isOverdue`, `earliestDeadline`, and `REMINDER_SCHEDULE` as a `const` of `[0, 7, 14, 21, 28]`
- [ ] T029 [US2] Make the group-assignment case explicit in `src/lib/learning/deadlines.ts`: a period counts from the later of the group assignment and that person joining the group, passed IN as `joinedAt` rather than read inside, so the decision stays in one place
- [ ] T030 [US2] Wire `resolveDeadline` into `myLearning` (`src/lib/learning/queries.ts`) and the admin track reads (`src/lib/learning/tracks.ts`) — every reader goes through it, none resolves a date of its own

### The switch

- [ ] T031 [P] [US2] Create `src/lib/learning/settings.ts` — read and write the `LearningSettings` singleton, defaulting `deadlineRemindersEnabled` to false so the reversal does not switch itself on at deploy
- [ ] T032 [US2] Add `setRemindersEnabled` to `src/app/(app)/admin/learning/tracks/actions.ts` with the asymmetric guard — `false` needs `requireLearningManager()`, `true` needs `requireAdmin()` — as two guards on ONE write path, recording who disabled it and when
- [ ] T033 [US2] Create `src/components/learning/ReminderSwitch.tsx` and add it to `src/app/(app)/admin/learning/settings/page.tsx`, snapshotting that page to `ui-versions/learning-settings-page/2026-09-16_before-reminders.tsx` first

### The deadline control and the chase

- [ ] T034 [US2] Create `src/components/learning/DeadlineField.tsx` — one control offering both kinds, refusing both at once, showing the resolved date while the operator edits the rule
- [ ] T035 [US2] Add `setStepDeadline` to `src/app/(app)/admin/learning/tracks/actions.ts`, refusing both kinds at once on the server with the CHECK constraint as the backstop
- [ ] T036 [P] [US2] Add `learningOverdue` (to the employee) and `learningOverdueManager` templates to `src/lib/email/templates.ts`, dates as dd/mm/yyyy, through the existing branded sender
- [ ] T037 [US2] Create `src/app/api/cron/learning/route.ts` — `CRON_SECRET` bearer auth or 401; both switches checked; one bounded sweep of incomplete enrollments past their resolved deadline; days-since-due must be in `REMINDER_SCHEDULE`; insert `LearningReminderLog` and treat a unique violation as "already done today"; send; fire-and-forget so one failure does not stop the sweep; log row written ONLY on a successful send
- [ ] T038 [US2] Register the cron in `vercel.json` alongside the three existing daily jobs
- [ ] T039 [US2] Show overdue on the employee page (`src/app/(app)/learning/page.tsx`) derived on read, so it shows whether or not the reminder switch is on

### Proving it

- [ ] T040 [US2] Extend `scripts/verify-course-tracks.mts`: `resolveDeadline` is stable for the same input; both kinds on one step refused by the action AND by a direct insert; a course in two tracks takes the earlier date AFTER both resolve, including one-of-each-kind; completing makes it not-overdue with nothing written
- [ ] T041 [US2] Extend `scripts/verify-course-tracks.mts` with the bound: five sends across the schedule then silence on day 35; the same day twice produces one row and one send; a failed send writes no row; either switch off sends nothing; and assert `LearningSettings` has NO cadence column, so nobody adds one later
- [ ] T042 [US2] Drive it in a browser: set one deadline of each kind, confirm both print dd/mm/yyyy and that the date shown is the date chased on; hit the cron route and read the mail; hit it again the same day and confirm silence; complete the course and confirm silence
- [ ] T043 [US2] Drive the switch in a browser: a learning manager turns it off (nothing sends, overdue still visible everywhere); the same person is refused turning it on; an HR Admin succeeds
- [ ] T044 [US2] Run `npx tsc --noEmit` and `npm run build`; update the three docs in the same commit

**Checkpoint**: shippable. Deadlines chase, bounded, with a brake.

---

## Phase 5: User Story 3 — the manager's additions (P3)

**Goal**: A manager adds and orders for their own direct reports, and can never remove a company
requirement.

**Independent test**: Add a course for a report and reorder; try to remove a company requirement and
be refused, both through the screen and around it.

- [ ] T045 [US3] Add the personal-step reads and writes to `src/lib/learning/tracks.ts` — add, reorder, remove, all against `LearningPersonalStep` and never `LearningTrackStep`
- [ ] T046 [US3] Create `src/lib/learning/manager-access.ts` — "is this person a direct report of that one, right now", resolved against the CURRENT org chart like time-off approvals, never a stored snapshot
- [ ] T047 [US3] Add `addPersonalStep`, `reorderPersonalSteps` and `removePersonalStep` to a new `src/app/(app)/admin/learning/tracks/manager-actions.ts`, each guarded by T046, each refusing on the server whatever the screen offers
- [ ] T048 [US3] Include personal steps in the access route (`src/lib/learning/track-access.ts`) and in the order derivation (`src/lib/learning/order.ts`) — the same two places, not new ones
- [ ] T049 [US3] Build the manager's per-person list UI, showing company requirements as locked WITH the reason on the row rather than as a silently absent control
- [ ] T050 [US3] Extend `scripts/verify-course-tracks.mts`: a manager may act only for their own reports; moving a report mid-test transfers the ability and removes it from the old manager; no action reaches a company step; a personal addition grants the course through the same single derivation
- [ ] T051 [US3] Drive it in a browser, including submitting a refused change around the screen to confirm the server refuses it on its own authority
- [ ] T052 [US3] Run `npx tsc --noEmit` and `npm run build`; update the three docs in the same commit

**Checkpoint**: shippable.

---

## Phase 6: User Story 4 — seeing where everybody is (P4)

**Goal**: Employee, manager and whoever runs Learning see the same position and the same overdue
state.

**Independent test**: With one person part-way through a track, confirm all three views agree.

- [ ] T053 [US4] Snapshot `src/app/(app)/learning/team/page.tsx` to `ui-versions/team-learning-page/2026-09-16_before-tracks.tsx`, then make it speak in tracks, positions and overdue
- [ ] T054 [P] [US4] Add the track roster to `src/app/(app)/admin/learning/tracks/[trackId]/page.tsx` — who is on it and how far each has got, every count computed through the same derivation the real check uses
- [ ] T055 [US4] Extend `scripts/verify-course-tracks.mts` to assert the three readers return the same position and the same overdue state for one person — a disagreement between screens is the failure this story exists to prevent
- [ ] T056 [US4] Drive all three views in a browser for the same employee and confirm they agree, at desktop and 390px
- [ ] T057 [US4] Run `npx tsc --noEmit` and `npm run build`; update the three docs in the same commit

---

## Phase 7: Polish & cross-cutting

- [ ] T058 Run the whole of `scripts/verify-course-tracks.mts` twice in a row against a database that already holds another script's fixtures, confirming it is order-independent and asserts nothing about the shared whole
- [ ] T059 [P] Re-read the diff adversarially for the two rules that carry no type error: every export in each `"use server"` file is an async function, and no `useActionState` dispatch is fired from a plain button without `startTransition`
- [ ] T060 [P] Confirm `src/lib/modules.ts` needs no new entry (tracks live inside Learning, already under its switch) and record that decision in `PROJECT_DETAILS.md` so nobody adds a redundant one
- [ ] T061 Add a CLAUDE.md engineering-preferences entry for anything this build taught that would otherwise be re-learned
- [ ] T062 Final `npx tsc --noEmit` and `npm run build`; state plainly what was verified, how, and what could NOT be checked from here (the live Neon database, real Resend delivery)

---

## Dependencies

```text
Phase 1 (mockup)  ──blocks──>  every task marked as a screen or component
Phase 2 (schema)  ──blocks──>  Phases 3–6 entirely

US1 (Phase 3)  ──>  US2 (Phase 4)  ──>  US3 (Phase 5)  ──>  US4 (Phase 6)
```

US2 depends on US1 only for the track and step tables to be in use; US3 depends on US1's access
route and order derivation; US4 depends on US2 for overdue to exist. Each phase ends shippable.

**Within Phase 3**: T008→T009→T011 are one file and strictly sequential. T010, T012 and T016 are
different files and can run alongside. T017–T022 all wait on T002.

## Parallel opportunities

- T006 and T007 (Phase 2) — different files, no dependency
- T012 and T016 (US1) — `tracks.ts` and `queries.ts`
- T031 and T036 (US2) — settings module and email templates
- T054 (US4) alongside T053 — different files
- T059 and T060 (Polish)

## Implementation strategy

**MVP is Phase 1 + Phase 2 + Phase 3 (US1).** That alone is worth shipping: a named path, assigned
once, delivering an ordered start to a new joiner. Deadlines, the manager's additions and the
reporting views each add to a working thing rather than completing an unusable one.

The riskiest work — the fifth access route — is in the MVP and verified there. If that is wrong,
everything after it is built on sand, so it is proven before anything else is written on top.
