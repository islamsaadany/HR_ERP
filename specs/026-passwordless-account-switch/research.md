# Phase 0 Research: Password-less Switching Between Linked Accounts

**Date**: 2026-08-15 · **Spec**: [spec.md](./spec.md)

The spec has no `[NEEDS CLARIFICATION]` markers — the three product decisions were settled on
2026-08-15. One genuine technical unknown remained: **how to issue a session for a second account
without a password, in a way that cannot itself become a password bypass.**

---

## R1 — How to authorise the switch (the central decision)

**Decision**: A **short-lived, HMAC-signed switch ticket** minted by the server action, consumed by a
dedicated `switch-account` credentials provider that **independently re-checks the link in the
database** before returning the target user.

Two verifications, deliberately not one:

| Where | What it proves |
|-------|----------------|
| Server action (`switchAccountAction`) | A real, valid session exists **right now** and belongs to an account linked to the target. Mints a ticket bound to `(actorId, targetId)` and expiring in 60 seconds. |
| Provider `authorize()` | The ticket's HMAC verifies (so a verified session asked for this) **and** the link still holds when re-read from stored records — both accounts ACTIVE, same trimmed non-empty `employeeId`, target ≠ actor. |

**Rationale**: The provider callback route (`/api/auth/callback/switch-account`) is a publicly
reachable POST endpoint. Anything it accepts on trust is, by definition, a way to obtain a session
without a password — exactly what FR-003 forbids. The HMAC alone is not enough either: it says
*"a session asked for this at some point"*, not *"the link is still valid"*, which is why
`authorize()` re-queries the database rather than believing the ticket's contents (FR-002).

**Alternatives considered**:

1. **Decode the session cookie inside `authorize()`** and skip the ticket entirely. *Rejected*: it
   depends on Auth.js internals — `decode()` needs the cookie name as its salt, and that name changes
   between environments (`authjs.session-token` vs `__Secure-` prefixed). Brittle across upgrades, and
   a silent failure here fails **open** on a security check.
2. **Verify only in the server action and let the provider trust its input.** *Rejected*: this is the
   password bypass the spec explicitly rules out. The callback endpoint does not care that a server
   action exists.
3. **Persist a one-time switch token as a database row.** *Rejected*: a migration, a write, a read and
   a cleanup path for an artifact that lives 60 seconds. The stateless HMAC is adequate — see the
   replay note below. Keeps the feature migration-free.
4. **Keep the password prompt** (today's behaviour). *Rejected by product decision* — this is the
   feature.

**Replay note (accepted)**: a stateless ticket can be re-sent within its 60-second window. This grants
nothing new — the holder already possesses the session that minted it, and `authorize()`'s database
re-check still gates every use. Single-use would require the state that R1.3 rejected.

## R2 — Does the target's role apply after the switch?

**Finding: yes, already — no work required.** `src/lib/auth.ts`'s `jwt` callback re-resolves
`uid`, `role` and `name` from the database **by `token.email` on every invocation**. Because the
provider returns the target's email, the very next callback resolves the target's role. No role can
survive a switch (FR-005), and a role changed by HR after the switch is picked up too.

## R3 — Does the forced password-change gate still fire after a switch?

**Finding: yes, already — no work required.** `src/app/(app)/layout.tsx` reads
`mustChangePassword` for the **current session user** on every app page render and redirects to
`/set-password`. Arriving in an account by switching therefore hits the same gate as signing into it
(FR-009). Switching moves you into the account; it never satisfies that account's password
obligation.

## R4 — Where the "non-empty Employee ID" rule has to be enforced

**Finding: the existing check is nearly right but not sufficient for this feature.**
`src/app/(app)/layout.tsx` guards with `if (me?.employeeId)`, which correctly excludes `null` and
`""` — but **not** a whitespace-only value like `" "`, which is truthy and would match another
whitespace-only record. Harmless when it only decides whether to render a sidebar list; **not**
harmless once it authorises a password-less session.

**Decision**: the switch check **trims** the Employee ID and requires a non-empty result, and matches
on the trimmed value (FR-002). The sidebar query is aligned to the same rule so the list and the
permission can never disagree.

## R5 — Signing primitive

**Decision**: `createHmac("sha256", AUTH_SECRET)` with `timingSafeEqual` comparison, from Node's
built-in `crypto` — matching the house style already set by `src/lib/password.ts` (scrypt, no
external dependency, no native build, works on Vercel). `AUTH_SECRET` is already required by
NextAuth, so **no new environment variable** is introduced.

## R6 — Impersonation interaction

**Finding**: today's `switchAccountAction` already deletes the impersonation cookie, and
`(app)/layout.tsx` already suppresses the switcher while impersonating. Both behaviours are kept and
the cookie deletion moves ahead of the ticket mint so no path can carry impersonation across
(FR-006, FR-010).

## R7 — Un-migrated database safety

**Finding**: `employeeId` (migration `040`) may be absent on a database that hasn't run it. The
sidebar query is already wrapped in try/catch and degrades to "no linked accounts". The switch path
adopts the same posture: any failure to establish the link **refuses the switch** — it fails closed.
