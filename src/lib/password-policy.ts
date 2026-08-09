/**
 * Password policy — the single source of truth for the sign-in password rules,
 * shared by the server (validation) and the client (live requirement checklist).
 *
 * This module is intentionally free of Node built-ins (no `node:crypto`) so it
 * can be imported into client components. Hashing stays in `password.ts`.
 */

/** Shared minimum length for a user-chosen sign-in password. */
export const MIN_PASSWORD_LENGTH = 8;

/** Human-readable summary of the password policy, for UI hints / error banners. */
export const PASSWORD_POLICY_HINT =
  `At least ${MIN_PASSWORD_LENGTH} characters, including an uppercase letter, a number, and a special character (e.g. @ % ! #).`;

export type PasswordRule = { id: string; label: string; test: (p: string) => boolean };

/** The rules, in display order — drives both the live checklist and validation. */
export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { id: "number", label: "A number", test: (p) => /[0-9]/.test(p) },
  { id: "special", label: "A special character (e.g. @ % ! #)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/** True when the password satisfies every rule. */
export function passwordMeetsPolicy(password: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(password));
}

/**
 * Validate a user-chosen password against the house policy. Returns an error
 * message, or null when it passes. Admin-issued temporary passwords are NOT run
 * through this — they exist only to force a compliant change on first sign-in.
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
