import { cookies } from "next/headers";

/**
 * Admin impersonation ("View as employee").
 *
 * A Super User can view the app exactly as an employee sees it — for demos or to
 * reproduce an issue. The target's user id is held in an httpOnly cookie; the
 * REAL signed-in session (the JWT) never changes, so the actor is always
 * recoverable and can exit at any time. The effective-user resolution
 * (`requireUser`/`getImpersonation` in `lib/roles.ts`) only honors the cookie
 * when the real session is a Super User and the target is not itself a Super
 * User — so the cookie can never be used to escalate privilege.
 */
export const IMPERSONATE_COOKIE = "ff_impersonate";

/** Read the impersonation target id from the cookie (null when not set / unavailable). */
export async function readImpersonationCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    return jar.get(IMPERSONATE_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}
