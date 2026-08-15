/**
 * Linked-account switching (spec 026).
 *
 * A person holding two contracts across two group companies has two employee
 * records that share one HR-managed **Employee ID**. This module holds the two
 * pure pieces that let them move between those accounts WITHOUT re-entering a
 * password — the thing the password used to stand in for:
 *
 *   1. `isLinked()` — the single predicate deciding whether two records are the
 *      same person. Both the sidebar's list of accounts and the server-side
 *      authorisation call it, so what a person is OFFERED and what the server
 *      PERMITS can never drift apart.
 *   2. `mintTicket()` / `verifyTicket()` — a short-lived HMAC-signed ticket that
 *      carries "a verified session asked for this switch" from the server action
 *      into the auth provider.
 *
 * The ticket is deliberately NOT authoritative. It proves who asked, never
 * whether it is allowed: `authorize()` re-reads both employee records and
 * re-runs `isLinked()` before issuing a session. That matters because the
 * provider's callback route is a publicly reachable POST endpoint — anything it
 * accepted on trust would be a password bypass.
 *
 * Everything here FAILS CLOSED: malformed input, a missing secret, or anything
 * unexpected returns false/null rather than throwing or defaulting to allow.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** How long a minted ticket stays usable. Long enough for one redirect chain. */
const TICKET_TTL_MS = 60_000;

/** The fields of an employee record the link decision is allowed to depend on. */
export type LinkableAccount = {
  id: string;
  employeeId: string | null;
  status: string;
};

/**
 * Is `target` the same person as `actor`?
 *
 * The Employee ID is HR-typed and intentionally non-unique — a shared value is
 * exactly what marks two records as one human. It is compared TRIMMED, and an
 * ID that is empty after trimming never links anyone: a whitespace-only value
 * would otherwise match every other whitespace-only record, which is harmless
 * when it only decides whether to draw a sidebar list but decidedly not when it
 * authorises a session.
 */
export function isLinked(
  actor: LinkableAccount | null | undefined,
  target: LinkableAccount | null | undefined
): boolean {
  if (!actor || !target) return false;
  if (actor.status !== "ACTIVE" || target.status !== "ACTIVE") return false;
  if (actor.id === target.id) return false;

  const actorId = (actor.employeeId ?? "").trim();
  const targetId = (target.employeeId ?? "").trim();
  if (!actorId || !targetId) return false;

  return actorId === targetId;
}

/**
 * The trimmed Employee ID to match other accounts on, or null when this person
 * has none. Keeps the sidebar query using the same notion of "non-empty" as
 * `isLinked()` rather than a second, looser one.
 */
export function linkKey(employeeId: string | null | undefined): string | null {
  const key = (employeeId ?? "").trim();
  return key.length > 0 ? key : null;
}

function secret(): string | null {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  return value.length > 0 ? value : null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/**
 * Mint a ticket binding one actor to one target for a short window. Called only
 * after the server action has verified the live session and the link.
 *
 * Returns null when no signing secret is configured — no secret means no
 * verifiable ticket, so the switch must fail rather than proceed unsigned.
 */
export function mintTicket(actorId: string, targetId: string): string | null {
  const key = secret();
  if (!key) return null;
  const expiresAt = Date.now() + TICKET_TTL_MS;
  const payload = `${actorId}.${targetId}.${expiresAt}`;
  return `${payload}.${sign(payload, key)}`;
}

export type TicketClaims = { actorId: string; targetId: string };

/**
 * Verify a ticket's signature and expiry, returning who it names — or null.
 *
 * A valid return means "a verified session minted this recently". It does NOT
 * mean the switch is allowed; the caller must still re-check `isLinked()`
 * against stored records.
 */
export function verifyTicket(ticket: unknown): TicketClaims | null {
  try {
    if (typeof ticket !== "string" || ticket.length === 0) return null;

    const parts = ticket.split(".");
    if (parts.length !== 4) return null;
    const [actorId, targetId, expiresRaw, signature] = parts;
    if (!actorId || !targetId || !expiresRaw || !signature) return null;

    const key = secret();
    if (!key) return null;

    const expected = sign(`${actorId}.${targetId}.${expiresRaw}`, key);
    const given = Buffer.from(signature, "hex");
    const want = Buffer.from(expected, "hex");
    // Length must match before timingSafeEqual, which throws on a mismatch.
    if (given.length !== want.length || given.length === 0) return null;
    if (!timingSafeEqual(given, want)) return null;

    const expiresAt = Number(expiresRaw);
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

    return { actorId, targetId };
  } catch {
    return null; // fail closed — never let a malformed ticket become an error path
  }
}
