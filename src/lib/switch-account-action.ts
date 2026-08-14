"use server";

import { cookies } from "next/headers";
import { signOut } from "@/lib/auth";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";

/**
 * Switch to a linked account (spec 025). Signs the current session out and lands
 * on the sign-in page with the target account's email pre-filled — the person
 * enters that account's own password to complete the switch (re-authenticate
 * once per switch; no simultaneous sessions, no password-less hop). Only emails
 * of accounts already surfaced as "linked" (same Employee ID) reach here.
 */
export async function switchAccountAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  // Clear any impersonation so it can't carry across the switch.
  try {
    (await cookies()).delete(IMPERSONATE_COOKIE);
  } catch {
    /* no-op */
  }
  await signOut({ redirectTo: `/signin?email=${encodeURIComponent(email)}` });
}
