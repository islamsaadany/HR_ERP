# Quickstart / Validation Guide: Password-less Account Switch

**Spec**: [spec.md](./spec.md) · **Contract**: [contracts/switch-account.md](./contracts/switch-account.md)

How to prove this feature works — and, more importantly, that it cannot be used to reach an account
that isn't yours. **No migration is required** (the feature re-uses `employeeId` from migration `040`).

## Prerequisites

- `AUTH_SECRET` set (already required by NextAuth — no new variable).
- A database that has run migration `040` (the `employeeId` column). Without it the switcher simply
  never appears, and the switch fails closed.
- Two ACTIVE employee records with **different emails** and the **same Employee ID**, ideally in two
  business units so the brand visibly changes on switching.

## Build gates (must pass before handover)

```bash
npx tsc --noEmit
npm run build
```

## A. The everyday journey (User Story 1)

1. Sign in as account A.
2. Open the sidebar → **Switch account** → pick account B.
3. **Expect**: arrival in B with **no password prompt**; B's name, business-unit brand, benefits and
   navigation. Switch back to A and expect the same in reverse.
4. With A as Employee and B as an elevated role, confirm the admin navigation appears **only** in the
   account entitled to it, in both directions — no permission leaks across the switch.

## B. The security properties (User Story 2) — the part that actually matters

Each of these must **refuse** and leave the current session untouched:

| # | Attempt | Expected |
|---|---------|----------|
| B1 | Switch naming an account that does **not** share the Employee ID | Refused |
| B2 | POST `/api/auth/callback/switch-account` with an invented ticket | Refused — no session issued |
| B3 | POST that endpoint with **no session at all** | Refused |
| B4 | Two accounts whose Employee ID is blank / whitespace-only | Refused — absent IDs never link |
| B5 | Render the sidebar, have HR clear one account's Employee ID, *then* click switch | Refused — the link is re-checked at switch time, not at render time |
| B6 | Switch to an account whose status is `LEFT` | Refused |
| B7 | Re-send a valid ticket after 60 seconds | Refused — expired |
| B8 | Switch naming the account already in use | No-op, no error shown |

**B2, B3 and B5 are the ones to run deliberately.** If any of them succeeds, the feature has become a
password bypass and must not ship.

## C. Impersonation (User Story 3)

1. As a Super User with linked accounts, start **View as employee**.
2. Confirm the switcher is **hidden** while impersonating.
3. End impersonation, switch accounts, and confirm the new session carries **no** impersonation.

## D. Regression checks

- A person with **no** linked accounts sees no switcher and is unaffected.
- Sign-out still works from either account.
- The **first** sign-in of the day still requires a password.
- Session lifetime is unchanged — a session established before the change still behaves as before.
- An account with a temporary password, entered by switching, is still forced to `/set-password`.

## E. Verification against a real database

Rather than reasoning about the link predicate, exercise it against a throwaway Postgres 16 (per
`CLAUDE.md` §3a): seed two linked accounts, one unlinked account, one `LEFT` account and one pair
with whitespace-only Employee IDs, then assert the predicate permits exactly one pair in each
direction and refuses every other combination.
