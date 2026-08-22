import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireUser } from "@/lib/roles";

/**
 * Who may run the Learning module (spec 038 follow-up, 2026-08-22).
 *
 * THE ONE DERIVATION. Every Learning admin page, every Learning admin action, the Admin door in
 * the sidebar, and the document-serving route all ask THIS — never `isAdmin` directly and never
 * the table directly. A second reading of "may they author courses?" is how one surface ends up
 * more generous than another.
 *
 * Two ways to hold it, unioned:
 *   • HR Admin / Super User — because they hold everything;
 *   • a `LearningManager` appointment — an employee HR has put in charge of training.
 *
 * The appointment is NOT a role on the employee record. The person stays an `EMPLOYEE`, so there
 * is no new role value for Benefits, Time-Off or the salary guard to be right about — which is
 * precisely why this cannot leak into them.
 *
 * WHAT IT DOES NOT GRANT: appointing another manager. That stays `requireAdmin()`, or the role
 * would be able to hand itself out.
 */

/** Does this person hold an appointment? False for HR — use `canManageLearning` for the real question. */
export async function hasLearningAppointment(userId: string): Promise<boolean> {
  try {
    const row = await prisma.learningManager.findUnique({
      where: { userId },
      select: { id: true },
    });
    return row !== null;
  } catch {
    // Before migration 065 runs, this table does not exist. Failing to FALSE keeps the app on
    // today's behaviour (HR only) rather than breaking every admin page.
    return false;
  }
}

/** The real question: may this person run Learning? HR always; an appointee by appointment. */
export async function canManageLearning(user: { id: string; role?: Role }): Promise<boolean> {
  if (isAdmin(user.role)) return true;
  return hasLearningAppointment(user.id);
}

/**
 * Require Learning-management access; send anyone else home.
 *
 * Returns the acting user, so callers that stamp a row (`uploadedById`, `reviewedById`) have it
 * without a second lookup — the same shape `requireAdmin()` returns.
 */
export async function requireLearningManager() {
  const user = await requireUser();
  if (!(await canManageLearning(user))) redirect("/dashboard");
  return user;
}

export type LearningManagerRow = {
  id: string;
  userId: string;
  name: string;
  department: string | null;
  appointedByName: string | null;
  createdAt: Date;
};

/** The appointed managers, for the Setup page. HR is not listed here — see the file comment. */
export async function learningManagers(): Promise<LearningManagerRow[]> {
  const rows = await prisma.learningManager.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { name: true, department: true } },
      appointedBy: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.name,
    department: r.user.department,
    appointedByName: r.appointedBy?.name ?? null,
    createdAt: r.createdAt,
  }));
}
