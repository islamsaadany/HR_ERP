# Data Model: Learning Track

**Feature**: `specs/038-learning-track-lms` · **Date**: 2026-08-21 · Phase 1 output

Twelve new models, one new file `prisma/sql/060_learning_track.sql`. **No change to `User`** beyond
back-relations. No new enum values on `Role`. Nothing here is named `Module` or `Announcement`.

---

## Enums

```
LearningCourseStatus   DRAFT | PUBLISHED
LearningVisibility     OPEN | RESTRICTED
LessonBlockType        VIDEO | TEXT | FILE
AudienceKind           ALL_ACTIVE | DEPARTMENT | BUSINESS_UNIT | EMPLOYMENT_TYPE | TENURE_BAND | REPORTS_TO
VideoSource            YOUTUBE | VIMEO | DRIVE | DIRECT_FILE
```

`VideoSource` is stored, not re-derived on read, so a lesson's trackability is a fact the server can
check without re-parsing a URL. `DRIVE` is the untrackable one (FR-031). There is no `UPLOAD` member:
video is linked, never hosted (research D8).

---

## Content hierarchy

### `Course`
| Field | Type | Notes |
|---|---|---|
| `id` | cuid | |
| `title` | String | |
| `summary` | String? | |
| `coverBlobUrl` | String? | private blob, streamed like every other image |
| `category` | String? | free text in v1; a managed lookup is a later addition |
| `status` | LearningCourseStatus | default `DRAFT` — invisible to employees (FR-005) |
| `visibility` | LearningVisibility | default `RESTRICTED`; `OPEN` = all active employees (FR-010) |
| `order` | Int | HR-controlled display order |
| `createdById` / `updatedById` | String? → User | audit; `SetNull` |
| `publishedAt` | DateTime? | |
| `createdAt` / `updatedAt` | DateTime | |

**Invariants**: publishing requires ≥1 section, every section ≥1 lesson, every lesson ≥1 block
(FR-006). Enforced server-side in `publishCourse`, not by the database.

### `CourseSection`
`id` · `courseId` → Course (`Cascade`) · `title` · `order` Int · `deletedAt` DateTime?
`@@unique([courseId, order])` · `@@index([courseId])`

> Named `CourseSection`, never `Module`. `ModuleFlag` already means "app area" in this schema.

### `Lesson`
| Field | Type | Notes |
|---|---|---|
| `sectionId` | → CourseSection (`Cascade`) | |
| `title` | String | |
| `order` | Int | `@@unique([sectionId, order])` |
| `isRequired` | Boolean | default `true` (FR-004) — only required lessons count toward progress |
| `estimatedMinutes` | Int? | |
| `minWatchPercent` | Int | default `0` = no gate (FR-027) |
| `deletedAt` | DateTime? | soft delete — keeps completions meaningful (FR-023) |

**Invariant**: `minWatchPercent > 0` and any `VideoCheckpoint` are **refused** when the lesson's video
block has `source = DRIVE` (FR-031). Checked in the curriculum action, and again at publish.

### `LessonBlock`
`id` · `lessonId` → Lesson (`Cascade`) · `type` LessonBlockType · `order` Int ·
`text` String? (sanitised HTML for `TEXT`) · `blobUrl` String? (`FILE` only) · `externalUrl` String?
(`VIDEO` only) · `videoSource` VideoSource? · `fileName` String? · `fileSizeBytes` Int?
`@@unique([lessonId, order])`

**Invariant**: exactly one of `blobUrl` / `externalUrl` / `text` is populated, and which one is fixed
by `type` — `VIDEO` ⇒ `externalUrl` + `videoSource` (never `blobUrl`; the platform hosts no video),
`FILE` ⇒ `blobUrl`, `TEXT` ⇒ `text`.

### `VideoCheckpoint`
`id` · `lessonId` → Lesson (`Cascade`) · `atSec` Int · `prompt` String · `options` String[] ·
`correctIndex` Int · `createdAt`
`@@index([lessonId])`

Answers are **never stored** (FR-032) — a checkpoint exists only to pause and resume playback.

---

## Access routes

### `CourseAudience` — a rule, not an expansion
`id` · `courseId` → Course (`Cascade`) · `kind` AudienceKind · `value` String? · `createdById` ·
`createdAt`
`@@unique([courseId, kind, value])` · `@@index([courseId])`

`value` by kind: `ALL_ACTIVE` → null · `DEPARTMENT` → the department label · `BUSINESS_UNIT` →
`BusinessUnit.id` · `EMPLOYMENT_TYPE` → `FULL_TIME|PART_TIME` · `TENURE_BAND` → a `TenureBand` value ·
`REPORTS_TO` → the manager's `User.id`.

Rows on one course **union**. Compiled by `audienceWhere(rows, now)` into a single
`Prisma.UserWhereInput`, always `AND`-ed with `status: "ACTIVE"`. `TENURE_BAND` compiles to a
`startDate` range, not to the stored `tenureBand` column — see research D2.

### `LearnerGroup` / `LearnerGroupMember`
`LearnerGroup`: `id` · `name` (unique, trimmed, case-insensitively deduped like `Department`) ·
`createdById` · timestamps.
`LearnerGroupMember`: `id` · `groupId` (`Cascade`) · `userId` (`Cascade`) · `addedById` · `addedAt` ·
`@@unique([groupId, userId])`.

Membership is live: adding a member grants every course currently assigned to the group, with no
back-fill write (FR-014).

### `CourseAssignment` — one grant, to a person **or** a group
`id` · `courseId` (`Cascade`) · `userId?` → User (`Cascade`) · `groupId?` → LearnerGroup (`Cascade`) ·
`grantedById` · `grantedAt` · `revokedAt` DateTime?
`@@unique([courseId, userId])` · `@@unique([courseId, groupId])` · `@@index([courseId, revokedAt])`

**Invariant**: exactly one of `userId` / `groupId` is set. Revocation is a stamp, never a delete, so
the trail survives (FR-018 idempotency comes from the unique constraints).

> One model for both targets rather than FFLMS's two (`CourseAssignment` +
> `GroupCourseAssignment`), because the revoke and reconcile logic is identical and splitting it
> invites two copies of one rule.

---

## Learning state

### `CourseEnrollment` — created on **first open**, not on assignment
| Field | Type | Notes |
|---|---|---|
| `courseId` / `userId` | → Course / User (`Cascade`) | `@@unique([courseId, userId])` |
| `startedAt` | DateTime | when they first opened it |
| `completedAt` | DateTime? | null while in progress; **the grandfathering route** (research D4) |
| `firstCompletedAt` | DateTime? | survives a reopen — the original completion is never erased (FR-040) |
| `reopenedAt` | DateTime? | when required content superseded the completion |
| `accessWithdrawnAt` | DateTime? | HR ending grandfathered access (FR-043/FR-044) |
| `lastLessonId` | String? | resume hint only; the authority is `firstIncompleteLessonId` over progress rows |

**No `progressPercent` column** — the percentage is computed from `LessonProgress` (research D6).

**Grandfathering predicate** (the only definition): `completedAt == null && accessWithdrawnAt == null`.

### `LessonProgress`
`id` · `enrollmentId` (`Cascade`) · `lessonId` (`Cascade`) · `completedAt` DateTime? ·
`lastPositionSec` Int? · `videoWatchedSec` Int default 0 · timestamps
`@@unique([enrollmentId, lessonId])` · `@@index([lessonId])`

**Invariant**: `videoWatchedSec` only ever increases — advanced with SQL `GREATEST`, never a
read-then-max (research D6).

---

## Relationship map

```
Course ─┬─< CourseSection ─< Lesson ─┬─< LessonBlock
        │                            └─< VideoCheckpoint
        ├─< CourseAudience            (rule; resolved live against User)
        ├─< CourseAssignment >─ User | LearnerGroup ─< LearnerGroupMember >─ User
        └─< CourseEnrollment >─ User
                    └─< LessonProgress >─ Lesson
```

`User` gains only back-relations: authored/updated courses, assignments granted and received, group
memberships, enrollments. No new columns.

---

## Cross-cutting invariants

1. **One access derivation.** `src/lib/learning/access.ts` is the only code that decides whether a
   person may open a course. Four routes: live `CourseAssignment` to them · live `CourseAssignment` to
   a `LearnerGroup` they belong to · matching a live `CourseAudience` · an in-progress
   `CourseEnrollment`. (FR-015, FR-042)
2. **Progress is keyed by lesson identity.** Reordering or renaming never touches
   `LessonProgress.lessonId`. (FR-023)
3. **Watched time never decreases.** (FR-028)
4. **Completion is never erased**, only superseded. (FR-040)
5. **No learning write while impersonating.** (FR-026)
6. **A `DRIVE` video can carry no gate and no checkpoint.** (FR-031)
7. **Draft courses are invisible**, including by direct link. (FR-005, FR-016)

---

## Migration `prisma/sql/060_learning_track.sql`

Purely additive: five `CREATE TYPE … ` guarded by `DO $$ … EXCEPTION WHEN duplicate_object`, twelve
`CREATE TABLE IF NOT EXISTS`, their indexes and foreign keys. No existing table is altered, no data is
back-filled, nothing is dropped — so a re-run is a no-op and a rollback is a `DROP` of new tables
only. Applied by `scripts/apply-sql.mjs` at deploy per constitution 1.2.1; verified on a throwaway
Postgres 16 before commit, including a second run.
