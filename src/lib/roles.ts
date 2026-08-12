import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

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

/** Require a signed-in user; redirect to /signin otherwise. Returns the session user. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user;
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
