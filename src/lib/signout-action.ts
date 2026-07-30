"use server";

import { signOut } from "@/lib/auth";

/** Server action for the sign-out forms in the app shell (client component). */
export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
