"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";

export type ChangePasswordState = { ok?: boolean; error?: string } | null;

/**
 * Change my own sign-in password. If a password is already set, the current one
 * must be supplied and verified; a Google-only user (no password yet) can set
 * one without a current password.
 */
export async function changeMyPassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const me = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "").trim();

  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: { passwordHash: true },
  });
  if (dbUser?.passwordHash && !verifyPassword(current, dbUser.passwordHash)) {
    return { error: "Your current password is incorrect." };
  }

  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: hashPassword(next) } });
  return { ok: true };
}
