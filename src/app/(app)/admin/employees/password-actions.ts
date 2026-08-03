"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
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

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hashPassword(password) } });
  return { password };
}
