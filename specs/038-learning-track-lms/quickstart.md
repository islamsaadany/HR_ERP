# Quickstart: proving the Learning Track works

**Feature**: `specs/038-learning-track-lms` · Phase 1 output

A validation guide, not an implementation guide. Each scenario maps to a success criterion and is
checkable by a person in a browser or by a small script against a throwaway database.

## Prerequisites

```bash
npx tsc --noEmit          # must be clean
npm run build             # must be green
```

Migration proof (never against the user's Neon database — constitution, Technology & Data
Constraints). A local Postgres 16 is available under `/usr/lib/postgresql/*/bin`:

```bash
# apply the whole chain into a throwaway DB, then apply 060 a SECOND time
node scripts/apply-sql.mjs            # with DATABASE_URL pointed at the throwaway
node scripts/apply-sql.mjs            # must report nothing applied
```

Expect: 12 tables and 5 types created on the first run, **zero statements** on the second, and no
drift against `prisma/schema.prisma`.

## Seed shape for the scenarios

Six employees is enough to exercise every route: two in Consulting (one full-time, one part-time),
one in Finance, one with **no department set**, one hired last week (no tenure band), and one `LEFT`.
One manager with two direct reports. One course, two sections, four lessons — one video with an 80%
gate and a checkpoint at 30 s, one text, one file, one optional.

---

## Scenario 1 — Author and publish (SC-001, FR-006)

1. As HR, create a course, add two sections, add the four lessons, publish.
2. **Before** filling the second section, attempt to publish.

**Expect**: the attempt is refused and names the gap ("Section 2 has no lessons"), not a generic
error. After filling it, publishing succeeds and the course becomes visible to those it reaches.

## Scenario 2 — The learning loop (SC-002, FR-022, FR-024, FR-025)

1. As a reached employee, open the course. Complete the text and file lessons.
2. Close the browser. Reopen the course.
3. Complete the last required lesson.

**Expect**: progress counts **required** lessons only (the optional one never moves the figure);
reopening lands on the first incomplete lesson; the course marks itself complete with today's date in
**dd/mm/yyyy**, with no separate action.

## Scenario 3 — Curriculum edit cannot corrupt progress (SC-004, FR-023)

With a learner at 2 of 3 required lessons, as HR: reorder the lessons, rename one, and add an
optional lesson.

**Expect**: the learner's percentage and completed lessons are **byte-identical** before and after.
This is the check that proves progress is keyed by lesson identity, not position.

## Scenario 4 — The watch gate holds against a hostile client (SC-005, FR-027/028)

1. As the learner, drag the video playhead to the end. Attempt to mark complete.
2. Re-enable the disabled control in devtools and submit anyway.
3. Play properly past 80%, then rewind to the start.

**Expect**: (1) refused, with how much is left; (2) **refused by the server** — this is the one that
matters, the gate is checked against stored `videoWatchedSec`, not the client's claim; (3) the
credited figure does not drop after rewinding, and the lesson can be completed.

Also: with the lesson open in **two tabs**, watch to different points and confirm the stored figure
ends at the higher of the two, never the last writer's.

## Scenario 5 — Live audiences (SC-003, FR-014, FR-016)

1. Restrict the course; add the audience "Consulting department".
2. Confirm the Consulting employees hold it and the Finance employee does not — including by pasting
   the course URL directly.
3. **Create a new employee in Consulting.** Sign in as them.
4. Check the employee with **no department**, and the one hired last week, against a `TENURE_BAND`
   audience.

**Expect**: (3) the new joiner holds the course on first sign-in with **no HR action after saving the
employee record**; (2) the direct URL is refused server-side, not merely hidden; (4) missing fields
match nothing and raise nothing, and the recent hire falls outside every band range rather than
erroring.

## Scenario 6 — Two routes, one removed (SC-006, FR-015)

Give one employee both a direct assignment and membership of an assigned group. Remove the group's
assignment.

**Expect**: they keep the course through the direct assignment. Then remove that too, and confirm
they lose it — provided they never started (Scenario 7 covers the other case).

## Scenario 7 — Grandfathering (SC-010, FR-042/043/045)

1. Employee A opens the course and completes one lesson. Employee B is reached but never opens it.
2. Remove the only route reaching both.

**Expect**: A still sees and can finish the course; B loses it immediately. Both keep their rows.
Then, as HR, withdraw A's grandfathered access and confirm it ends — and confirm the same withdraw
action is **refused** against someone holding the course by a real route.

## Scenario 8 — Reopening (SC-011, FR-039/040/041)

1. With three people complete and one of them since moved out of the audience, add a **required**
   lesson.
2. Submit the edit **without** a choice (simulate a client that skips the dialog).
3. Submit with `REOPEN`.

**Expect**: (2) **refused**, returning the affected count — nothing applied silently; (3) the two
people the course still reaches return to in-progress with `firstCompletedAt` preserved and
`reopenedAt` stamped; the person who moved on is **not** drawn back in; the roster shows the original
completion date alongside the reopen date.

## Scenario 9 — Impersonation (SC-009, FR-026)

As a Super User, "View as employee" a learner, open their course, and attempt to mark a lesson
complete.

**Expect**: the Learning list and player **render** exactly as the employee sees them, and the write
is refused. Zero `LessonProgress` rows are created during the impersonated session.

## Scenario 10 — Untrackable video (FR-031)

Add a Google Drive video to a lesson, then try to set an 80% gate and add a checkpoint.

**Expect**: both refused, with an explanation that this source cannot be measured. The video still
plays. Nothing anywhere claims a gate is in force.

## Scenario 11 — Draft and unpublish (FR-005, FR-007)

Take a published course with active learners back to draft.

**Expect**: it vanishes from every employee's list and its direct URL is refused; all progress
survives; republishing restores everyone's exact position.

---

## What this guide deliberately does not cover

Quizzes, gradable assignments, certificates, discussions, notifications, analytics and roster export
are **out of scope for this release** (spec → Assumptions). If a scenario above seems to need one of
them, that is a scope error worth raising, not a gap to fill.
