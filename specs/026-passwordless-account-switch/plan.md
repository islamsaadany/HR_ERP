# Implementation Plan: Password-less Switching Between Linked Accounts

**Branch**: `claude/benefits-page-styling-3behc7` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-passwordless-account-switch/spec.md`

## Summary

Remove the password prompt from the linked-account switcher. A person holding a valid session moves
into another of their own accounts in one click; authorisation comes from **a server-side re-check of
the shared Employee ID at the moment of the switch**, not from a password.

The technical approach (see [research.md](./research.md) R1) is deliberately **two-stage**: the server
action verifies the live session and the link, then mints a 60-second HMAC-signed ticket; a dedicated
`switch-account` credentials provider verifies that signature **and independently re-reads both
employee records** before issuing a session. The second check exists because the provider's callback
route is publicly POST-able — anything it accepts on trust is a password bypass.

Two spec requirements turn out to need **no new code at all** (research R2, R3): the existing `jwt`
callback re-resolves role from the database on every call, so no permission can survive a switch; and
the app layout's forced-password-change gate already keys off the current session user, so it fires
after a switch exactly as after a sign-in. Both are covered by tests rather than by new mechanism.

**No migration. No new environment variable. No schema change. No UI change.**

## Technical Context

**Language/Version**: TypeScript, Next.js 15.5 (App Router) + React 19, Node runtime

**Primary Dependencies**: NextAuth v5 (`^5.0.0-beta.29`), Prisma, Node built-in `crypto` — **no new dependency**

**Storage**: PostgreSQL (Neon) + Prisma — **read-only for this feature**; no migration

**Testing**: `npx tsc --noEmit`, `npm run build`, plus the adversarial scenarios in
[quickstart.md](./quickstart.md) §B and a throwaway-Postgres check of the link predicate (§E)

**Target Platform**: Vercel (server actions + auth run in the Node runtime)

**Project Type**: Web application (Next.js App Router, single codebase)

**Performance Goals**: A switch completes in under 5 seconds (SC-001); adds two indexed primary-key
reads to a flow that already redirects

**Constraints**: Must fail **closed** — any error, malformed input or database failure refuses the
switch. Session lifetime must not change. No client-supplied value may establish the link.

**Scale/Scope**: One known dual-contract person today; the design is per-pair and holds for any
number of linked accounts. Roughly 3 source files touched, ~120 lines.

## Constitution Check

*GATE: checked before Phase 0 and re-checked after Phase 1 design.*

| Principle | Assessment | Verdict |
|-----------|-----------|---------|
| **I. Align Before Building** (non-negotiable) | The product owner asked for password-less switching, was shown the security trade-off, was offered a role-gated password step, and declined it in favour of the simpler flow. Spec written and approved before any code. | ✅ Pass |
| **II. UI Changes Require Explicit Approval** | **No UI change.** The switcher's placement, label and appearance are untouched — only what happens on click changes. No `ui-versions/` snapshot needed because no UI file changes; if implementation finds one must, it stops and asks first. | ✅ Pass |
| **III. Benefits Money & Rules Server-Authoritative** | No benefits code touched. The *principle* — never trust the client for an authorisation decision — is the core of this design (FR-003). | ✅ Pass |
| **IV. Spec-Driven & Docs Move With Code** | Spec `026` written first. It **reverses** spec 025's recorded decision, so 025 is marked superseded in place rather than silently re-aligned. `PROJECT_DETAILS.md` + `IMPLEMENTATION_PROGRESS.md` update in the implementing commit. | ✅ Pass |
| **V. Engineered Enough, Explicit Over Clever** | One shared link predicate used by both the sidebar and the authorisation, so display and permission cannot drift (research R4 found they currently *could*). Fails closed. No stateful token store for a 60-second artifact. | ✅ Pass |

**Additional constraint checks**: no new env var (re-uses `AUTH_SECRET`); no migration, so no
`prisma/sql/` file is owed; no secrets committed; branch is the session's designated branch.

**Result: PASS — no violations, Complexity Tracking not required.**

### Post-Phase-1 re-check

Design reviewed against the same gates after `data-model.md` and `contracts/` were written: no schema
change appeared, no UI change appeared, and the two-stage verification is the minimum that satisfies
FR-002/FR-003 rather than added abstraction. **Still PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/026-passwordless-account-switch/
├── spec.md                      # Feature specification (approved)
├── plan.md                      # This file
├── research.md                  # Phase 0 — R1..R7, the authorisation decision
├── data-model.md                # Phase 1 — no schema change; the link predicate
├── quickstart.md                # Phase 1 — validation, incl. adversarial scenarios
├── contracts/
│   └── switch-account.md        # Phase 1 — server action + provider contract
├── checklists/
│   └── requirements.md          # Spec quality checklist (passed)
└── tasks.md                     # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── auth.ts                  # MODIFIED — add the `switch-account` provider
│   ├── switch-account.ts        # NEW — link predicate + ticket mint/verify (pure, testable)
│   └── switch-account-action.ts # MODIFIED — verify session + link, mint ticket, sign in
└── app/(app)/
    └── layout.tsx               # MODIFIED — sidebar list uses the shared link predicate
```

**Structure Decision**: Existing Next.js App Router layout, unchanged. The one new file,
`src/lib/switch-account.ts`, exists so the **link predicate and the ticket crypto are pure and
independently exercisable** — the predicate is the security boundary of this feature, and it must not
be reachable only through an auth flow. It sits beside the existing `src/lib/roles.ts` /
`src/lib/password.ts` server-side helpers, matching house convention.

## Implementation Sequence

1. `src/lib/switch-account.ts` — `isLinked()` predicate (trimmed, non-empty, both ACTIVE, not self) plus `mintTicket()` / `verifyTicket()` over `AUTH_SECRET`.
2. `src/lib/auth.ts` — register the `switch-account` provider whose `authorize()` verifies the ticket **and** re-runs `isLinked()` from the database.
3. `src/lib/switch-account-action.ts` — replace sign-out-and-redirect with: clear impersonation → verify session + link → mint ticket → `signIn("switch-account", …)`.
4. `src/app/(app)/layout.tsx` — point the sidebar query at the shared predicate so the offer matches the permission.
5. Verify: `tsc`, `build`, the quickstart §B adversarial attempts, and the throwaway-Postgres predicate check.
6. Docs in the same commit: `PROJECT_DETAILS.md`, `IMPLEMENTATION_PROGRESS.md`, spec status.

## Risks

| Risk | Handling |
|------|----------|
| The provider becomes a password bypass | The whole design guards this: `authorize()` re-checks the link from stored records and never trusts ticket contents. Quickstart §B2/B3/B5 must be run deliberately. |
| Sidebar offer and server permission drift | Both call one shared predicate (research R4 found this drift is possible today). |
| Un-migrated database (no `employeeId`) | Fails closed — no switcher, no switch. |
| Product-accepted risk: mistyped Employee ID links two people | Recorded and accepted in spec *Residual Risks*; the role-gated password prompt remains the named mitigation if linked accounts ever grow beyond known individuals. |
