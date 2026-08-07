"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { hashPassword, generateTempPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";

export type SetPasswordState = { password?: string; error?: string } | null;

/**
 * Set or reset an employee's sign-in password (HR/Super User). If the field is
 * left blank, a temporary password is generated. The plaintext is returned ONCE
 * so the admin can hand it over — no emails in v1. It is never stored in plain.
 */
export async function setUserPassword(
  userId: string,
  _prev: SetPasswordState,
  formData: FormData
): Promise<SetPasswordState> {
  await requireAdmin();

  const typed = String(formData.get("password") ?? "").trim();
  const password = typed || generateTempPassword();
  if (typed && typed.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "Employee not found." };

  // An admin-issued password is temporary — flag the employee to set their own on next sign-in.
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password), mustChangePassword: true },
  });
  return { password };
}

export type TempPwRow = { name: string; email: string; temp: string };

export type GenPasswordsState =
  | { ok: true; mode: "missing" | "all"; rows: TempPwRow[] }
  | { ok: false; error: string }
  | null;

/**
 * Bulk-issue temporary sign-in passwords for active employees and return the
 * plaintext ONCE (for a one-time CSV the admin downloads and hands out). Each
 * affected employee is flagged `mustChangePassword`, so they must set their own
 * on next sign-in.
 *
 * - `missing` (default): only ACTIVE employees without a password yet.
 * - `all` (Super User only): every ACTIVE employee — resets anyone who already
 *   set one. The acting admin is always excluded so they can't lock themselves out.
 *
 * Passwords are stored only as scrypt hashes; the plaintext exists only in this
 * response and must never be committed or emailed carelessly.
 */
export async function generateTeamPasswords(
  _prev: GenPasswordsState,
  formData: FormData
): Promise<GenPasswordsState> {
  const actor = await requireAdmin();
  const mode = formData.get("mode") === "all" ? "all" : "missing";

  if (mode === "all" && !isSuperUser(actor.role)) {
    return { ok: false, error: "Only a Super User can reset everyone's password." };
  }

  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      id: { not: actor.id }, // never reset the person running this
      ...(mode === "missing" ? { passwordHash: null } : {}),
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  if (users.length === 0) {
    return {
      ok: false,
      error:
        mode === "missing"
          ? `Everyone active already has a password. Use "Reset ALL passwords" to re-issue.`
          : "No active employees found.",
    };
  }

  const rows: TempPwRow[] = [];
  for (const u of users) {
    const temp = generateTempPassword();
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: hashPassword(temp), mustChangePassword: true },
    });
    rows.push({ name: u.name, email: u.email, temp });
  }

  return { ok: true, mode, rows };
}
