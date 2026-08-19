# Interface Contracts: spec 037

App-internal contracts (server actions + route handlers). All admin actions call `requireAdmin()` first; every rule is validated server-side; UI mirrors are UX only.

## Server actions — `src/app/(app)/admin/time-off/holidays/actions.ts` (extended)

| Action | Input (FormData) | Behavior / guarantees |
|---|---|---|
| `fetchHolidaySuggestions` | `year` | Calls Nager.Date `PublicHolidays/{year}/EG` server-side (timeout-guarded). Groups consecutive same-name days. Returns via redirect/searchParams-encoded payload or renders a suggestions panel (implementation's choice at mockup stage). Marks each suggestion: `new` / `recorded` / `recorded-different-date` (with both dates + apply-as-move affordance, FR-016). Stores **nothing**. Failure → friendly error; manual entry unaffected. |
| `confirmSuggestions` | selected suggestion payload(s): name, localName, start, end | Creates holidays: `source=FETCHED`, `status=TENTATIVE`, original=actual=suggested range. Refuses (per entry) any overlap with an existing actual range, naming the blocker. |
| `addHoliday` (evolved) | `name`, `start`, `end?` (end defaults to start) | Manual create: `source=MANUAL`, `status=VERIFIED`, original=actual. Overlap check as above. Weekend-dated allowed with an informational note (edge case). |
| `moveHoliday` | `id`, `newStart`, `newEnd` | Sets actual range, `status=MOVED`, `verifiedAt=now`. Original range untouched. Overlap check (refuse naming blocker). Past-date change requires the warning-confirmed flag (`confirmPast=1`). **Post-write, fire-and-forget**: FR-017 day-returned emails to requesters whose PENDING/APPROVED ranges contain newly-holiday working days. |
| `verifyHoliday` | `id` | `status=VERIFIED`, `verifiedAt=now`. No date change. |
| `removeHoliday` (evolved) | `id`, `confirmPast?` | Delete; past-dated requires warning-confirmed flag (FR-002). |
| `uploadHolidays` (evolved) | Excel file | Bulk import against the new columns (Date → single-day range, existing behavior otherwise preserved). |
| `sendAnnouncement` | `holidayId`, `subject`, `bodyEn`, `bodyAr`, `kind`, `resendConfirmed?` | Only for date-confirmed holidays (FR-008/gate in FR of story 3). If a current-range announcement exists and `resendConfirmed` absent → refuse with confirm prompt (FR-010). Writes `HolidayAnnouncement` (snapshot of actual range + bridge dates), then fire-and-forget chunked batch email to all active employees (FR-011). Never blocks on send failure. |
| `updateLeadDays` (on Admin → Notifications actions) | `verificationLeadDays` | 1–60 integer, singleton update (FR-015). |

## Route handlers

| Route | Method | Auth | Contract |
|---|---|---|---|
| `/api/cron/holidays` | GET | `Authorization: Bearer ${CRON_SECRET}` (401 otherwise) | Idempotent daily job: for each `TENTATIVE` holiday with `actualStart <= today+lead` and `reminderSentAt == null` → one email to `hrInbox` (respecting `emailEnabled`), stamp `reminderSentAt` **regardless of email config** (the in-app flag is the guaranteed channel; SC-003's email depends on email being configured). Response: `{ reminded: number }`. Never sends employee-facing email. |
| `/api/admin/time-off/holidays/template` | GET | admin | Evolved: template columns become Start date \| End date \| Name (pre-filled from current list). |

## Deployment config

- `vercel.json` (new): `{ "crons": [{ "path": "/api/cron/holidays", "schedule": "0 6 * * *" }] }`.
- New env var: `CRON_SECRET` (documented in CLAUDE.md env table).

## External dependency

- **Nager.Date**: `GET https://date.nager.at/api/v3/PublicHolidays/{year}/EG` → `[{ date: "yyyy-mm-dd", localName, name, fixed, global, counties, types }]`. Read-only, keyless, suggestion-only. Response is untrusted input: dates validated/normalized to UTC midnight, names length-capped, before display or storage.

## Employee-facing links (stable URL contract)

- Prefill CTA: `/time-off?start=yyyy-mm-dd&end=yyyy-mm-dd` — invalid/past params degrade to the plain form; an open request covering the range renders its status instead (FR-013).
