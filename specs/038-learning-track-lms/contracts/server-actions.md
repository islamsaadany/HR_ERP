# Contracts: server actions & route handlers

**Feature**: `specs/038-learning-track-lms` · Phase 1 output

House conventions apply throughout: actions return the shared `ActionState`-style result used by the
existing admin actions and surface failure through the `ff-toast`; every action re-checks its own
authorisation server-side; nothing trusts a value the client could have edited.

**Authorisation legend** — `ADMIN` = `requireAdmin()` (HR Admin or Super User) ·
`LEARNER` = `requireLearner()` (signed-in, **refused while impersonating**, learner id taken only
from the resolver — never a parameter).

---

## Authoring — `src/app/(app)/admin/learning/actions.ts` · all `ADMIN`

| Action | Input | Behaviour |
|---|---|---|
| `createCourse` | title, summary? | Creates a `DRAFT`. Returns its id. |
| `updateCourse` | courseId, title, summary?, category?, order?, cover? | Cover goes to private Blob. |
| `publishCourse` | courseId | Runs the completeness gate (FR-006) and **names the first gap** — "Section 2 has no lessons", "Lesson 'Intro' has no content". Re-validates the `DRIVE`-gate invariant. Refuses otherwise. |
| `unpublishCourse` | courseId | Back to `DRAFT`. Employees lose sight of it immediately; no progress is touched (FR-007). |
| `deleteCourse` | courseId | Refused while any `CourseEnrollment` exists — unpublish instead. |
| `reorderSections` / `reorderLessons` | ids in order | One transaction. **Never touches `LessonProgress`** (FR-023). |
| `upsertSection` / `deleteSection` | — | Delete is a soft delete. |
| `upsertLesson` | sectionId, title, isRequired, estimatedMinutes?, minWatchPercent?, **onExistingCompletions?** | See *The reopen contract* below. |
| `deleteLesson` | lessonId | Soft delete. Percentages recompute over what remains. |
| `upsertLessonBlock` / `deleteBlock` / `reorderBlocks` | — | `TEXT` is **sanitised server-side before storage** — it is later rendered as HTML. |
| `upsertCheckpoint` / `deleteCheckpoint` | lessonId, atSec, prompt, options[], correctIndex | Refused when the lesson's video is `DRIVE` (FR-031). |

### The reopen contract (FR-039 – FR-041)

`upsertLesson` — and any edit that **increases the required-lesson set** (a new required lesson, or
flipping `isRequired` false→true) on a **published** course — takes an optional
`onExistingCompletions: "REOPEN" | "KEEP"`.

Inside one transaction the action:

1. Counts enrollments with `completedAt != null` **that are also in `courseRoster(courseId)`** — people
   the course still reaches (FR-041).
2. **If that count > 0 and no choice was supplied → refuses**, returning the count so the UI can
   prompt. *The prompt is an affordance; this refusal is the guarantee.* A client that skips the
   dialog cannot apply either outcome silently (FR-039).
3. `REOPEN` → for each: set `firstCompletedAt` (from `completedAt` when not already set), clear
   `completedAt`, stamp `reopenedAt`. Nothing is deleted (FR-040).
4. `KEEP` → completions stand; the added lesson is not required of them.

A read-only `countAffectedByRequiredChange(courseId)` exists **for the dialog only**. It is never the
authority — the count is re-taken inside the write.

---

## Access management — `src/app/(app)/admin/learning/access-actions.ts` · all `ADMIN`

| Action | Input | Behaviour |
|---|---|---|
| `setVisibility` | courseId, OPEN \| RESTRICTED | Existing enrollments are untouched. |
| `addAudience` | courseId, kind, value? | Validated per kind (a real department label, a live `BusinessUnit.id`, a valid enum, an active manager). Duplicates are a no-op via the unique key (FR-018). |
| `removeAudience` | audienceId | People mid-course keep it (FR-042); people who never started lose it now (FR-045). |
| `assignToUser` / `assignToGroup` | courseId, targetId | Idempotent. **Does not create an enrollment** — enrollment happens on first open (research D4). |
| `revokeAssignment` | assignmentId | Stamps `revokedAt`. Never deletes. |
| `createGroup` / `renameGroup` / `deleteGroup` | — | Names trimmed and deduped case-insensitively, following `lib/departments.ts`. Delete is refused while the group holds a live assignment. |
| `addGroupMembers` / `removeGroupMember` | groupId, userId[] | Live effect, no back-fill. |
| `withdrawGrandfatheredAccess` | enrollmentId | Stamps `accessWithdrawnAt` (FR-043/FR-044). Refused unless that enrollment is *currently* grandfathered — it must not be usable to strip access someone holds by a real route. |

---

## Learning — `src/app/(app)/learning/actions.ts` · all `LEARNER`

Every one of these begins with `requireLearner()` and then `courseAccessFor(learner.id, courseId)`.
There is **no** learner-id parameter anywhere in this file.

| Action | Input | Behaviour |
|---|---|---|
| `openCourse` | courseId | Creates the `CourseEnrollment` if absent (`startedAt = now`) — this is the moment "assigned" becomes "started". Returns the resume lesson. |
| `markLessonComplete` | lessonId | Refused unless the watch gate is satisfied **server-side** from the stored `videoWatchedSec` (FR-027, SC-005 — a DOM-forced attempt must fail). Recomputes the course percentage; sets `completedAt` when the required set is done (FR-025). |
| `markLessonIncomplete` | lessonId | Clears the lesson's completion; a course completion recomputes with it. |
| `saveVideoProgress` | lessonId, positionSec, watchedSec | Upsert with `videoWatchedSec = GREATEST(existing, incoming)` **in SQL** (FR-028, race-proof across tabs). Throttled client-side to roughly every 5 s. |

---

## Route handlers

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/learning/courses/[id]/cover` | signed-in + access check | Streams the private cover blob via `streamPrivateBlob`. |
| `GET /api/learning/blocks/[id]/file` | signed-in + access check on the owning course | Streams a `FILE` block. |
| `GET /api/learning/blocks/[id]/video` | signed-in + access check | **Shape depends on the open video-delivery decision** (plan.md → *Open Decision*). Under the private-streaming option this route must implement HTTP **Range**, which `streamPrivateBlob` does not do today. |
| `POST /api/learning/upload` | `ADMIN` | Client-direct upload handshake, if uploads are in scope after the video decision. |

**Authorisation on every one of these is `courseAccessFor()`** — the same derivation the pages use.
A blob URL is never handed to a client that could not open the course.

---

## What has no contract here, deliberately

No email. No cron. No new environment variable. No public or unauthenticated route — the certificate
verification page that would have needed one is deferred with certificates.
