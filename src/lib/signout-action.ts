"use server";

import { cookies } from "next/headers";
import { signOut } from "@/lib/auth";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";

/** Server action for the sign-out forms in the app shell (client component). */
export async function signOutAction() {
  // Clear any active impersonation so it can't carry over into the next session.
  try {
    (await cookies()).delete(IMPERSONATE_COOKIE);
  } catch {
    /* no-op */
  }
  await signOut({ redirectTo: "/signin" });
}
