import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { readImpersonationCookie } from "@/lib/impersonation";

export const isAdmin = (role?: Role) =>
  role === "HR_ADMIN" || role === "SUPER_USER";
export const isSuperUser = (role?: Role) => role === "SUPER_USER";
/** Finance can confirm benefit-claim payments (spec 020); Super User is a superset. */
export const isFinance = (role?: Role) =>
  role === "FINANCE" || role === "SUPER_USER";

/** Salary is confidential — only a Super User may see or edit monthly salary. HR Admin cannot. */
export const canSeeSalary = (role?: Role) => isSuperUser(role);

/** Incentive Scheme access: Super User (governance) or Finance (operations — upload sheets, edit figures, download templates). */
export const canAccessIncentive = (role?: Role) => isSuperUser(role) || isFinance(role);

/** The signed-in session, or null. */
export async function getSession() {
  return auth();
}

/**
 * Require a signed-in user; redirect to /signin otherwise. Returns the EFFECTIVE
 * user — normally the real session user, but the impersonation target when a
 * Super User is "viewing as" an employee (see lib/impersonation.ts). Because
 * nearly every page/action resolves the current user through here, honoring
 * impersonation at this one point makes the whole app render and act as the
 * target. The cookie is only honored for a real Super User session and never for
 * a Super User target, so it can't be used to gain privilege.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const real = session.user;

  if (isSuperUser(real.role)) {
    const targetId = await readImpersonationCookie();
    if (targetId && targetId !== real.id) {
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, role: true, name: true, email: true, photoUrl: true },
      });
      if (target && !isSuperUser(target.role)) {
        return {
          ...real,
          id: target.id,
          role: target.role,
          name: target.name,
          email: target.email,
          image: target.photoUrl ?? null,
        };
      }
    }
  }
  return real;
}

export type ImpersonationInfo =
  | { isImpersonating: false }
  | { isImpersonating: true; targetName: string | null; targetTitle: string | null };

/**
 * Whether the current request is a Super User impersonating an employee, plus the
 * target's name/title for the banner. Mirrors the guard in `requireUser` so the
 * banner shows exactly when the effective user is the target.
 */
export async function getImpersonation(): Promise<ImpersonationInfo> {
  const session = await auth();
  const real = session?.user;
  if (!real?.id || !isSuperUser(real.role)) return { isImpersonating: false };

  const targetId = await readImpersonationCookie();
  if (!targetId || targetId === real.id) return { isImpersonating: false };

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, name: true, title: true },
  });
  if (!target || isSuperUser(target.role)) return { isImpersonating: false };
  return { isImpersonating: true, targetName: target.name, targetTitle: target.title };
}

/** Require HR Admin or Super User; redirect home otherwise. */
export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.role)) redirect("/dashboard");
  return user;
}

/** Require Super User; redirect home otherwise. */
export async function requireSuperUser() {
  const user = await requireUser();
  if (!isSuperUser(user.role)) redirect("/dashboard");
  return user;
}

/** Data request campaigns (spec 033): HR Admin, Finance, or Super User may compose and track. */
export const canManageDataRequests = (role?: Role) => isAdmin(role) || isFinance(role);

/** Require campaign-manager access (HR Admin / Finance / Super User); redirect home otherwise. */
export async function requireDataRequestManager() {
  const user = await requireUser();
  if (!canManageDataRequests(user.role)) redirect("/dashboard");
  return user;
}

/** Require Finance (or Super User); redirect home otherwise. Gates the payments queue (spec 020). */
export async function requireFinance() {
  const user = await requireUser();
  if (!isFinance(user.role)) redirect("/dashboard");
  return user;
}

/** Require Incentive-Scheme access (Super User or Finance); redirect home otherwise. */
export async function requireIncentiveAccess() {
  const user = await requireUser();
  if (!canAccessIncentive(user.role)) redirect("/dashboard");
  return user;
}

/** A "manager" is any active employee who has at least one direct report (org-chart derived). */
export async function isManager(userId: string): Promise<boolean> {
  const count = await prisma.user.count({
    where: { reportsToId: userId, status: "ACTIVE" },
  });
  return count > 0;
}
