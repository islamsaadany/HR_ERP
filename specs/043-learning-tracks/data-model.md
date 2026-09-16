# Data model — Learning Tracks (spec 043)

Five new tables. Migration `prisma/sql/078_learning_tracks.sql`, idempotent, committed with the
schema change. Nothing existing is altered except by addition.

---

## `LearningTrack`

A named, ordered path. Exists independently of who is on it.

| Field | Notes |
|---|---|
| `id` | cuid |
| `name` | Unique. Two tracks called "New consultant" is a mistake, not a use case. |
| `description` | Optional — what situation this path is for. |
| `createdById` / `updatedById` | `SetNull`, as every other Learning record does. |
| `createdAt` / `updatedAt` | |

**Rules**: deleting a track deletes its steps and assignments (cascade) but **must not** touch any
enrollment — that is what keeps a person mid-course from losing it (FR-009). The action states what
will happen before it happens (FR-005).

---

## `LearningTrackStep`

A course's place in a track, and its optional deadline.

| Field | Notes |
|---|---|
| `id` | cuid |
| `trackId` | Cascade. |
| `courseId` | Cascade. `@@unique([trackId, courseId])` — a course sits in a track once. |
| `order` | Int. Same idiom as `Course.order` and `CourseSection.order`; renumbered canonically on every reorder. |
| `dueDays` | `Int?` — a period, counted from the person's track join date. |
| `dueOn` | `DateTime? @db.Date` — a fixed calendar date. |

**The one invariant worth a database constraint**: exactly zero or one of `dueDays` / `dueOn` is set,
never both. A check constraint in `078`, because two deadlines on one step has no meaning and the
resolution function would have to pick one arbitrarily. Mirrors `ExpenseEvidence`'s
`blobUrl`/`externalUrl` check constraint (2026-08-25).

`dueOn` is `@db.Date`, not a timestamp: it is a calendar date, and a timestamp would drag a timezone
into a thing that has none. Printing it means reordering the stored string, never `new Date(iso)`.

---

## `LearningTrackAssignment`

The fact that a person, or a group, is on a track.

| Field | Notes |
|---|---|
| `id` | cuid |
| `trackId` | Cascade. |
| `userId` | `String?` — cascade. |
| `groupId` | `String?` — cascade, reusing the existing `LearnerGroup`. |
| `assignedById` | `SetNull`. |
| `assignedAt` | **Load-bearing**: this is what `dueDays` counts from. |
| `revokedAt` | `DateTime?` — removal is a revocation, not a delete, matching `CourseAssignment`. |

`@@unique([trackId, userId])` and `@@unique([trackId, groupId])`, mirroring `CourseAssignment`.

**Why `assignedAt` matters more than it looks**: for a group assignment the period must count from
when *that person* effectively joined — which is the later of the group assignment and their joining
the group. `resolveDeadline` takes the join date as a parameter rather than reading it, so this stays
one decision in one place. The builder must not assume `assignment.assignedAt` is always the answer.

---

## `LearningPersonalStep`

A course a manager added for one person, outside any company track.

| Field | Notes |
|---|---|
| `id` | cuid |
| `userId` | Cascade. |
| `courseId` | Cascade. `@@unique([userId, courseId])`. |
| `order` | Int — the person's own sequence for their additions. |
| `dueDays` / `dueOn` | Same pair, same check constraint. A period counts from `addedAt`. |
| `addedById` | `SetNull` — who added it. |
| `addedAt` | |
| `removedAt` | `DateTime?` — revocation, not delete. |

**This table is what makes FR-013 enforceable.** A manager may only ever write here. A company
requirement lives in `LearningTrackStep`, which a manager has no write path to at all — the refusal
is structural before it is a check, and the check exists anyway because "the UI doesn't offer it" has
never been a control.

---

## `LearningReminderLog`

What makes "never twice" true.

| Field | Notes |
|---|---|
| `id` | cuid |
| `userId` | |
| `courseId` | |
| `sentOn` | `DateTime @db.Date` |
| `createdAt` | |

`@@unique([userId, courseId, sentOn])`. Written **only after a successful send** — a failed send must
never be recorded as a success, or the person silently loses that reminder forever.

Deliberately not linked to the track: the reminder is about a person and a course, and if two tracks
both make a course overdue the person is still chased once. Keying on the track would email them
twice for one obligation.

---

## `LearningSettings`

Singleton, `id @default("singleton")`, mirroring `NotificationSettings`.

| Field | Notes |
|---|---|
| `id` | `"singleton"` |
| `deadlineRemindersEnabled` | `Boolean @default(false)` — **off by default**, so the reversal does not switch itself on at deploy. Turning it on is a deliberate act by an HR Admin. |
| `remindersDisabledById` / `remindersDisabledAt` | Who pulled the brake and when. A switch with no record of who moved it generates an unanswerable question later. |
| `updatedAt` | |

**What is deliberately NOT here**: the reminder cadence. It is a `const` in
`src/lib/learning/deadlines.ts`. A bound in a settings box is a decision nobody made — constitution
v2.0.0 states this as a requirement, and the verify script asserts the table has no such column.

---

## What the schema deliberately does not have

- **No `progressPercent`, no `isOverdue`, no `nextStepId`.** Position and overdue are derived on
  read, as progress and renewal lapsing already are. A stored flag is a thing that can disagree with
  the rows it summarises.
- **No per-person course order column.** See research §4.
- **No track state (draft/published).** A track reaches nobody until it is assigned, which is already
  the control. Adding a lifecycle would be a second, weaker version of the course status ladder.
- **No `LearningTrackEnrollment`.** A person's progress belongs to the course — `CourseEnrollment`
  already holds it, and a track-scoped copy would be a second source of truth about the same fact.
