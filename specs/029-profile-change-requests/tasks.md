# Tasks: Profile Change Requests

**Gate closed** — mockup approved 2026-08-16.

## Phase 1: Foundational

- [x] T001 `ProfileChangeRequest` + `ProfileChangeField` + `ProfileFieldStatus` in `prisma/schema.prisma`
- [x] T002 `prisma/sql/049_profile_change_requests.sql` — additive, idempotent
- [x] T003 Field registry in `src/lib/profile/requestable.ts` — key, label, type, parser, and the `User` column each writes to. One place, so a new field is data not code

## Phase 2: US1 — An employee proposes a correction (P1)

- [x] T004 [US1] `submitProfileChangeRequest` in `src/app/(app)/profile/request-actions.ts` — records only changed fields, rejects an empty submission, one open request per employee
- [x] T005 [US1] `updateOwnPhone` — direct self-edit, no request, no review (FR-002a/FR-019)
- [x] T006 [US1] Mockup for the employee form + status, and the HR queue → **approval gate**
- [x] T007 [US1] Request form + pending/declined status on `src/app/(app)/profile/page.tsx`
- [x] T008 [US1] `ui-versions/profile-page/` snapshot before T007

## Phase 3: US2 — HR decides field by field (P1)

- [x] T009 [US2] `approveProfileField` / `declineProfileField` in `src/app/(app)/admin/employees/change-request-actions.ts` — `requireAdmin`, refuse a re-decision, approve writes only that field
- [x] T010 [US2] Review queue at `src/app/(app)/admin/change-requests/page.tsx`, current value read at review time (FR-010)
- [x] T011 [US2] Pending count on the admin home
- [x] T012 [US2] `ui-versions/` snapshot before T010/T011

## Phase 4: Verify & polish

- [x] T013 Pure/DB checks: only-changed-fields, empty submission refused, one open request, per-field approval writes one column, no re-decision, request closes when all fields decided
- [x] T014 Chromium pass: employee submits, HR approves one field and declines another, employee sees both outcomes
- [x] T015 `tsc` + `build`; docs; tell the user to paste `049` (guard query first)

## Verified

- `npx tsc --noEmit` and `npm run build` clean.
- `049` applied to a **fresh** throwaway Postgres through `scripts/apply-sql.mjs`, then
  `prisma migrate diff` against the schema reported **no** ProfileChange* drift — the SQL builds
  exactly what Prisma expects.
- `scripts/verify-profile-requests.mts` — 40/40 on a real DB.
- Chromium pass through the real (auth-guarded) actions: employee edits phone directly, sends a
  3-field request, HR approves one, declines one with a reason, employee sees both, last approval
  empties the queue and clears the admin pill. 0 console errors.

## Deferred

- **Dependants** (research R3) — an add/remove/edit set rather than a value, and the carrier of the
  medical-commitment warning. The contact and personal fields deliver the feature; dependants are a
  follow-up slice rather than a reason to delay it.
