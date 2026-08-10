---
description: "Task list for spec 020 — Claim Reimbursement Workflow & Email Notifications"
---

# Tasks: Claim Reimbursement Workflow & Email Notifications

**Input**: Design documents from `specs/020-claim-reimbursement-workflow/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No automated test harness exists in this repo. Verification is `npx tsc --noEmit` + `npm run build`, tracing the server rule path, applying the SQL to a throwaway local Postgres (CLAUDE.md §3a), and walking `quickstart.md`. No test tasks are generated.

**UI gate (constitution II)**: Every new/changed visual surface is **mockup-first** — build a navy/gold static HTML mockup under `design-mockups/`, get sign-off, snapshot the component to `ui-versions/`, then edit. Mockup tasks below are hard gates.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add the `resend` dependency to `package.json` (server-only email SDK) and install.
- [ ] T002 [P] Document the new env vars (`RESEND_API_KEY`, `EMAIL_FROM`) wherever env is documented (e.g. `.env.example` / README) — values are set by the user in Vercel, never committed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T003 Extend `Role` enum with `FINANCE` in `prisma/schema.prisma`.
- [ ] T004 Rename/extend `ClaimStatus` in `prisma/schema.prisma` to `SUBMITTED | APPROVED | REIMBURSED | REJECTED`; set `BenefitClaim.status` default to `SUBMITTED`.
- [ ] T005 Add payment columns to `BenefitClaim` in `prisma/schema.prisma`: `paidById`/`paidBy` (User rel `"ClaimPayer"`), `paidAt`, `transferDate`, `amountTransferred` (all nullable).
- [ ] T006 [P] Add the `NotificationSettings` singleton model (`id="singleton"`, `emailEnabled`, `hrInbox`, `financeInbox`, `fromName`, `updatedAt`) in `prisma/schema.prisma`.
- [ ] T007 Author `prisma/sql/0NN_claim_reimbursement_workflow.sql`: add the enum values + backfill (`PENDING→SUBMITTED`, `RELEASED→REIMBURSED`), add the `BenefitClaim` columns, create the `NotificationSettings` table with its singleton row. Verify by applying to a throwaway local Postgres and querying the migrated rows. Commit the SQL in the same commit as the schema change.
- [ ] T008 [P] Add `isFinance(role)` and `requireFinance()` to `src/lib/roles.ts` (Finance or Super User); add `FINANCE` to any role label map.
- [ ] T009 [P] Create `src/lib/email/client.ts`: env-gated `sendEmail()` — inert when `RESEND_API_KEY` unset or `emailEnabled` false, skip on empty recipient, fire-and-forget (catch + log, never rethrow).
- [ ] T010 [P] Create `src/lib/email/templates.ts` with the four transactional templates T1–T4 (per `contracts/emails.md`), plain navy/gold, EGP-formatted.
- [ ] T011 [P] Create `src/lib/notifications/settings.ts`: cached read + upsert of `NotificationSettings` (pattern of `src/lib/brand.ts`).
- [ ] T012 Update `src/lib/benefits/claims.ts`: `CLAIM_STATUS_LABEL`/`CLAIM_STATUS_CLASS` for the four statuses; `claimTotals` treats `SUBMITTED + APPROVED` as in-progress and `REIMBURSED` as paid.
- [ ] T013 Update every money-cap call-site that builds `claimedByBenefit` / sums consumed allowance so it counts **all non-rejected** claims (`SUBMITTED + APPROVED + REIMBURSED`); `rules.ts` math stays unchanged. Grep for `RELEASED`/`PENDING` across `src/lib/benefits/` and `src/app/(app)/**/actions*` and update each.

**Checkpoint**: schema + email + roles + status vocabulary in place; money rules still enforced server-side.

---

## Phase 3: User Story 1 — Employee submits, HR notified (Priority: P1) 🎯 MVP

**Goal**: Submitting a claim creates it as `SUBMITTED`, counts against caps, and emails the HR inbox.

**Independent Test**: Submit a claim → shows Submitted, counts toward caps, HR inbox gets T1 (or, email off, no send and no error).

- [ ] T014 [P] [US1] Mockup gate: employee claim status chips (Submitted/Approved/Reimbursed/Rejected) under `design-mockups/benefits-claims/` — get sign-off.
- [ ] T015 [US1] Update `submitClaim` (in `src/app/(app)/benefits/*actions*` / `src/lib/benefits/claims` create path) to set `status=SUBMITTED` and dispatch T1 to the HR inbox after the write (fire-and-forget).
- [ ] T016 [US1] Apply the approved status chips in the employee benefits views/components (`src/components/benefits/*`), snapshotting each edited file to `ui-versions/` first.
- [ ] T017 [US1] Verify: `tsc` + `build`; walk quickstart Scenario A step 1 and Scenario D (email off).

**Checkpoint**: Employees submit; HR is notified; statuses render.

---

## Phase 4: User Story 2 — HR approves/rejects; Finance or employee notified (Priority: P1)

**Goal**: HR advances a Submitted claim to Approved (email Finance) or Rejected with optional reason (email employee).

**Independent Test**: Approve one claim (→ Approved, Finance gets T2), reject another with a reason (→ Rejected, employee gets T3, allowance freed).

- [ ] T018 [P] [US2] Mockup gate: admin submissions tab controls renamed to **Approve** / **Reject** (from the old release control), showing the new states — sign-off. `design-mockups/admin-benefits-claims/`.
- [ ] T019 [US2] Implement `approveClaim(claimId)` (`requireAdmin`, guard `status==SUBMITTED` → `APPROVED`, set reviewer/decidedAt) + dispatch T2 to Finance inbox.
- [ ] T020 [US2] Implement `rejectClaim(claimId, reason?)` (`requireAdmin`, guard `status==SUBMITTED` → `REJECTED`, set `decisionNote`/reviewer/decidedAt) + dispatch T3 to employee.
- [ ] T021 [US2] Update the admin submissions UI (`src/app/(app)/admin/benefits/*`, components) to the approved Approve/Reject controls and show state; snapshot before editing.
- [ ] T022 [US2] Update `recordManualRelease` (spec 016) to create the claim directly as `REIMBURSED` with **no** emails.
- [ ] T023 [US2] Verify: `tsc` + `build`; quickstart Scenario B + access checks for HR actions.

**Checkpoint**: HR decisions work and notify the right party; caps update on rejection.

---

## Phase 5: User Story 3 — Finance releases payment; employee notified (Priority: P1)

**Goal**: Finance sees an awaiting-payment queue, confirms a transfer (amount + date), the claim becomes Reimbursed, employee emailed.

**Independent Test**: As Finance, confirm a payment → Reimbursed + fields recorded + employee gets T4; a plain HR/Employee is denied the queue.

- [ ] T024 [P] [US3] Mockup gate: Finance **payments queue** + confirm-payment form (amount + transfer date) under `design-mockups/finance-queue/` — sign-off, including where it sits in nav.
- [ ] T025 [US3] Add the Finance route/section (e.g. `src/app/(app)/finance/page.tsx`) listing `status==APPROVED` claims (payee, benefit, covered amount, approval date), gated by `requireFinance`.
- [ ] T026 [US3] Create `src/components/finance/PaymentsQueue.tsx` per the approved mockup.
- [ ] T027 [US3] Implement `confirmPayment(claimId, amountTransferred, transferDate)` (`requireFinance`, guard `status==APPROVED`, amount>0, date not future → `REIMBURSED`, set paidBy/paidAt/transferDate/amountTransferred) + dispatch T4 to employee.
- [ ] T028 [US3] Add the Finance queue to nav for Finance/Super User only (`src/components/AppShell.tsx` nav gating + layout role plumbing).
- [ ] T029 [US3] Verify: `tsc` + `build`; quickstart Scenario A (steps 2–4), Scenario C (access control), Scenario D (Resend failure still reimburses).

**Checkpoint**: Full Employee→HR→Finance→Employee loop closes with notifications.

---

## Phase 6: User Story 4 — Super User configures notifications (Priority: P2)

**Goal**: A Super User sets the master toggle, HR inbox, Finance inbox, and from-name.

**Independent Test**: Toggle off → no emails sent while state changes still happen; set inboxes → hand-off emails go to those addresses; non-Super-User denied.

- [ ] T030 [P] [US4] Mockup gate: notification-settings screen under `design-mockups/notification-settings/` — sign-off (fields: toggle, HR inbox, Finance inbox, from-name; note that the API key/from-address live in env, not shown).
- [ ] T031 [US4] Implement `saveNotificationSettings(...)` (`requireSuperUser`, upsert singleton) and the settings page/component per the approved mockup; snapshot before editing.
- [ ] T032 [US4] Ensure `sendEmail`/dispatch paths read `NotificationSettings` (toggle + inboxes) and surface a soft admin warning when a required inbox is blank while enabled (FR-020).
- [ ] T033 [US4] Verify: `tsc` + `build`; quickstart Scenario D (toggle off, blank inbox).

**Checkpoint**: Notifications are configurable and safely default to off/inert.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T034 Update steering docs in the same change: `CLAUDE.md` (qualify "No emails, ever (v1)"), `PROJECT_DETAILS.md` (claims workflow + FINANCE role + NotificationSettings), `IMPLEMENTATION_PLAN.md` (decision log: email reversal), `IMPLEMENTATION_PROGRESS.md` (feature status).
- [ ] T035 Amend `.specify/memory/constitution.md`: reverse the "No email in v1" technology constraint (user-approved), bump version, keep CLAUDE.md in sync (Governance clause).
- [ ] T036 Grep for any remaining `PENDING`/`RELEASED` claim-status references across `src/` (labels, filters, admin pills, dashboard counts) and update to the new vocabulary.
- [ ] T037 Full run of `quickstart.md` Scenarios A–F; final `tsc` + `build`; hand-off note listing the exact Neon SQL file order and the Vercel env vars to set.

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2, blocks everything)** → **US1 → US2 → US3** (each builds on the prior state in the pipeline) → **US4** (independent; can be done any time after Foundational) → **Polish**.
- US2 depends on US1's `SUBMITTED` state existing; US3 depends on US2's `APPROVED` state. US4 (settings) is independent but makes the emails from US1–US3 configurable — build it early if you want to exercise real emails during US1–US3.
- Every UI task is gated by its mockup task (T014, T018, T024, T030) per constitution II.

### Within each story
- Server action + guard before the UI that calls it.
- Mockup + sign-off before any component edit; snapshot before edit.

---

## Implementation Strategy

### MVP (Stories 1–3 = the working loop)
1. Setup + Foundational.
2. US1 (submit + HR notify) → validate.
3. US2 (HR approve/reject) → validate.
4. US3 (Finance pay + employee notify) → validate — **the loop is now complete**.
5. US4 (settings) to make it configurable; Polish + docs + constitution amendment.

### Notes
- Emails are fire-and-forget everywhere; never block a state change.
- Money rules stay server-authoritative; only the counted status set changes.
- Scope: flexible claims only — medical commitments and the guaranteed bulk Release sheet are untouched.
- Commit after each task or logical group; keep docs moving with code (constitution IV).
