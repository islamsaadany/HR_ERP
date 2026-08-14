"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperUser } from "@/lib/roles";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";

/**
 * Begin viewing the app as another employee. Guarded on the REAL session (via
 * `auth()`, never the effective user) so impersonation can't be chained and only
 * a Super User can start it; a Super User target is refused (no point, and keeps
 * the "never escalates" invariant simple). On success the whole app re-renders
 * as the target — see `requireUser` in `lib/roles.ts`.
 */
export async function startImpersonation(formData: FormData): Promise<void> {
  const session = await auth();
  const actor = session?.user;
  if (!actor?.id || !isSuperUser(actor.role)) redirect("/dashboard");

  const targetId = String(formData.get("targetId") ?? "").trim();
  if (!targetId) {
    redirect("/admin/impersonate?error=" + encodeURIComponent("Pick an employee to view as."));
  }
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true },
  });
  if (!target) {
    redirect("/admin/impersonate?error=" + encodeURIComponent("That employee no longer exists."));
  }
  if (target.id === actor.id) {
    redirect("/admin/impersonate?error=" + encodeURIComponent("You can't view as yourself."));
  }
  if (isSuperUser(target.role)) {
    redirect("/admin/impersonate?error=" + encodeURIComponent("You can't view as another Super User."));
  }

  const jar = await cookies();
  jar.set(IMPERSONATE_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours — a working session; also cleared by "Exit".
  });
  redirect("/dashboard");
}

/** Stop impersonating and return to the admin. Clearing the cookie is enough — the real session was never touched. */
export async function stopImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.delete(IMPERSONATE_COOKIE);
  redirect("/admin/impersonate");
}
