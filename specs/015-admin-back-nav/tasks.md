# Tasks: Consistent Admin Back Navigation

**Feature**: 015-admin-back-nav | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

No data/tests; validation is `tsc` + `build` + a visual walk of the parent map.

## Phase 1: Shared component

- [x] T001 Snapshot every admin `page.tsx` to `ui-versions/admin-back-nav/2026-08-07/` before editing.
- [x] T002 Create `src/components/admin/BackLink.tsx` — `{ href, label }` → a muted "←" link using the existing `text-sm text-muted hover:text-ink` style, with its own small bottom margin.

## Phase 2: US1/US2 — Apply to every admin page (parent map)

Section pages → `/admin` ("Admin"); nested pages → their section list (section name).

- [x] T003 [US1] Employees: `page.tsx` → Admin; `new` → Employees; `[id]` → Employees; `import` → Employees (replace the ad-hoc "← Back to employees").
- [x] T004 [US1] Onboarding: `page.tsx` → Admin; `new` → Onboarding; `[id]` → Onboarding.
- [x] T005 [US1] Handbook: `page.tsx` → Admin; `new` → Handbook; `[id]` → Handbook.
- [x] T006 [US1] Knowledge: `page.tsx` → Admin; replace ad-hoc links on `new` and `[id]` with BackLink → Knowledge Base.
- [x] T007 [US1] Benefits: `page.tsx` → Admin; replace ad-hoc link on `release` with BackLink → Benefits.
- [x] T008 [US1] Single-section pages → Admin: `time-off`, `announcements`, `brand`.
- [x] T009 [US2] Replace the ad-hoc links on `modules` and `departments` with BackLink → Admin (consolidation).
- [x] T010 [US2] Confirm `admin/page.tsx` (home) has NO back link.

## Phase 3: Verify & docs

- [x] T011 `npx tsc --noEmit` + `npm run build` green; grep confirms no stray ad-hoc back links remain.
- [x] T012 Docs (same commit): note the shared BackLink + parent map in `PROJECT_DETAILS.md`; build-log entry in `IMPLEMENTATION_PROGRESS.md`.

## Dependencies
- T002 blocks T003–T010. T001 before any page edit.
