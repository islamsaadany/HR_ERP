# Quickstart Validation: spec 037

How to prove the feature works end-to-end. Details live in [data-model.md](./data-model.md) and [contracts/actions-and-routes.md](./contracts/actions-and-routes.md).

## Prerequisites

- `npm install`; local throwaway Postgres (Postgres 16 via `initdb`/`pg_ctl`, per CLAUDE.md §3a) with migrations `001–056` + new `057` applied.
- Optional for email paths: `RESEND_API_KEY`, `EMAIL_FROM` (without them, sends log-and-skip — every state change must still succeed).
- `CRON_SECRET=test-secret` in `.env.local` for the cron route.

## Static gates (always)

```bash
npx tsc --noEmit && npm run build
```

## Scenario walkthroughs

1. **Migration carry-over (FR-004)**: seed a legacy single-date holiday before 057; after 057 confirm original=actual=date, status VERIFIED, and an overlapping request's working-day count is unchanged.
2. **Fetch & confirm (Story 1)**: as HR, fetch year → suggestions grouped (Eid days = one row), nothing stored; confirm two → rows exist TENTATIVE/FETCHED. Re-fetch → both marked recorded; shift one row's date in DB and re-fetch → "recorded on a different date" with apply-as-move (FR-016).
3. **Move & collide (FR-003)**: move holiday A onto holiday B's range → refused naming B. Move A to a free range → status MOVED, original intact; time-off form preview and counts use the new range immediately (SC-002).
4. **Past edit warning (FR-002)**: move/remove a past-dated holiday → blocked without the confirm flag, allowed with it.
5. **Cron reminder (FR-006/SC-003)**: holiday TENTATIVE, actualStart inside lead window → `curl -H "Authorization: Bearer test-secret" localhost:3000/api/cron/holidays` returns `{reminded:1}` and stamps `reminderSentAt`; second call returns `{reminded:0}`. Wrong bearer → 401.
6. **Announcement (Story 3)**: verify the holiday → composer shows bilingual draft with the bridge day named (single working day between holiday and weekend); edit text, Send → `HolidayAnnouncement` row (snapshot + recipientCount), send attempt logged. Send again → requires explicit re-send confirmation (FR-010).
7. **Correction (FR-018)**: move an announced holiday → admin screen flags "announced with an outdated date"; draft regenerates as correction; nothing auto-sent.
8. **Banner (FR-012)**: `/dashboard` as an employee (including one created after the send) shows the holiday banner with dates + callout; set actualEnd < today → banner gone.
9. **One-click request (Story 4 / FR-013)**: follow `/time-off?start=…&end=…` → form prefilled; count preview correct; submit → PENDING via the normal path; approve as manager → appears in taken count. With an open request covering the range → its status card shows instead of a prefilled form.
10. **Day returned (FR-017)**: employee has an APPROVED single-day request; move a holiday onto that day → count for that request becomes 0 (live), one notification email attempt logged to that employee, request still APPROVED.
11. **Email off (FR-011)**: master toggle off → steps 5/6/10 still complete their state changes; email skipped with a log line.

## DB verification pattern (CLAUDE.md §3a)

Apply `prisma/sql/057_official_holidays.sql` to the throwaway DB and query the exact columns the pages read (`actualStart`, `actualEnd`, `status`, `reminderSentAt`; `HolidayAnnouncement.announcedStart/End`) — never assume the SQL applied cleanly.
