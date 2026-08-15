# Contract: Account Switch

**Spec**: [../spec.md](../spec.md) · **Type**: internal server action + auth provider (no public HTTP API)

## 1. `switchAccountAction(formData)` — server action

Invoked by the sidebar switcher form.

**Input**: `targetEmail` (string) — the account to switch to. *Treated as untrusted.*

**Preconditions checked before anything else happens**:

| # | Condition | On failure |
|---|-----------|------------|
| 1 | A valid session exists | Redirect to `/signin`; no session change |
| 2 | Actor record loads and is `ACTIVE` | Refuse; stay in current account |
| 3 | Target resolves from `targetEmail` and is `ACTIVE` | Refuse; **message must not reveal whether the account exists** (FR-004) |
| 4 | `linked(actor, target)` holds (see data-model) | Refuse; stay in current account |
| 5 | `target.id ≠ actor.id` | No-op; no error shown (FR/edge case) |

**Effects on success**, in this order:
1. Delete the impersonation cookie (FR-006) — **before** the ticket is minted, so no path carries it across.
2. Mint a switch ticket bound to `(actorId, targetId)`, expiring in 60s.
3. Call sign-in on the `switch-account` provider with that ticket.
4. Redirect to the app home of the now-current account.

**Guarantees**: never mutates employee data; never merges accounts; leaves the current session
untouched on any failure.

## 2. `switch-account` credentials provider — `authorize(credentials)`

Reachable directly at `/api/auth/callback/switch-account`. **Assumes its input is hostile.**

**Input**: `ticket` (string).

**Returns**: the target user (`{ id, email, name }`) **only** when *all* of the following hold; otherwise `null`.

| # | Check | Notes |
|---|-------|-------|
| 1 | Ticket parses into `actorId`, `targetId`, `expiresAt`, `signature` | Malformed → `null` |
| 2 | HMAC verifies against `AUTH_SECRET`, compared timing-safely | Forged → `null` |
| 3 | `expiresAt` is in the future | Expired → `null` |
| 4 | Both users load from the database | Missing → `null` |
| 5 | `linked(actor, target)` re-evaluated **now**, from stored records | **The authoritative check** (FR-002/FR-003) |

**Critical property**: check 5 is not skippable by anything the caller sends. A valid signature alone
never yields a session. A link revoked after the ticket was minted refuses the switch.

**Failure mode**: any thrown error results in `null` — the switch fails **closed**.

**Returns no password path**: this provider never accepts, compares, or bypasses a password. It is
not a login route; it only re-points an already-authenticated person at their own linked account.

## 3. Post-switch invariants (verified, not assumed)

| Invariant | Enforced by |
|-----------|-------------|
| Session carries only the target's identity and role | Existing `jwt` callback re-resolves from `token.email` on every call (research R2) |
| No impersonation survives | Cookie deleted in step 1 of the action |
| Target's forced password change still applies | Existing `(app)/layout.tsx` gate (research R3) |
| Each account's data stays independent | No code path copies data between accounts |

## 4. Unchanged by this contract

The sidebar switcher's placement, label and appearance; HR's Employee ID entry and linking warning;
session lifetime and expiry; sign-in for the first session of the day.
