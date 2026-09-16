# Internal contracts — Learning Tracks (spec 043)

This feature exposes no public API. Its contracts are internal: the derivations other code must go
through, the server actions the browser can reach, and one cron route. They are written down because
each is a place where a second implementation would silently fork a rule.

---

## Derivations — the things nothing may duplicate

### `resolveRoutes` (EDIT — `src/lib/learning/access.ts`)

```
AccessRoute        += "TRACK"
AccessFacts        += hasTrackAssignment: boolean
```

One line inside the `published && viewerIsActive` block:
`if (facts.hasTrackAssignment) routes.push("TRACK")`.

**Contract**: nothing outside this file may decide access from track membership. Not the learner's
list, not the admin roster, not a screen that "already has the data to hand". The three fact-gatherers
populate the fact; the rule decides.

**Consequence to keep**: `grandfatheredOnly` is computed from the learner routes, so a person whose
only remaining route is `IN_PROGRESS` after losing a track is correctly reported as grandfathered
with no new code.

### `resolveDeadline` (NEW — `src/lib/learning/deadlines.ts`)

```
resolveDeadline(
  step:     { dueDays: number | null; dueOn: Date | null },
  joinedAt: Date,
): Date | null
```

Pure. Both kinds in, one real date out, `null` when the step has no deadline. **Every** screen,
comparison, sort and reminder reads this. A second resolution written for a screen is how a person
is told one date and chased on another — FR-019a exists for exactly that.

```
isOverdue(due: Date | null, completedAt: Date | null, now: Date): boolean
REMINDER_SCHEDULE: readonly [0, 7, 14, 21, 28]   // days after due; a const, never a column
earliestDeadline(candidates: (Date | null)[]): Date | null
```

`earliestDeadline` is what a course in two tracks goes through — after both are resolved, never
before.

### `trackOrderFor` (EDIT — `src/lib/learning/order.ts`)

The sequence a person meets their courses in. Extends the existing file rather than adding a second
ordering module: track courses first, grouped by track in the track's step order; then everything
else in the company-wide course order.

---

## Server actions

All in `src/app/(app)/admin/learning/tracks/actions.ts` (`"use server"`). **Every export is an async
function** — result types live in `src/lib/learning/track-results.ts`, a plain module. One stray
non-function export breaks every action on the page, with no type error and no build failure.

Each action is: the access check, validation, then a call into `src/lib/learning/tracks.ts` where the
raw write lives. The write module is importable by the verify script; the action is not an endpoint
the script should be exercising.

| Action | Guard | Notes |
|---|---|---|
| `createTrack(formData)` | `requireLearningManager` | |
| `updateTrack(trackId, formData)` | `requireLearningManager` | Leaves a field the form did not carry alone — never reads absent as cleared. |
| `deleteTrack(trackId)` | `requireLearningManager` | States what goes with it *before* the confirmation, not after. |
| `addStep(trackId, courseId)` | `requireLearningManager` | Refuses a course that is not PUBLISHED. |
| `removeStep(stepId)` | `requireLearningManager` | Does not touch enrollments. |
| `reorderSteps(trackId, stepIds[])` | `requireLearningManager` | Same guard shape as `reorderCoursesWithin`: iterate what the DB says is in the track and refuse a list that does not account for all of it. |
| `setStepDeadline(stepId, kind, value)` | `requireLearningManager` | Refuses both kinds at once; the check constraint is the backstop. |
| `assignTrack(trackId, { userId? , groupId? })` | `requireLearningManager` | |
| `revokeTrack(assignmentId)` | `requireLearningManager` | Sets `revokedAt`; never deletes. |
| `addPersonalStep(userId, courseId)` | **manager of that user, resolved now** | The only write a manager has. |
| `reorderPersonalSteps(userId, ids[])` | manager of that user | May not move a company requirement — there is no id it could name, and the server re-checks. |
| `removePersonalStep(id)` | manager of that user | Only their own additions; a company step has no path here. |
| `setRemindersEnabled(on: boolean)` | **asymmetric** | `false` → `requireLearningManager`. `true` → `requireAdmin`. Two guards, one write path. |

### The refusals a reviewer should look for

1. A manager acting on somebody who is not their direct report **today** — resolved against the
   current org chart, like time-off approvals, never a stored snapshot.
2. A manager reaching a `LearningTrackStep`. There is no action that lets them; the server re-checks
   anyway.
3. A step carrying both kinds of deadline.
4. A reorder whose list does not account for every step in the track.
5. `setRemindersEnabled(true)` by a learning manager who is not an HR Admin.

---

## Cron route

`GET /api/cron/learning` — `Authorization: Bearer ${CRON_SECRET}`, 401 otherwise. `dynamic = "force-dynamic"`.

```
1. Both switches on?  NotificationSettings.emailEnabled && LearningSettings.deadlineRemindersEnabled
   → if either is off, return { ok: true, skipped: "disabled" } and send nothing.
2. One bounded sweep of incomplete enrollments whose resolved deadline has passed.
   (Completion removes a person from this set — that is how "stops when met" is true.)
3. For each, the days since due must be in REMINDER_SCHEDULE — otherwise skip.
4. Insert LearningReminderLog; a unique violation means today is already done → skip silently.
5. Send to the employee; send to their manager, or to whoever runs Learning if they have none.
6. Fire-and-forget: a failure is logged and the sweep continues. The log row is written only on
   a successful send.
```

Returns `{ ok, overdue, emailed, skipped }` — a count a person can read in a deploy log.

---

## Email templates (EDIT — `src/lib/email/templates.ts`)

| Template | To | Says |
|---|---|---|
| `learningOverdue` | the employee | The course, the date it was due (dd/mm/yyyy), the track it belongs to, a link |
| `learningOverdueManager` | their manager | Who, which course, how overdue |

Both go through the existing branded sender, so the business-unit colour and contrast rules apply
with nothing new written.

---

## What this feature does NOT expose

No public HTTP API. No new file-serving route. No new module switch entry — tracks live inside
Learning, which is already under one; stated here so nobody adds a second (the 2026-08-26 rule is
about modules that ship *without* a switch, not about adding a redundant one).
