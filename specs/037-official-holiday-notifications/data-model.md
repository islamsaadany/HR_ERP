# Data Model: Official Holidays — Verification, Bridges & Team Vacation Notifications

**Date**: 2026-08-19 · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

## PublicHoliday (evolved in place — same table)

| Field | Type | Notes |
|---|---|---|
| `id` | String cuid PK | unchanged |
| `name` | String | English name (unchanged) |
| `localName` | String? | Arabic name from the fetch source; nullable (manual entries may omit) |
| `originalStart` | DateTime | announced range start, UTC midnight |
| `originalEnd` | DateTime | announced range end (== start for single-day) |
| `actualStart` | DateTime | observed range start — **what counting uses** |
| `actualEnd` | DateTime | observed range end |
| `status` | enum `HolidayStatus` | `TENTATIVE` \| `VERIFIED` \| `MOVED` |
| `source` | enum `HolidaySource` | `FETCHED` \| `MANUAL` |
| `verifiedAt` | DateTime? | set when HR verifies or moves (date-confirmed) |
| `reminderSentAt` | DateTime? | one verification reminder per occurrence (FR-006/SC-003) |
| `createdAt` | DateTime | unchanged |
| `updatedAt` | DateTime @updatedAt | new |

- **Dropped**: `date DateTime @unique`. Migration 057 backfills `originalStart = originalEnd = actualStart = actualEnd = date`, `status = VERIFIED`, `source = MANUAL` for existing rows (spec FR-004/FR-005), then drops the column.
- **Invariants (server-action enforced)**: `start <= end` on both ranges; ranges contiguous by definition (start/end pair); **no two holidays' actual ranges overlap** (FR-003) — checked inside every create/move action; a colliding write is refused naming the blocking holiday.
- **State transitions**: `TENTATIVE → VERIFIED` (HR confirms, sets `verifiedAt`); `TENTATIVE|VERIFIED|MOVED → MOVED` (HR changes actual range, sets `verifiedAt`; original range never changes after creation). Fetched entries are born `TENTATIVE`; manual entries born `VERIFIED` (FR-005). Deletion allowed with a past-date warning (FR-002).

## HolidayAnnouncement (new)

| Field | Type | Notes |
|---|---|---|
| `id` | String cuid PK | |
| `holidayId` | String FK → PublicHoliday (Cascade) | one holiday can have several sends (original + corrections) |
| `kind` | enum `AnnouncementKind` | `ORIGINAL` \| `CORRECTION` |
| `subject` | String | as sent (post-HR-edit) |
| `bodyEn` | String | English body as sent |
| `bodyAr` | String | Arabic body as sent |
| `announcedStart` | DateTime | snapshot of the actual range at send time — |
| `announcedEnd` | DateTime | …a later range change vs. this snapshot ⇒ "announced with an outdated date" flag (FR-018) |
| `bridgeDates` | String? | comma-joined yyyy-mm-dd of called-out bridge day(s); powers the CTA link and the banner callout |
| `sentById` | String FK → User (SetNull, nullable) | who clicked Send |
| `sentAt` | DateTime | |
| `recipientCount` | Int | attempted audience size |

- Index on `holidayId`. "Already announced" (FR-010 re-send confirm) = holiday has ≥1 announcement whose `announced*` equals the current actual range; outdated = latest announcement's snapshot differs.

## NotificationSettings (extended singleton)

- New: `verificationLeadDays Int @default(14)` (FR-015). Existing `emailEnabled` master toggle + `hrInbox` are reused: the toggle gates all holiday emails; `hrInbox` receives verification reminders.

## Existing models — read-only touchpoints (no changes)

- **LeaveRequest**: untouched. Prefill arrives via URL params into the existing form; FR-017's "day returned" email queries PENDING/APPROVED rows overlapping newly-holiday days — no new columns (counts are derived live, spec FR-004).
- **User**: recipients = `status: ACTIVE`, non-empty email.

## Derived (pure, no storage)

- **Break shape** (`src/lib/timeoff/breaks.ts`): for a holiday's actual range → contiguous off-run (weekend + holiday set), `bridges` (exactly one working day between off-days, before/after the run), `longWeekend` (run ≥3 days touching Fri/Sat), suggested CTA range.
- **Holiday day-set** (`getHolidaySet`): every day of every actual range as yyyy-mm-dd keys — the unchanged input shape of `countWorkingDays` (spec 035 engine untouched).
- **Needs-verification queue**: `status = TENTATIVE AND actualStart <= today + verificationLeadDays` — computed live on the admin page; the cron uses the same predicate plus `reminderSentAt == null`.
- **Needs-announcement queue**: date-confirmed upcoming holidays with no current-range announcement — computed live, never stored.
