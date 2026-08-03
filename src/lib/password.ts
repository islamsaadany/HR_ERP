/**
 * Password hashing for email + password sign-in.
 *
 * Uses Node's built-in scrypt (no external dependency, no native build — works
 * on Vercel). Stored format: `scrypt$<saltHex>$<hashHex>`. Verification is
 * timing-safe. This runs only in the Node runtime (auth + server actions).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A short, readable temporary password an admin can hand to an employee. */
export function generateTempPassword(): string {
  // ~11 URL-safe chars, no ambiguous separators.
  return randomBytes(8).toString("base64url");
}

/** Shared minimum length for a real (non-bootstrap) password. */
export const MIN_PASSWORD_LENGTH = 6;
