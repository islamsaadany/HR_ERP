/**
 * Password hashing for email + password sign-in.
 *
 * Uses Node's built-in scrypt (no external dependency, no native build — works
 * on Vercel). Stored format: `scrypt$<saltHex>$<hashHex>`. Verification is
 * timing-safe. This runs only in the Node runtime (auth + server actions).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// The password policy lives in a Node-free module so it can also run in the browser
// (the live requirement checklist). Re-exported here for existing server imports.
export {
  MIN_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
  validatePasswordPolicy,
  passwordMeetsPolicy,
  PASSWORD_RULES,
} from "./password-policy";

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
  // ~11 URL-safe chars, no ambiguous separators. A temporary password is exempt
  // from the user policy (see password-policy.ts) — the employee is forced to
  // choose a compliant one on first sign-in (mustChangePassword).
  return randomBytes(8).toString("base64url");
}
