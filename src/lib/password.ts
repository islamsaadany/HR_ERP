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
  // ~11 URL-safe chars, no ambiguous separators. A temporary password is exempt
  // from the user policy below — the employee is forced to choose a compliant one
  // on first sign-in (mustChangePassword).
  return randomBytes(8).toString("base64url");
}

/** Shared minimum length for a user-chosen sign-in password. */
export const MIN_PASSWORD_LENGTH = 8;

/** Human-readable summary of the password policy, for UI hints. */
export const PASSWORD_POLICY_HINT =
  `At least ${MIN_PASSWORD_LENGTH} characters, including an uppercase letter, a number, and a special character (e.g. @ % ! #).`;

/**
 * Validate a user-chosen password against the house policy: at least
 * MIN_PASSWORD_LENGTH characters, with an uppercase letter, a number, and a
 * special (non-alphanumeric) character. Returns an error message, or null when
 * it passes. Admin-issued temporary passwords are intentionally NOT run through
 * this — they exist only to force a compliant change on first sign-in.
 */
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include a special character (e.g. @ % ! #).";
  }
  return null;
}
