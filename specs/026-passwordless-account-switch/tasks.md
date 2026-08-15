---

description: "Task list for spec 026 — password-less switching between linked accounts"
---

# Tasks: Password-less Switching Between Linked Accounts

**Input**: Design documents from `/specs/026-passwordless-account-switch/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: This project has no automated test suite. Verification is by `npx tsc --noEmit`,
`npm run build`, the **adversarial scenarios in [quickstart.md](./quickstart.md) §B**, and a
throwaway-Postgres exercise of the link predicate (§E) — as required by `CLAUDE.md` §3a
("audit fixes before asking the user to test"). Those verification tasks are **not optional here**:
US2 *is* the security property, so leaving it unverified would mean shipping an unproven
authorisation change.

**Organization**: Grouped by user story. Note that **US1 and US2 are both P1 and ship together** —
the spec states neither ships without the other, because US2 is what makes US1 safe.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Next.js App Router, single codebase. Server-side helpers live in `src/lib/`; the app shell lives in
`src/app/(app)/`.

---

## Phase 1: Setup

**Purpose**: Confirm the starting state. There is no project initialisation — this feature adds no
dependency, no environment variable and no migration.

- [ ] T001 Confirm the baseline is green before touching anything: run `npx tsc --noEmit` and `npm run build` at the repo root and record that both pass
- [ ] T002 Confirm `AUTH_SECRET` is the secret already in use by reading `src/lib/auth.ts` and `.env.example` — no new environment variable may be introduced by this feature
- [ ] T003 Confirm no migration is owed: verify `User.employeeId` already exists in `prisma/schema.prisma` (migration `040`) and that no schema change is planned

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The link predicate and ticket crypto. **Blocks every user story** — US1 calls it to
permit a switch, US2 is the proof that it refuses everything else.

**⚠️ CRITICAL**: This phase is the security boundary of the feature. It must be pure and callable
without an auth flow, so it can be exercised directly.

- [ ] T004 Create `src/lib/switch-account.ts` with the `isLinked(actor, target)` predicate implementing exactly the rule in [data-model.md](./data-model.md): both `ACTIVE`, `actor.id !== target.id`, `employeeId` **trimmed** on both sides, trimmed value non-empty, and the two trimmed values equal
- [ ] T005 Add `mintTicket(actorId, targetId)` to `src/lib/switch-account.ts` — payload `actorId.targetId.expiresAt` (60s ahead) signed with `createHmac("sha256", AUTH_SECRET)`, matching the no-dependency house style of `src/lib/password.ts`
- [ ] T006 Add `verifyTicket(ticket)` to `src/lib/switch-account.ts` — parse, verify the HMAC with `timingSafeEqual`, reject an expired `expiresAt`, and return `null` (never throw) on any malformed input
- [ ] T007 Ensure every function in `src/lib/switch-account.ts` **fails closed**: any parse failure, missing field, or unexpected input returns `null`/`false` rather than propagating an error or defaulting to allow

**Checkpoint**: The predicate and ticket helpers exist and are independently callable.

---

## Phase 3: User Story 1 — Move between my own accounts without a password (Priority: P1)

**Goal**: One click moves a signed-in person into their other linked account, no password prompt.

**Independent Test**: Sign in as account A, click account B in the sidebar switcher, arrive in B
signed in — with B's name, brand and navigation. Switch back and observe the same in reverse.

- [ ] T008 [US1] Register a `switch-account` credentials provider in `src/lib/auth.ts` whose `authorize()` takes a `ticket` credential, calls `verifyTicket()`, loads **both** users from the database, re-runs `isLinked()`, and returns the target `{ id, email, name }` only when all checks pass — otherwise `null`
- [ ] T009 [US1] Rewrite `switchAccountAction` in `src/lib/switch-account-action.ts` per [contracts/switch-account.md](./contracts/switch-account.md) §1: resolve the current session, load actor and target, check `isLinked()`, then `signIn("switch-account", { ticket, redirectTo })` — replacing today's `signOut()`-and-redirect-to-signin
- [ ] T010 [US1] Handle the self-switch case in `src/lib/switch-account-action.ts`: a target equal to the current account is a silent no-op, never an error shown to the person
- [ ] T011 [US1] Confirm no UI change is needed — `src/components/AppShell.tsx` still posts `email` to the same action. **If any change to the switcher's markup turns out to be required, stop and ask for approval first** (constitution II); no `ui-versions/` snapshot is otherwise owed
- [ ] T012 [US1] Verify the everyday journey per [quickstart.md](./quickstart.md) §A, including §A4: an Employee account and an elevated-role account must each expose only their own navigation, in both directions

**Checkpoint**: Switching works without a password. **Do not consider this shippable until Phase 4 passes.**

---

## Phase 4: User Story 2 — The switch can never reach an account that isn't mine (Priority: P1)

**Goal**: Prove the removed password has been replaced by something at least as strong.

**Independent Test**: Every adversarial attempt in [quickstart.md](./quickstart.md) §B is refused and
issues no session.

- [ ] T013 [US2] Align the sidebar query in `src/app/(app)/layout.tsx` to the shared predicate so the accounts *offered* and the accounts *permitted* cannot drift — this closes the whitespace-only `employeeId` gap found in [research.md](./research.md) R4
- [ ] T014 [US2] Ensure `switchAccountAction` in `src/lib/switch-account-action.ts` reveals nothing about whether an unlinked target account exists (FR-004) — one indistinguishable refusal for "no such account" and "not linked to you"
- [ ] T015 [US2] Wrap the database reads in the provider's `authorize()` (`src/lib/auth.ts`) so an exception — including an un-migrated database with no `employeeId` column — refuses the switch rather than propagating (research R7)
- [ ] T016 [US2] Verify quickstart §B2 deliberately: POST a fabricated ticket to `/api/auth/callback/switch-account` and confirm no session is issued
- [ ] T017 [US2] Verify quickstart §B3 deliberately: POST that endpoint with no session at all and confirm refusal
- [ ] T018 [US2] Verify quickstart §B5 deliberately: render the sidebar, clear one account's Employee ID, then click switch — must refuse, proving the link is re-checked at switch time and not at render time
- [ ] T019 [P] [US2] Verify the remaining quickstart §B cases: B1 (unlinked target), B4 (blank/whitespace Employee IDs), B6 (`LEFT` target), B7 (expired ticket), B8 (self-switch no-op)
- [ ] T020 [US2] Exercise the link predicate against a throwaway Postgres 16 per quickstart §E — seed two linked accounts, one unlinked, one `LEFT`, and a whitespace-only pair, then assert the predicate permits exactly the one pair in both directions and refuses every other combination

**Checkpoint**: US1 + US2 together are shippable. **Neither ships alone.**

---

## Phase 5: User Story 3 — Switching and impersonation never combine (Priority: P2)

**Goal**: A borrowed "View as employee" view cannot survive a switch.

**Independent Test**: As a Super User with linked accounts, start impersonation, switch, and confirm
the impersonation is gone and the target account is shown as itself.

- [ ] T021 [US3] Confirm the impersonation cookie is deleted in `src/lib/switch-account-action.ts` **before** the ticket is minted, so no ordering permits it to carry across (FR-006)
- [ ] T022 [US3] Confirm `src/app/(app)/layout.tsx` still suppresses the switcher entirely while impersonating (FR-010) — existing behaviour, must not regress
- [ ] T023 [US3] Verify per [quickstart.md](./quickstart.md) §C: switcher hidden during impersonation, and no impersonation survives a switch

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T024 Run the regression checks in [quickstart.md](./quickstart.md) §D: no switcher for an unlinked person, sign-out works from either account, the first sign-in of the day still needs a password, session lifetime unchanged, and a temp-password account entered by switching is still forced to `/set-password`
- [ ] T025 Re-run `npx tsc --noEmit` and `npm run build` and confirm both pass
- [ ] T026 [P] Update `PROJECT_DETAILS.md` — amend the spec 025 account-switcher description to the password-less model and record the accepted residual risk
- [ ] T027 [P] Update `IMPLEMENTATION_PROGRESS.md` with spec 026 as built
- [ ] T028 [P] Set the **Status** line in [spec.md](./spec.md) to implemented, with what was verified and how
- [ ] T029 Confirm `specs/025-employee-id-account-switch/spec.md` still carries its superseded marker so the two specs cannot silently disagree (constitution IV)
- [ ] T030 Commit code and docs **together** in one commit (constitution IV) and push to the designated branch

---

## Dependencies

```text
Phase 1 (Setup)
   └─▶ Phase 2 (Foundational: predicate + ticket)   ← BLOCKS EVERYTHING
          ├─▶ Phase 3 (US1: the switch works)
          │      └─▶ Phase 4 (US2: it refuses everything else)   ← US1 not shippable without this
          ├─▶ Phase 5 (US3: impersonation)          ← independent of US1/US2 outcome
          └─▶ Phase 6 (Polish)                      ← after all stories
```

**Story dependencies**:

- **US1 → US2**: not a build dependency but a **release** dependency. US2 verifies the property that
  makes US1 safe; shipping US1 alone would ship an unverified authorisation change.
- **US3**: touches only impersonation ordering; independently testable.

## Parallel Opportunities

- **T026, T027, T028** — three different documentation files, no shared edits.
- **T019** — the remaining adversarial cases are read-only attempts, runnable alongside other verification.
- Phase 2 tasks are sequential: T005 and T006 are two halves of one ticket format, and T007 is a
  property of all three.

## Implementation Strategy

**MVP scope**: Phases 1–4 (US1 + US2). That is the smallest honest release — the feature plus the
proof it is not a way in.

**Increment 2**: Phase 5 (US3), then Phase 6.

**Stop conditions** — halt and ask rather than proceeding:
- Any quickstart §B attempt **succeeds** (T016–T019) → the design is wrong, do not ship.
- Any UI file needs changing (T011) → constitution II requires approval first.
- A migration turns out to be needed (T003) → the plan's "no migration" premise is wrong; re-plan.
