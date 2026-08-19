---
description: "Task list for spec 037 — Official Holidays: verification, bridges & team vacation notifications"
---

# Tasks: Official Holidays — Verification, Bridges & Team Vacation Notifications

**Input**: Design documents from `/specs/037-official-holiday-notifications/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/actions-and-routes.md](./contracts/actions-and-routes.md), [quickstart.md](./quickstart.md)

**Tests**: No automated test tasks — this project's house gates are `npx tsc --noEmit` + `npm run build` plus the throwaway-Postgres migration proof and the [quickstart.md](./quickstart.md) scenario walkthrough (CLAUDE.md §3, §3a). Those appear as explicit tasks in Phase 7.

**Organization**: Tasks are grouped by user story so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1–US4)
- Every task names its exact file path

## Path Conventions

Existing Next.js app: `src/app/(app)/…` (pages + server actions), `src/app/api/…` (route handlers), `src/lib/…`, `src/components/…`, `prisma/`. Paths below are repository-relative, per [plan.md](./plan.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Constitution gates and deployment config that must exist before feature work.

- [ ] T001 Build the mockup-first UI gate: `design-mockups/037-official-holidays/2026-08-19_holidays-admin-and-banner.html` — self-contained navy/gold static HTML covering (a) the reworked admin holidays screen (fetch-suggestions panel, status chips tentative/verified/moved, original-vs-actual ranges, needs-verification flag, announced/outdated flag), (b) the announcement composer (EN + AR editable draft, bridge callout, Send), (c) the employee dashboard upcoming-holiday banner, (d) the prefilled request state and the "you already have a request covering these days" card. Publish as an Artifact and obtain explicit user sign-off. **BLOCKS every UI task (T019, T022, T023, T025, T027, T028, T030).**
- [ ] T002 [P] Create `vercel.json` at repo root with the first cron entry: `{ "crons": [{ "path": "/api/cron/holidays", "schedule": "0 6 * * *" }] }`
- [ ] T003 [P] Document the new `CRON_SECRET` env var in the `CLAUDE.md` "Required env vars" table (purpose: authenticates the daily holidays cron route)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, and pure/shared libraries every user story builds on. **No user story can start before this phase completes.**

- [ ] T004 Evolve `prisma/schema.prisma`: add enums `HolidayStatus` (TENTATIVE/VERIFIED/MOVED), `HolidaySource` (FETCHED/MANUAL), `AnnouncementKind` (ORIGINAL/CORRECTION); replace `PublicHoliday.date @unique` with `originalStart`/`originalEnd`/`actualStart`/`actualEnd` plus `localName?`, `status`, `source`, `verifiedAt?`, `reminderSentAt?`, `updatedAt`; add model `HolidayAnnouncement` (per [data-model.md](./data-model.md)) with `@@index([holidayId])`; add `verificationLeadDays Int @default(14)` to `NotificationSettings`
- [ ] T005 Write `prisma/sql/057_official_holidays.sql` (same commit as T004, per CLAUDE.md): create the three enums, add the new `PublicHoliday` columns, backfill `originalStart = originalEnd = actualStart = actualEnd = date` with `status='VERIFIED'`, `source='MANUAL'` for existing rows, drop the `date` column and its unique index, create `HolidayAnnouncement` + index, add `NotificationSettings.verificationLeadDays`
- [ ] T006 Prove T005 against a throwaway local Postgres 16 (CLAUDE.md §3a): seed a legacy single-date holiday, apply `057`, then query `actualStart`, `actualEnd`, `status`, `source` to confirm the backfill — do not assume the SQL applied cleanly
- [ ] T007 [P] Create the pure module `src/lib/timeoff/breaks.ts` (no I/O, mirroring `src/lib/workdays.ts`): given a holiday's actual range + the holiday day-set, compute the contiguous off-run (Fri/Sat + holidays), `bridges` (exactly ONE working day between off-days, before and/or after the run), `longWeekend` (run ≥3 days touching the weekend), `totalDaysOff`, and the suggested CTA range
- [ ] T008 Rework `src/lib/holidays.ts`: `getHolidaySet()` expands every actual range into per-day `yyyy-mm-dd` keys (unchanged output shape — `src/lib/workdays.ts` itself is NOT modified); `listHolidays()` orders by `actualStart`; add queue predicates `needsVerification` (TENTATIVE and `actualStart <= today + leadDays`), `needsAnnouncement`, and `upcomingAnnounced`; keep the existing pre-migration try/catch degradation
- [ ] T009 [P] Extend `src/lib/notifications/settings.ts`: add `verificationLeadDays` to `NotificationSettingsData` + `NOTIFICATION_DEFAULTS` (14) and to the read mapping
- [ ] T010 [P] Add a chunked batch-send helper to `src/lib/email/client.ts` (Resend `batch.send`, ≤100 recipients per call), keeping the existing fire-and-forget + master-toggle + env-gate posture — a send failure must never throw into the caller
- [ ] T011 Fix every remaining `PublicHoliday.date` reader so `npx tsc --noEmit` passes: `src/app/(app)/time-off/page.tsx` (holidayRows → range-expanded `formHolidays`), `src/app/api/admin/time-off/holidays/template/route.ts`, and `src/app/(app)/admin/time-off/holidays/actions.ts` (temporary compile-level fix; full rework lands in Phase 3)

**Checkpoint**: schema migrated and proven, counting engine still green, shared libs available.

---

## Phase 3: User Story 1 — HR builds and maintains the official holidays log (Priority: P1) 🎯 MVP

**Goal**: HR can fetch a year's holidays as suggestions, confirm them into the log, add/rename/remove manually, and move a holiday's actual dates — with counting following the actual dates everywhere.

**Independent test**: Fetch a year, confirm a subset, add one manually, move one to a different actual date, then create a time-off request spanning the moved holiday and confirm the working-day count excludes the actual (not the original) date.

- [ ] T012 [US1] Create `src/lib/timeoff/holiday-source.ts`: server-side Nager.Date client (`GET https://date.nager.at/api/v3/PublicHolidays/{year}/EG`), timeout-guarded, response treated as untrusted (dates normalized to UTC midnight, names length-capped), grouping consecutive same-name days into one multi-day suggestion
- [ ] T013 [US1] Add an overlap guard helper + `fetchHolidaySuggestions` and `confirmSuggestions` server actions in `src/app/(app)/admin/time-off/holidays/actions.ts`: suggestions store nothing and are tagged `new` / `recorded` / `recorded-different-date` (both dates + apply-as-move, FR-016); confirming creates rows `source=FETCHED`, `status=TENTATIVE`, original = actual, refusing any actual-range overlap by naming the blocking holiday
- [ ] T014 [US1] Evolve `addHoliday` in `src/app/(app)/admin/time-off/holidays/actions.ts` to accept a range (`start`, optional `end` defaulting to `start`), create with `source=MANUAL`, `status=VERIFIED`, original = actual, run the overlap guard, and surface an informational note when the date falls on Fri/Sat (allowed — spec edge case)
- [ ] T015 [US1] Add the `moveHoliday` server action in `src/app/(app)/admin/time-off/holidays/actions.ts`: sets the actual range, `status=MOVED`, `verifiedAt=now`, leaves the original range untouched, runs the overlap guard, and requires a `confirmPast` flag when the holiday is past-dated (FR-002 warning)
- [ ] T016 [US1] Add `verifyHoliday` and evolve `removeHoliday` in `src/app/(app)/admin/time-off/holidays/actions.ts` (`verifyHoliday` → `status=VERIFIED`, `verifiedAt=now`, no date change; `removeHoliday` → past-dated deletion requires the `confirmPast` flag)
- [ ] T017 [US1] Make bulk import range-aware: `uploadHolidays` in `src/app/(app)/admin/time-off/holidays/actions.ts` and the template columns (Start date | End date | Holiday name, pre-filled from the current list) in `src/app/api/admin/time-off/holidays/template/route.ts`
- [ ] T018 [US1] Add the `dayReturned` template to `src/lib/email/templates.ts` and wire it fire-and-forget into `moveHoliday` (FR-017): after the write, find PENDING/APPROVED `LeaveRequest` rows whose range contains a newly-holiday working day and email each requester once that the day became an official holiday and their vacation day was returned — the request is never auto-cancelled
- [ ] T019 [US1] Rework `src/app/(app)/admin/time-off/holidays/page.tsx` to the approved T001 mockup (fetch panel, suggestion list with the three tags, holiday list showing original vs actual + status chips, move/verify/remove controls with the past-date warning), snapshotting the file to `ui-versions/holidays-page/2026-08-19_pre-spec-037.tsx` first

**Checkpoint**: the log is fully manageable and drives all counting — US1 is independently shippable.

---

## Phase 4: User Story 2 — HR is reminded to verify each holiday before it arrives (Priority: P2)

**Goal**: Tentative holidays entering their lead window flag in-app and produce exactly one HR reminder email per occurrence.

**Independent test**: Put a tentative holiday inside the lead window, run the cron route, confirm one reminder and the in-app flag; verify the holiday and confirm no further reminders.

- [ ] T020 [P] [US2] Add the `verificationReminder` template to `src/lib/email/templates.ts` (holiday name, original vs actual dates, days remaining, deep link to the admin holidays screen)
- [ ] T021 [US2] Create `src/app/api/cron/holidays/route.ts`: `Authorization: Bearer ${CRON_SECRET}` or 401; idempotent date-driven predicate (TENTATIVE, `actualStart <= today + verificationLeadDays`, `reminderSentAt == null`) → one email to `hrInbox`, stamp `reminderSentAt` regardless of email configuration; returns `{ reminded: number }`; never sends employee-facing email
- [ ] T022 [US2] Add the verification lead-time field (1–60, default 14) to `src/app/(app)/admin/notifications/page.tsx` + its `actions.ts`, snapshotting the page to `ui-versions/` first
- [ ] T023 [US2] Surface the needs-verification state on `src/app/(app)/admin/time-off/holidays/page.tsx` per the approved mockup (flag + verify/move affordances on holidays inside their window)

**Checkpoint**: HR is reliably nudged before every uncertain holiday.

---

## Phase 5: User Story 3 — HR reviews and sends a warm bilingual team announcement (Priority: P2)

**Goal**: Date-confirmed holidays get an editable EN→AR draft with bridge/long-weekend callouts that HR explicitly sends, plus a live dashboard banner.

**Independent test**: Verify a holiday that creates a bridge, open its draft (bilingual, warm, names the bridge), edit and send, confirm all active employees are addressed and the banner appears; a second send requires confirmation.

- [ ] T024 [US3] Add the `holidayAnnouncement` draft builder to `src/lib/email/templates.ts`: deterministic English-then-Arabic (`dir="rtl"`) composition from the holiday name(s), dd/mm/yyyy dates and the `breaks.ts` result — warm invitation to rest/travel/family time plus the "assuming you have capacity and nothing critical or urgent" responsibility framing, honest text when the holiday falls on a weekend, multi-day holidays described as one break, and the prefill CTA link
- [ ] T025 [US3] Create the composer page `src/app/(app)/admin/time-off/holidays/announce/[id]/page.tsx` per the approved mockup: renders the draft into editable subject / EN body / AR body fields with the detected bridge/long-weekend summary and the send control (blocked for TENTATIVE holidays with a "verify first" message)
- [ ] T026 [US3] Add the `sendAnnouncement` server action in `src/app/(app)/admin/time-off/holidays/actions.ts`: gate on date-confirmed status, require `resendConfirmed` when a current-range announcement already exists (FR-010), write the `HolidayAnnouncement` row (kind, as-sent text, `announcedStart`/`announcedEnd` snapshot, `bridgeDates`, `sentById`, `recipientCount`), then fire-and-forget the chunked batch send to all active employees with a non-empty email
- [ ] T027 [US3] Implement correction handling (FR-018): detect "announced with an outdated date" by comparing the latest announcement's snapshot to the current actual range, flag it on the admin holidays page, and regenerate the draft as `kind=CORRECTION` with a correction preamble — nothing is emailed automatically
- [ ] T028 [US3] Add the upcoming-holiday banner to `src/app/(app)/dashboard/page.tsx` per the approved mockup (next announced holiday with `actualEnd >= today`: name, dd/mm/yyyy date(s), bridge/long-weekend callout, CTA), snapshotting the page to `ui-versions/` first

**Checkpoint**: the team hears about every confirmed break, in HR's own reviewed words.

---

## Phase 6: User Story 4 — Employee starts a pre-filled bridge request in one click (Priority: P3)

**Goal**: The announcement CTA opens the normal request form pre-filled with the bridge day(s), flowing through the untouched approval path.

**Independent test**: Follow a sent announcement's CTA, confirm the form is pre-filled with the bridge date, submit, approve as manager, and see the day in the taken count.

- [ ] T029 [P] [US4] Add optional `initialStart` / `initialEnd` props to `src/components/TimeOffRequestForm.tsx` (defaulting the date inputs while leaving the live working-day preview and self-overlap warning untouched), snapshotting the file to `ui-versions/` first
- [ ] T030 [US4] Accept `?start=&end=` in `src/app/(app)/time-off/page.tsx`: validate/normalize the params (invalid or past → plain form), pass them to the form, and render the existing request's status card instead of a prefilled form when a PENDING/APPROVED request already covers the range (FR-013)
- [ ] T031 [US4] Point the CTA links at `/time-off?start=yyyy-mm-dd&end=yyyy-mm-dd` from both channels — the announcement template in `src/lib/email/templates.ts` (absolute URL via `appBaseUrl`) and the dashboard banner in `src/app/(app)/dashboard/page.tsx`

**Checkpoint**: reading about a bridge and booking it are one click apart.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T032 Run the house gates: `npx tsc --noEmit` and `npm run build` — zero TypeScript errors before handover (CLAUDE.md §3)
- [ ] T033 Walk every scenario in [quickstart.md](./quickstart.md) against the local throwaway Postgres, including the email-off path (state changes must still complete) and the cron 401 path; record what was verified and how
- [ ] T034 Amend the email-scope rule in `.specify/memory/constitution.md` (Technology & Data Constraints, version bump) and `CLAUDE.md` (spec 020 pattern note) to cover this holiday/vacation workflow — user approval recorded 2026-08-19 in [spec.md](./spec.md) Assumptions
- [ ] T035 Update the steering docs in the implementation commit: `PROJECT_DETAILS.md` (evolved holiday model, cron route, announcement entity, new env var), `IMPLEMENTATION_PROGRESS.md` (spec 037 status), `IMPLEMENTATION_PLAN.md` decisions log (the eight verified edge-case decisions + email widening + first scheduled job)
- [ ] T036 Tell the user exactly which `prisma/sql/` file to paste into Neon and in what order (`057_official_holidays.sql`), and that `CRON_SECRET` must be set in Vercel for the daily job to run

---

## Dependencies & Execution Order

**Phase order**: Setup (T001–T003) → Foundational (T004–T011) → US1 (T012–T019) → US2 (T020–T023) → US3 (T024–T028) → US4 (T029–T031) → Polish (T032–T036).

**Hard blockers**:

- **T001 (mockup sign-off) blocks all UI tasks**: T019, T022, T023, T025, T027, T028, T030 — constitution Principle II, non-negotiable.
- **T004 → T005 → T006**: schema, its SQL file, then the proof (T004 and T005 land in the same commit).
- **T008 (range-aware holiday set) blocks** every counting-dependent surface and T007's consumers.
- **T010 (batch send) blocks** T018, T021, T026.
- **T007 (breaks.ts) blocks** T024, T028, T031.
- **T024 (draft builder) blocks** T025, T026, T027.
- **T026 (send + snapshot) blocks** T027 (correction detection) and T028 (banner reads announced state).

**Story independence**: US1 stands alone (the log + counting). US2 needs only US1's data. US3 needs US1 (date-confirmed holidays) and the foundational `breaks.ts`. US4 needs US3's CTA to be reachable, though T029/T030 are testable on their own with a hand-written URL.

## Parallel Opportunities

- **Setup**: T002 and T003 run together (both independent of T001).
- **Foundational**: T007, T009, T010 are three separate files with no interdependency — run in parallel after T004/T005 land; T008 and T011 follow.
- **US1**: T012 is independent of the actions file and can run alongside T013–T017 authoring only if the source client lands first; T013–T017 all edit `actions.ts` and must be sequential.
- **US2**: T020 (templates.ts) runs parallel to T021 (route) once T010 exists.
- **US4**: T029 (component) runs parallel to T031's template edit; T030 depends on T029.

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)** — the official holidays log with fetch-and-confirm, original vs. actual dates, and live counting. That alone replaces today's flat date list and is independently valuable.

**Increment 2**: US2 (verification reminders) — turns the log trustworthy.
**Increment 3**: US3 (announcements + banner) — the feature's heart; delivers the care message.
**Increment 4**: US4 (one-click bridge request) — convenience on top.

Each increment ends at a checkpoint that can be demonstrated and, if needed, shipped before the next begins.
