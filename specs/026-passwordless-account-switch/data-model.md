# Phase 1 Data Model: Password-less Switching Between Linked Accounts

**Date**: 2026-08-15 · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

## Schema changes

**None.** No migration, no new table, no new column, no new environment variable. The feature
re-uses `User.employeeId` (migration `040`, spec 025) and the existing `AUTH_SECRET`.

## Entities read (not modified)

### User (existing)

| Field | Role in this feature |
|-------|----------------------|
| `id` | Identifies actor and target; the target's id is what the ticket is bound to. |
| `email` | Returned by the provider; the `jwt` callback re-resolves role from it. |
| `employeeId` | **The sole basis for permitting a switch.** HR-managed, optional, intentionally non-unique. Compared **trimmed**, and must be non-empty after trimming. |
| `status` | Both actor and target must be `ACTIVE`. A `LEFT` account is unreachable by switching, exactly as it is unreachable by sign-in. |
| `name`, `businessUnit.name` | Display label in the switcher (unchanged). |
| `role` | **Never carried across.** Re-resolved from the target after the switch. |
| `mustChangePassword` | Still enforced on arrival by the app layout (unchanged). |

## Transient value object

### Switch ticket (in-memory only — never stored)

A signed string handed from the server action to the provider within one request chain.

| Part | Value | Purpose |
|------|-------|---------|
| `actorId` | The signed-in user's id | Binds the ticket to the session that minted it |
| `targetId` | The account being switched to | Binds the ticket to one destination |
| `expiresAt` | Mint time + 60s (epoch ms) | Bounds the replay window |
| `signature` | `HMAC-SHA256(AUTH_SECRET, "actorId.targetId.expiresAt")` | Proves a verified session minted it |

**Lifetime**: one request chain, ~60 seconds maximum. Never written to the database, never logged,
never placed in a URL (it travels as a credential in the sign-in POST body).

**Not authoritative**: the ticket proves *who asked*, never *whether it is allowed*. The provider
re-reads both `User` rows and re-checks the link before honouring it.

## The link predicate (single source of truth)

Both the sidebar list and the switch authorisation resolve "is B linked to A?" through **one shared
function**, so what a person is offered and what the server permits can never drift:

```
linked(A, B)  ⟺  A.status = ACTIVE
              ∧  B.status = ACTIVE
              ∧  A.id ≠ B.id
              ∧  trim(A.employeeId) ≠ ""
              ∧  trim(A.employeeId) = trim(B.employeeId)
```

Evaluated **at the moment of the switch**, from stored records. Any failure — including an exception
reaching the database — refuses the switch (fails closed).

## State transitions

```
signed in as A ──switch(B)──▶ signed in as B          ticket valid ∧ linked(A,B)
signed in as A ──switch(B)──▶ signed in as A (refused) otherwise
signed in as A ──switch(A)──▶ signed in as A (no-op, no error shown)
not signed in  ──switch(B)──▶ sign-in page            no session to mint a ticket
impersonating  ──switch(B)──▶ impersonation cleared first, then the rules above
```
