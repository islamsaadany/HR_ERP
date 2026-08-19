# Research: Official Holidays — Verification, Bridges & Team Vacation Notifications

**Date**: 2026-08-19 · **Spec**: [spec.md](./spec.md)

All Technical Context unknowns resolved below. No open NEEDS CLARIFICATION.

## R1 — Online holidays source

- **Decision**: Nager.Date public API, endpoint `GET https://date.nager.at/api/v3/PublicHolidays/{year}/EG`. No auth, no key, JSON array of `{ date, localName, name, countryCode, fixed, global, types }`. Called **server-side** from an HR-only server action at fetch time (never from the browser, never on a schedule).
- **Rationale**: user-approved source (alignment 2026-08-19). Free, keyless, covers Egypt, and returns `localName` (Arabic) alongside the English `name` — useful for the bilingual announcement. Islamic entries are predictions, which maps exactly onto our `TENTATIVE` status.
- **Handling**: suggestion-only (spec FR-001). Consecutive same-name days are grouped into one multi-day suggestion before display. Fetch failure → friendly error, manual entry unaffected. A 5–10s timeout guards the action.
- **Alternatives considered**: Calendarific/Abstract API (keyed, quota'd — worse); shipping a hardcoded list (not "fetched", drifts).

## R2 — Scheduler (first scheduled job in the app)

- **Decision**: **Vercel Cron** — add `vercel.json` with one daily cron hitting `GET /api/cron/holidays` (e.g. `0 6 * * *` UTC). The route authenticates by comparing `Authorization: Bearer ${CRON_SECRET}` (new env var; Vercel injects the header automatically for cron invocations when `CRON_SECRET` is set). Unauthorized → 401.
- **Rationale**: house stack is Vercel; cron is the platform-native scheduler, free tier allows daily jobs. The job is **idempotent and date-driven** (spec edge case: a missed day self-heals) — it computes "which tentative holidays are inside their verification window and un-reminded" from dates, not from a processed-yesterday flag.
- **What the job does**: (a) for each TENTATIVE holiday inside its window with `reminderSentAt == null` → send ONE email to the HR inbox (`NotificationSettings.hrInbox`) and stamp `reminderSentAt`; (b) nothing else — announcements are never auto-sent (FR-006). The "needs announcement" queue is computed live on the admin page, so the cron doesn't need to maintain it.
- **Alternatives considered**: external cron (GitHub Actions hitting the API — extra moving part); Neon pg_cron (can't send email); polling client component (only runs when someone has the page open — wrong for a reminder).

## R3 — Schema evolution of `PublicHoliday`

- **Decision**: evolve the existing model in place (same table) to date **ranges** + lifecycle, per the user's grouped-entry choice:
  - `date DateTime @unique` → `actualStart` / `actualEnd` + `originalStart` / `originalEnd` (all UTC-midnight days; single-day holiday = start == end). Migration backfills all four from the old `date`.
  - New: `status` (`TENTATIVE | VERIFIED | MOVED`), `source` (`FETCHED | MANUAL`), `verifiedAt`, `reminderSentAt`, `localName` (Arabic name, nullable), `updatedAt`.
  - **Non-overlap of actual ranges is enforced in the server actions** (read-check inside the write path), not by a DB constraint — Prisma can't express Postgres exclusion constraints, and writes only flow through the HR actions. Same posture as every other server-authoritative rule in the app.
- **Rationale**: one table keeps `getHolidaySet()` a single query; existing rows migrate losslessly (original = actual = date, status VERIFIED, source MANUAL — HR typed them deliberately, matching FR-005's manual default).
- **Ripple**: `getHolidaySet()` expands each range into per-day keys (still the one counting input — `workdays.ts` itself is untouched); the admin holidays page, Excel template route, and bulk upload move to the new columns.

## R4 — Bridge / long-weekend detection

- **Decision**: new **pure** helper module `src/lib/timeoff/breaks.ts` (no I/O, mirroring `workdays.ts`): given the holiday set and one holiday's actual range, walk outward to build the contiguous off-run (weekend + holidays), and detect **bridges = exactly one working day** between the holiday run and the next off-day (before and after). Returns `{ breakStart, breakEnd, totalDaysOff, bridges: [{date}], longWeekend: boolean }`. Shared by the announcement drafter, the dashboard banner, and the prefill link builder.
- **Rationale**: deterministic and testable; the user fixed the bridge definition at exactly 1 working day. Two-day gaps are ignored by design.

## R5 — Announcement drafting (bilingual, warm)

- **Decision**: deterministic **string templates** in `src/lib/email/templates.ts` (house pattern) — `holidayAnnouncement()` composes English then Arabic sections from the holiday name(s), dates, and the `breaks.ts` result, with the responsibility framing ("assuming nothing critical on your plate…"). Arabic block rendered with `dir="rtl"`. HR edits the drafted subject/EN/AR bodies in textareas before sending; what's sent is what HR approved (FR-010). No LLM involvement — the draft must be identical every time and reviewable.
- **Correction drafts** (FR-018): same template with a correction preamble, triggered when the holiday's current actual range differs from the range snapshotted on its last sent announcement.

## R6 — Sending to all active employees

- **Decision**: recipients = active users with a non-empty email. Send via the existing fire-and-forget `sendEmail` posture, extended with a chunked **Resend batch** helper (`resend.batch.send`, ≤100 per call) so ~squad-size companies send in 1–2 calls. The send happens **after** the `HolidayAnnouncement` row is written; failures are logged, never thrown (spec FR-011). `recipientCount` records the attempted audience.
- **FR-017 (bridge-collision "day returned" email)**: computed inside the move action — after a date change, find PENDING/APPROVED requests whose range contains a newly-holiday working day and email each requester once. Fire-and-forget.

## R7 — One-click prefilled request

- **Decision**: plain link `/time-off?start=YYYY-MM-DD&end=YYYY-MM-DD` (email CTA + banner CTA). The page passes the params to `TimeOffRequestForm` as initial values (new optional props); the existing self-overlap warning already shows the employee's clashing open request — we strengthen it: when an open request fully covers the suggested range, the page shows that request's status card instead of prefilling (FR-013). Submission path is 100% the existing `createLeaveRequest` — zero special-casing.

## R8 — Dashboard banner

- **Decision**: a server-rendered banner on `/dashboard` (already `force-dynamic`) showing the **next upcoming announced holiday** (has ≥1 sent announcement, actualEnd ≥ today): name, dd/mm/yyyy date(s), bridge/long-weekend callout, CTA link. Reads live state — new joiners see it (spec edge case); it disappears after the holiday passes. No polling needed: the CLAUDE.md live-page rule targets data *other people change while the page sits open*; a date-driven banner refreshes on every visit, which the user accepted as the channel's semantics (banner + email, not banner-as-live-monitor).

## R9 — Settings home for the lead time & toggle

- **Decision**: `verificationLeadDays Int @default(14)` joins the `NotificationSettings` singleton (spec's "Notification settings (extended)"); edited on the existing **Admin → Notifications** screen alongside the master toggle, which continues to gate ALL holiday emails (reminders, announcements, day-returned). Constitution/CLAUDE.md email-scope text is amended in the implementation commit (user approval recorded 2026-08-19).

## R10 — Constitution gates flagged for implementation

- **UI approval (Principle II)**: the reworked admin holidays screen (fetch panel, statuses, ranges, announcement composer) and the dashboard banner are **new/changed UI** → static HTML mockup under `design-mockups/037-official-holidays/` + artifact sign-off BEFORE building components; `ui-versions/` snapshots for every touched UI file.
- **Docs move with code (Principle IV)**: `prisma/sql/057_official_holidays.sql` regenerated in the same commit as the schema change; steering docs + constitution amendment in the implementation commits.
- **Server-authoritative (Principle III analogue)**: all lifecycle transitions, overlap checks, and sends are server actions behind `requireAdmin()`.
