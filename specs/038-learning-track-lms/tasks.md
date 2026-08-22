# Tasks: Learning Track — Courses, Assignment & Tracked Progress

**Input**: Design documents from `/specs/038-learning-track-lms/`

**Prerequisites**: [spec.md](./spec.md) · [plan.md](./plan.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/server-actions.md) ·
[quickstart.md](./quickstart.md)

**Mockup**: `design-mockups/learning/2026-08-21_learning-track.html` — **approved 2026-08-21**.
The Principle II gate is open; components may be written to match it. Any deviation from the
approved look needs a fresh mockup and fresh sign-off.

**Tests**: pure-function tests only, per constitution Principle V. No CI gate, no e2e suite, no
standing obligation. `npx tsc --noEmit` and `npm run build` must pass before any hand-over.

**Organization**: grouped by user story so each is independently deliverable in spec priority order.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — genuinely different files, no dependency on an incomplete task
- **[Story]**: US1–US4, on user-story phases only

---

## Phase 1: Setup

**Purpose**: make room for the module. No dependencies to install — the feature adds **no new runtime
dependency**, no env var, no cron, and no video upload path (research D8).

- [X] T001 Create the module directories `src/lib/learning/`, `src/components/learning/`, `src/app/(app)/learning/`, `src/app/(app)/admin/learning/`
- [X] T002 Confirm `060` is still the next free migration number by listing `prisma/sql/` before writing any SQL

---

## Phase 2: Foundational (BLOCKING — no user story may start until this is done)

**Purpose**: the schema and, critically, **the one access derivation**. `access.ts` must exist and be
tested before any page or action is written — anything built against a placeholder acquires a second
copy of the rule, which is the failure the benefits pool taught us.

### Schema and migration

- [X] T003 Add the 5 enums and 12 models from [data-model.md](./data-model.md) to `prisma/schema.prisma` — `Course`, `CourseSection`, `Lesson`, `LessonBlock`, `VideoCheckpoint`, `CourseAudience`, `LearnerGroup`, `LearnerGroupMember`, `CourseAssignment`, `CourseEnrollment`, `LessonProgress` plus `User` back-relations only (**no new `User` column**, nothing named `Module` or `Announcement`)
- [X] T004 Write `prisma/sql/060_learning_track.sql` — additive and idempotent: enums via `DO $$ … EXCEPTION WHEN duplicate_object`, `CREATE TABLE IF NOT EXISTS`, indexes and FKs. No `ALTER` of an existing table, no back-fill, no drop
- [X] T005 Verify `060` on a throwaway Postgres 16 (`/usr/lib/postgresql/*/bin`, as the `postgres` user): apply the full chain, confirm 12 tables and 5 types, **apply a second time and confirm zero statements**, and confirm no drift against `prisma/schema.prisma`. Record the result — this is the evidence, not the intention

### Pure logic (no Prisma, no React) — the parallel block

- [X] T006 [P] Port `src/lib/video.ts` from `/home/user/ahmedgalal-lang/fflms` into `src/lib/learning/video.ts` — URL classification and normalisation for YouTube / Vimeo / Drive / direct file. Drop nothing; keep the `DRIVE`-is-untrackable distinction explicit. Must stay free of server imports (it is bundled to the client)
- [X] T007 [P] Port `services/progress-calc.ts` into `src/lib/learning/progress.ts` — `computeProgressPercent` over **required** lessons keyed by lesson id, `firstIncompleteLessonId`, `isCourseComplete`
- [X] T008 [P] Write `src/lib/learning/audience.ts` — `audienceWhere(rows, now)` compiling audience rules into ONE `Prisma.UserWhereInput` (`OR` across rows, always `AND status: "ACTIVE"`), and `bandStartDateRange(band, now)` so a `TENURE_BAND` audience filters on `startDate` and never the stale stored `tenureBand` column (research D2). No audience kind may use negation — a null registry field simply matches nothing
- [X] T009 [P] Write `src/lib/learning/actor.ts` — `requireLearner()`: `requireUser()` then `getImpersonation()`, **refusing while impersonation is active** (FR-026). Document that no learning write may accept a user id as a parameter

### THE access derivation

- [X] T010 Write `src/lib/learning/access.ts` using FFLMS's `course-assignment-calc.ts` as the starting shape, extended from 2 routes to **4**: live direct `CourseAssignment` · live group assignment via `LearnerGroupMember` · matching a live `CourseAudience` · an **in-progress `CourseEnrollment`** (`completedAt == null && accessWithdrawnAt == null`). Pure core `resolveRoutes(facts)`; nothing else may re-implement any part of it
- [X] T011 Add the three DB-touching entry points over that one rule in `src/lib/learning/access.ts`: `courseAccessFor(userId, courseId)`, `accessibleCoursesFor(userId)`, and `courseRoster(courseId)` — each a bounded number of queries, **never one query per employee**
- [X] T012 [P] Write `tests/learning-progress.test.ts` — required-vs-optional denominator, all-optional course reads 100%, reorder/rename cannot move the figure, resume point
- [X] T013 [P] Write `tests/learning-audience.test.ts` — each audience kind compiles correctly, rows union rather than intersect, a `TENURE_BAND` compiles to a date range, employees with null department / business unit / employment type / start date match nothing and raise nothing
- [X] T014 [P] Write `tests/learning-access.test.ts` — each of the four routes grants alone; two routes with one removed still grants (SC-006); an in-progress enrollment grants after every other route is gone (SC-010); a **completed** enrollment does not; a **withdrawn** one does not; someone who never started loses it immediately (FR-045)

**Checkpoint**: `npx tsc --noEmit` clean, three test files passing, migration proven twice.

---

## Phase 3: User Story 1 — Publish a course and let employees complete it (P1) 🎯 MVP

**Goal**: HR builds and publishes a course; employees find it, work through it, and finish it.

**Independent test**: build a two-section, four-lesson course (one optional), publish it, complete the
three required lessons as an employee, confirm the course reports itself complete and a second
employee sits at 0%. Quickstart scenarios 1, 2, 3, 11.

- [X] T015 [US1] Write `src/app/(app)/admin/learning/actions.ts` — `createCourse`, `updateCourse`, `publishCourse` (completeness gate naming the **first specific gap**, FR-006), `unpublishCourse` (FR-007), `deleteCourse` (refused while any enrollment exists), all `requireAdmin()`
- [X] T016 [US1] Add curriculum actions to the same file — `upsertSection`, `deleteSection` (soft), `upsertLesson`, `deleteLesson` (soft), `upsertLessonBlock`, `deleteBlock`, `reorderSections`, `reorderLessons`, `reorderBlocks`. Reordering **must never touch `LessonProgress`** (FR-023). `TEXT` blocks are **sanitised server-side before storage** — they are later rendered as HTML
- [X] T017 [US1] Write `src/app/(app)/admin/learning/page.tsx` — the course list with status chips and an Add course action, `requireAdmin()`, house `BackLink`
- [X] T018 [US1] Write `src/app/(app)/admin/learning/[courseId]/page.tsx` — the builder shell with the three tabs (Content · Access · People) in the `AdminBenefitsTabs` idiom, per mockup surface 1
- [X] T019 [P] [US1] Write `src/components/learning/CourseBuilder.tsx` + `SectionList.tsx` — the section/lesson tree with drag-reorder, matching the approved mockup
- [X] T020 [P] [US1] Write `src/components/learning/LessonEditor.tsx` + `BlockEditor.tsx` — the right-hand editor: title, required/optional, blocks for video link / text / file. File blocks upload to the private Blob store as `profile/documents-actions.ts` does; **video is a link field only, never an upload** (research D8)
- [X] T021 [US1] Write `src/app/api/learning/blocks/[id]/file/route.ts` — streams a `FILE` block via `streamPrivateBlob`, authorised by `courseAccessFor()`. A blob URL is never handed to a client that could not open the course
- [X] T022 [US1] Write `src/app/(app)/learning/actions.ts` — `openCourse` (creates the `CourseEnrollment` on **first open**, not on assignment — research D4), `markLessonComplete`, `markLessonIncomplete`. Every one begins with `requireLearner()`; **no learner-id parameter anywhere in this file**
- [X] T023 [US1] Write `src/app/(app)/learning/page.tsx` — "My learning", reading `accessibleCoursesFor()`. Framed as obligations, not a catalogue: no browse, no search, no enrol. Per mockup surface 3
- [X] T024 [P] [US1] Write `src/components/learning/CourseCard.tsx` — the progress bar, next-up line, and the navy Continue/Start action; green reserved for the completed state only
- [X] T025 [US1] Write `src/app/(app)/learning/[courseId]/page.tsx` — the player shell, gated by `courseAccessFor()` so a draft or unreachable course is refused server-side, not merely hidden (FR-005, FR-016)
- [X] T026 [P] [US1] Write `src/components/learning/LessonNav.tsx` + `CoursePlayer.tsx` — lesson list with completion ticks, content area, Mark complete, resume via `firstIncompleteLessonId`. Per mockup surface 4 (the video gate itself lands in US3)

**Checkpoint**: US1 is independently shippable — a company-wide `OPEN` course already works end to end.

---

## Phase 4: User Story 2 — Assign a course to the right people (P2)

**Goal**: restrict a course and route it by live audience, group, or direct assignment.

**Independent test**: restrict a course to "Consulting", confirm a Finance employee cannot reach it
including by direct URL, create a new Consulting employee and confirm they hold it on first sign-in
with no HR action. Quickstart scenarios 5, 6, 7.

- [X] T027 [US2] Write `src/app/(app)/admin/learning/access-actions.ts` — `setVisibility`, `addAudience` (validated per kind against the real registry), `removeAudience`, `assignToUser`, `assignToGroup`, `revokeAssignment` (stamps `revokedAt`, never deletes). Idempotent via the unique keys (FR-018); **creates no enrollment** (research D4)
- [X] T028 [US2] Add group actions to the same file — `createGroup`, `renameGroup`, `deleteGroup` (refused while it holds a live assignment), `addGroupMembers`, `removeGroupMember`. Names trimmed and deduped case-insensitively, following `src/lib/departments.ts`
- [X] T029 [US2] Add `withdrawGrandfatheredAccess` to the same file — stamps `accessWithdrawnAt`, **refused unless that enrollment is currently grandfathered**, so it can never strip access someone holds by a real route (FR-043/FR-044)
- [X] T030 [P] [US2] Write `src/components/learning/AudiencePicker.tsx` — the Access tab's route table with a live "people today" count per row, per mockup surface 1
- [X] T031 [P] [US2] Write `src/components/learning/GroupManager.tsx` and `src/app/(app)/admin/learning/groups/page.tsx` — named groups with membership, in the `DepartmentsManager` read-first idiom
- [X] T032 [US2] Surface the grandfathered state on the employee's My learning card — the gold "you can still finish it" treatment from mockup surface 3, driven by the route the derivation already returns
- [X] T033 [US2] Add the reopen contract to `upsertLesson` in `src/app/(app)/admin/learning/actions.ts` — `onExistingCompletions: "REOPEN" | "KEEP"`, counted **inside the transaction** against `courseRoster(courseId)`, **refusing the edit when completions exist and no choice was supplied** (FR-039). `REOPEN` sets `firstCompletedAt`, clears `completedAt`, stamps `reopenedAt`; nothing is deleted (FR-040)
- [X] T034 [P] [US2] Write `src/components/learning/ReopenDialog.tsx` and the read-only `countAffectedByRequiredChange` helper — per mockup surface 2. The dialog is the affordance; T033's refusal is the guarantee

**Checkpoint**: restricted courses, live audiences, grandfathering and reopening all work.

---

## Phase 5: User Story 3 — Make sure the video was actually watched (P3)

**Goal**: watch-percentage gating and in-video checkpoints, enforced server-side.

**Independent test**: set an 80% gate and a checkpoint; skipping to the end cannot complete the
lesson **even with the control re-enabled in devtools**; playback pauses at the checkpoint; rewinding
never reduces credited time. Quickstart scenarios 4, 10.

- [X] T035 [US3] Add `saveVideoProgress` to `src/app/(app)/learning/actions.ts` — upsert with `videoWatchedSec = GREATEST(existing, incoming)` **in SQL**, not a read-then-`Math.max`, so two open tabs cannot lose an update (FR-028, research D6)
- [X] T036 [US3] Enforce the gate inside `markLessonComplete` against the **stored** `videoWatchedSec`, never a client-supplied figure — a DOM-forced attempt must be refused by the server (SC-005)
- [X] T037 [US3] Add `upsertCheckpoint` / `deleteCheckpoint` to `src/app/(app)/admin/learning/actions.ts`, and refuse both a checkpoint and a non-zero `minWatchPercent` when the lesson's video is `DRIVE` — with the explanation, not a silent drop (FR-031). Re-validate at publish
- [X] T038 [P] [US3] Write `src/components/learning/VideoLesson.tsx` — one shared tick handler across native `<video>`, the YouTube IFrame API and the Vimeo SDK: forward-only watched accumulation (ignore deltas > 1.5s so seeking forward earns nothing), resume position, saves throttled to ~5s
- [X] T039 [P] [US3] Write `src/components/learning/CheckpointPrompt.tsx` — pauses playback, asks, resumes on answer. Answers are **never stored** (FR-032)
- [X] T040 [P] [US3] Write `src/components/learning/LessonVideoSettings.tsx` — the watch-% and checkpoint editors, with the Drive refusal state from mockup surface 1
- [X] T041 [US3] Show the gate as a **fact** on the player ("you've watched 62% — watch 80% to complete"), not a blocked-action error, per mockup surface 4

**Checkpoint**: gating holds against a hostile client; Drive videos play but never pretend to be gated.

---

## Phase 6: User Story 4 — See who has completed what (P4)

**Goal**: HR sees who holds a course, by which route, and how far they have got.

**Independent test**: with a course reaching six people in mixed states, the roster shows each with
their route and progress, distinguishes grandfathered rows, shows a superseded completion's original
date alongside its reopen date, and updates without a manual reload. Quickstart scenario 8.

- [X] T042 [US4] Write `src/app/(app)/admin/learning/[courseId]/roster` (the People tab) reading `courseRoster()` — never a second access query
- [X] T043 [P] [US4] Write `src/components/learning/CourseRoster.tsx` — Route as a first-class column, gold-tinted grandfathered rows with Withdraw, original + reopened dates, all through `formatDate` (dd/mm/yyyy). Per mockup surface 5
- [X] T044 [US4] Drop `AutoRefresh` into the roster page so it stays live while it sits open (FR-034) — a monitored server page never re-renders on its own

---

## Phase 7: Polish & Cross-Cutting

- [X] T045 Register the module in `src/lib/modules.ts` — `{ key: "learning", label: "Learning", href: "/learning" }` — so it honours the existing release switch
- [X] T046 Add the Learning nav item to `NAV` in `src/components/AppShell.tsx` with a distinct icon (not a reused one — the Incentive/Benefits icon clash cost a round before). **Snapshot to `ui-versions/AppShell/` first** — this is an existing file
- [X] T047 Add the Learning card to `src/app/(app)/admin/page.tsx`. **Snapshot to `ui-versions/admin-home/` first**
- [X] T048 Add a Learning tile to `src/app/(app)/dashboard/page.tsx` showing outstanding courses, in the existing card idiom. **Snapshot first**. Skip only if the tile cannot earn its place — the dashboard was deliberately trimmed on 2026-08-18
- [X] T049 Run the full quickstart — all 11 scenarios — and record what was verified and how, naming anything not verifiable from a session
- [X] T050 `npx tsc --noEmit` and `npm run build` green, with every type error across the outcome fixed
- [X] T051 Update `PROJECT_DETAILS.md` (models, routes, behaviour), `IMPLEMENTATION_PROGRESS.md` (**Phase 9 — Learning Track moves off "Not started"**), `IMPLEMENTATION_PLAN.md` (decisions log: LMS adopted from FFLMS, video linked not hosted, Q1/Q2 answers), and `CLAUDE.md` if a new pattern was established — in the **same commit** as the code (Principle IV)

---

## Phase 8: Course materials, resources & rating (added 2026-08-22, mockup-approved)

- [X] T052 `prisma/schema.prisma`: `CourseDocument` (unique `courseId`+`slot`), `CourseResource`, `CourseRating` (unique `courseId`+`userId`), enums `CourseDocumentSlot` / `CourseResourceKind` / `CourseResourceStatus`, and `CourseEnrollment.ratingPromptDoneCount`
- [X] T053 `prisma/sql/064_course_materials.sql` — additive and idempotent, in the same commit
- [X] T054 `src/lib/learning/materials.ts` — the ONE source of `EMPLOYEE_VISIBLE_SLOTS`, plus resource kinds, URL normalising, previewability, `averageStars`, `shouldAskForRating`
- [X] T055 `src/app/api/learning/documents/[id]/route.ts` — re-decides visibility per request; 404 (not 403) for an HR-only slot
- [X] T056 `src/app/(app)/admin/learning/materials-actions.ts` — upload/replace/remove a slot, add/remove a resource, approve/decline a suggestion
- [X] T057 Learner actions in `src/app/(app)/learning/actions.ts` — `rateCourse`, `dismissFinishPanel`, `suggestResource` (PENDING only, capped at 10 per person per course)
- [X] T058 `CourseMaterials.tsx` (Materials tab) + a fourth tab in `LearningTabs.tsx`. **Snapshot `LearningTabs` first**
- [X] T059 `MaterialsPanel.tsx` — employee slides preview + resources + suggest form; mounted as a curriculum entry in `CoursePlayer.tsx`. **Snapshot `CoursePlayer` first**
- [X] T060 `CourseFinishPanel.tsx` — 1–5 rating + suggest, shown once per completion, never blocking
- [X] T061 `SuggestionQueue.tsx` on `/admin/learning` + the gold badge on Admin home
- [X] T062 `scripts/verify-course-materials.mts` against a throwaway Postgres, and the migration applied twice + diffed against the schema
- [X] T063 `npx tsc --noEmit` + `npm run build` green; docs updated in the same commit

---

## Dependencies

```
Phase 1 Setup
      ↓
Phase 2 Foundational ── T003→T004→T005 (schema chain)
      │                 T006,T007,T008,T009 [P] (pure libs)
      │                 T010→T011 (THE derivation) → T012,T013,T014 [P] (tests)
      ↓
Phase 3 US1 (P1) ── MVP, independently shippable
      ↓
Phase 4 US2 (P2) ── needs US1's courses to route
      ↓
Phase 5 US3 (P3) ── needs US1's player to gate
      ↓
Phase 6 US4 (P4) ── needs US2's routes to report
      ↓
Phase 7 Polish
```

**The one hard rule**: T010–T011 precede every page and action. Nothing is built against a placeholder
access check.

US3 is genuinely independent of US2 — gating a video needs no assignment model — so US3 could be
pulled forward if the video experience matters more than restriction.

## Parallel opportunities

- **Phase 2**: T006, T007, T008, T009 are four separate new files with no shared imports
- **Phase 2 tests**: T012, T013, T014 once their subjects exist
- **Phase 3**: T019, T020, T024, T026 are separate components; the pages and actions they mount into are not
- **Phase 5**: T038, T039, T040 are three separate components

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3.** That delivers a real, useful thing: HR publishes a course open
to everyone, employees complete it, progress is tracked. Every phase after narrows *who* sees a
course, tightens *how* completion is earned, or reports on it.

Ship in phase order and stop wherever the value runs out — each checkpoint is a coherent product, not
a half-built one.

## Task count

| Phase | Tasks |
|---|---|
| 1 Setup | 2 |
| 2 Foundational | 12 |
| 3 US1 (P1) | 12 |
| 4 US2 (P2) | 8 |
| 5 US3 (P3) | 7 |
| 6 US4 (P4) | 3 |
| 7 Polish | 7 |
| 8 Materials (2026-08-22) | 12 |
| **Total** | **63** |
