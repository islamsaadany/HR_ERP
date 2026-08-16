# Tasks: Profile Change Requests

**Gate open**: mockup approval before any component work (T007+).

## Phase 1: Foundational

- [ ] T001 `ProfileChangeRequest` + `ProfileChangeField` + `ProfileFieldStatus` in `prisma/schema.prisma`
- [ ] T002 `prisma/sql/049_profile_change_requests.sql` — additive, idempotent
- [ ] T003 Field registry in `src/lib/profile/requestable.ts` — key, label, type, parser, and the `User` column each writes to. One place, so a new field is data not code

## Phase 2: US1 — An employee proposes a correction (P1)

- [ ] T004 [US1] `submitProfileChangeRequest` in `src/app/(app)/profile/request-actions.ts` — records only changed fields, rejects an empty submission, one open request per employee
- [ ] T005 [US1] `updateOwnPhone` — direct self-edit, no request, no review (FR-002a/FR-019)
- [ ] T006 [US1] Mockup for the employee form + status, and the HR queue → **approval gate**
- [ ] T007 [US1] Request form + pending/declined status on `src/app/(app)/profile/page.tsx`
- [ ] T008 [US1] `ui-versions/profile-page/` snapshot before T007

## Phase 3: US2 — HR decides field by field (P1)

- [ ] T009 [US2] `approveProfileField` / `declineProfileField` in `src/app/(app)/admin/employees/change-request-actions.ts` — `requireAdmin`, refuse a re-decision, approve writes only that field
- [ ] T010 [US2] Review queue at `src/app/(app)/admin/change-requests/page.tsx`, current value read at review time (FR-010)
- [ ] T011 [US2] Pending count on the admin home
- [ ] T012 [US2] `ui-versions/` snapshot before T010/T011

## Phase 4: Verify & polish

- [ ] T013 Pure/DB checks: only-changed-fields, empty submission refused, one open request, per-field approval writes one column, no re-decision, request closes when all fields decided
- [ ] T014 Chromium pass: employee submits, HR approves one field and declines another, employee sees both outcomes
- [ ] T015 `tsc` + `build`; docs; tell the user to paste `049` (guard query first)

## Deferred

- **Dependants** (research R3) — an add/remove/edit set rather than a value, and the carrier of the
  medical-commitment warning. The contact and personal fields deliver the feature; dependants are a
  follow-up slice rather than a reason to delay it.
