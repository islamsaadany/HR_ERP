"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMPERSONATE_COOKIE } from "@/lib/impersonation";
import { isLinked, mintTicket } from "@/lib/switch-account";

/**
 * Switch to a linked account (spec 026, superseding spec 025's password prompt).
 *
 * A person holding two contracts moves between their own accounts in one click,
 * with no password. The session they already hold is what authorises it: this
 * action verifies the live session and re-checks the Employee ID link, then
 * hands a short-lived signed ticket to the `switch-account` provider — which
 * verifies the link AGAIN from stored records before issuing a session.
 *
 * The target email arriving from the form is untrusted. It is only ever used to
 * LOOK UP a record; the decision is made from the stored rows.
 *
 * Any failure leaves the current session untouched, and refusals are
 * deliberately indistinguishable so this can't be used to probe which accounts
 * exist (FR-004).
 */
export async function switchAccountAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  // Clear any impersonation FIRST, so no ordering lets a borrowed "View as
  // employee" view survive into the account being switched to (FR-006).
  try {
    (await cookies()).delete(IMPERSONATE_COOKIE);
  } catch {
    /* no-op */
  }

  if (!email) return;

  const session = await auth();
  const actorId = session?.user?.id;
  // No valid session: nothing to switch from — sign in as normal.
  if (!actorId) redirect("/signin");

  let ticket: string | null = null;
  try {
    const [actor, target] = await Promise.all([
      prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, employeeId: true, status: true },
      }),
      prisma.user.findUnique({
        where: { email },
        select: { id: true, employeeId: true, status: true },
      }),
    ]);

    // Already in that account — a silent no-op, never an error in their face.
    if (target && target.id === actorId) return;
    if (!isLinked(actor, target)) return;

    ticket = mintTicket(actor!.id, target!.id);
  } catch {
    // Un-migrated or unreachable database: refuse rather than proceed.
    return;
  }

  if (!ticket) return;

  // Issues the target's session. `signIn` redirects, which throws internally —
  // it must not sit inside the try/catch above.
  await signIn("switch-account", { ticket, redirectTo: "/dashboard" });
}
