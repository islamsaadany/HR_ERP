# Implementation Plan: Official Holidays — Verification, Bridges & Team Vacation Notifications

**Branch**: `claude/official-holidays-vacation-notifications-x3zpbl` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-official-holiday-notifications/spec.md`

## Summary

Extend the Time-Off module (spec 035) with a managed official-holidays lifecycle: HR fetches Egypt's holidays from Nager.Date as suggestions and confirms them into an evolved `PublicHoliday` model (date **ranges**, original vs. actual dates, tentative/verified/moved status); a daily Vercel Cron job — the app's first scheduled job — reminds HR to verify each tentative holiday inside a configurable lead window; for date-confirmed holidays the platform drafts a warm bilingual (EN→AR) team announcement with bridge/long-weekend callouts that HR reviews, edits, and explicitly sends (Resend batch, fire-and-forget) alongside a live dashboard banner; and a one-click CTA opens the existing time-off request form prefilled with the bridge days, flowing through the untouched approval path. The spec 035 counting engine (`workdays.ts`) is not modified — only its holiday-set input learns to expand ranges.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js 16 App Router, React 19

**Primary Dependencies**: Prisma + Neon Postgres; NextAuth v5; Resend (spec 020 email infra, extended); ExcelJS (existing bulk upload); Tailwind (navy/gold)

**Storage**: PostgreSQL — `PublicHoliday` evolved in place, new `HolidayAnnouncement`, `NotificationSettings` + `verificationLeadDays`; migration `prisma/sql/057_official_holidays.sql`

**Testing**: `npx tsc --noEmit` + `npm run build` (house gates); throwaway local Postgres 16 for migration verification; manual scenario walkthrough per [quickstart.md](./quickstart.md)

**Target Platform**: Vercel (adds `vercel.json` with the first cron entry + `CRON_SECRET` env var)

**Project Type**: Existing Next.js web app — feature slots into `src/app/(app)/admin/time-off/holidays`, `src/app/(app)/time-off`, `src/app/(app)/dashboard`, `src/lib`

**Performance Goals**: N/A beyond house norms — company-scale data (dozens of holidays, ≤ a few hundred employees); batch email ≤100/call via Resend batch

**Constraints**: All rules server-side (`requireAdmin()`); email strictly fire-and-forget and master-toggle-gated; UTC-midnight day handling everywhere (`workdays.ts` convention); dd/mm/yyyy display via `formatDate`; no LLM in announcement drafting (deterministic templates)

**Scale/Scope**: ~2 evolved models + 1 new, 1 cron route, ~8 server actions, 1 pure lib module, 3 UI surfaces (admin holidays rework, dashboard banner, prefilled form), 2 email templates + batch helper

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-Phase 1 — PASS (with two tracked obligations).*

- **I. Align Before Building** — PASS. Spec 037 was aligned twice (scope 2026-08-19; eight edge cases individually decided by the user). This plan is itself presented for approval before `/speckit-tasks`/implement.
- **II. UI Changes Require Explicit Approval / MOCKUP-FIRST** — **OBLIGATION**. The admin holidays screen rework (fetch panel, status chips, ranges, announcement composer), the dashboard banner, and the prefilled-form state are visual changes → a static HTML mockup (`design-mockups/037-official-holidays/2026-08-19_holidays-admin-and-banner.html`, navy/gold, published as an Artifact) MUST be signed off before component work; `ui-versions/` snapshots for every touched UI file. Encoded as the first UI task in tasks.md.
- **III. Server-Authoritative Rules** — PASS by design: overlap checks, lifecycle transitions, past-edit warnings, send gating all in server actions; client mirrors are UX only.
- **IV. Spec-Driven & Docs Move With Code** — PASS with obligation: migration 057 SQL in the same commit as schema; steering docs + **constitution amendment (email scope widening, user-approved 2026-08-19)** + CLAUDE.md env table (`CRON_SECRET`) in the implementation commits.
- **V. Engineered Enough** — PASS: one pure `breaks.ts` module instead of scattered date math; cron idempotent by date predicate, not state flags; no new abstractions beyond what three consumers (draft, banner, CTA) share.
- **Technology & Data Constraints** — the "No other emails" clause is knowingly amended by this feature (recorded decision reversal, spec Assumptions); flagged in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/037-official-holiday-notifications/
├── plan.md              # This file
├── research.md          # Phase 0 — all unknowns resolved
├── data-model.md        # Phase 1 — schema evolution + new entities
├── quickstart.md        # Phase 1 — validation walkthrough
├── contracts/
│   └── actions-and-routes.md  # Phase 1 — server actions, cron route, external API
└── tasks.md             # Phase 2 (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
vercel.json                                      # NEW — first cron entry
prisma/
├── schema.prisma                                # PublicHoliday evolved; HolidayAnnouncement; NotificationSettings.verificationLeadDays
└── sql/057_official_holidays.sql                # NEW — hand-runnable Neon migration (backfill + drop date)
src/
├── lib/
│   ├── holidays.ts                              # getHolidaySet expands ranges; listHolidays; queue predicates
│   ├── timeoff/breaks.ts                        # NEW — pure bridge/long-weekend/off-run math
│   ├── email/templates.ts                       # + holidayAnnouncement (EN→AR), verificationReminder, dayReturned
│   ├── email/client.ts                          # + chunked batch send helper (Resend batch, fire-and-forget)
│   └── notifications/settings.ts                # + verificationLeadDays
├── app/
│   ├── (app)/admin/time-off/holidays/
│   │   ├── page.tsx                             # reworked admin screen (mockup-first)
│   │   ├── actions.ts                           # fetch/confirm/add/move/verify/remove/upload/sendAnnouncement
│   │   └── announce/[id]/page.tsx               # announcement composer (draft → edit → send)
│   ├── (app)/admin/notifications/               # + verificationLeadDays field
│   ├── (app)/time-off/page.tsx                  # prefill via ?start&end; covered-range state card
│   ├── (app)/dashboard/page.tsx                 # + upcoming-holiday banner
│   └── api/
│       ├── cron/holidays/route.ts               # NEW — daily job (CRON_SECRET bearer)
│       └── admin/time-off/holidays/template/route.ts  # range-aware Excel template
├── components/
│   ├── TimeOffRequestForm.tsx                   # + optional initialStart/initialEnd props
│   └── (banner + admin-screen client pieces per approved mockup)
design-mockups/037-official-holidays/            # NEW — pre-approval HTML mockup(s)
ui-versions/                                     # snapshots of every touched UI file
```

**Structure Decision**: no new top-level areas — the feature lives entirely inside the existing Time-Off surfaces plus one cron route; the only new lib module is the pure `breaks.ts`, mirroring how `workdays.ts` was introduced by spec 035.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Amends "email limited to benefit-claim workflow" (constitution Tech Constraints) | Verification reminders, team announcements, and day-returned notices are the feature's core value | In-app-only signals reach nobody who isn't already looking; the user explicitly approved the widening (2026-08-19) with the same guardrails (env-gated, fire-and-forget, master toggle) |
| First scheduled job (`vercel.json` cron + `CRON_SECRET`) | "Remind HR N days before" cannot fire from user actions | Client-side polling only runs while a page is open — wrong for a calendar reminder; external cron adds a second platform |
| App-level (not DB-level) non-overlap constraint on actual ranges | Prisma cannot express Postgres exclusion constraints | Raw-SQL constraint would drift from `schema.prisma` and break `prisma migrate diff`-generated SQL files; writes only flow through two admin actions, matching the house server-authoritative posture |
