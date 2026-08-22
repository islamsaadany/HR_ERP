"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAdmin, requireAdmin } from "@/lib/roles";

/**
 * Appointing and removing learning managers (spec 038 follow-up, 2026-08-22).
 *
 * `requireAdmin()`, NOT `requireLearningManager()`, and that is the whole point: a learning
 * manager who could appoint another one could hand the role out, and the appointment would stop
 * meaning what HR decided it means. Only an HR Admin or Super User writes these rows.
 */

export type SettingsResult = { ok: true } | { ok: false; error: string };

export async function appointLearningManager(userId: string): Promise<SettingsResult> {
  const admin = await requireAdmin();
  if (!userId) return { ok: false, error: "Choose someone to appoint." };

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, name: true },
  });
  if (!person) return { ok: false, error: "That employee no longer exists." };
  if (person.status !== "ACTIVE") {
    return { ok: false, error: `${person.name} has left — only active employees can be appointed.` };
  }
  if (isAdmin(person.role)) {
    // Refused rather than silently written: an HR Admin already holds Learning, and a row saying
    // otherwise would imply removing it could take Learning away from them. It cannot.
    return {
      ok: false,
      error: `${person.name} already runs Learning as an HR Admin — no appointment needed.`,
    };
  }

  // Appointing twice is a no-op, not a duplicate row or an error in the operator's face.
  await prisma.learningManager.upsert({
    where: { userId },
    create: { userId, appointedById: admin.id },
    update: {},
  });

  revalidatePath("/admin/learning/settings");
  revalidatePath("/admin/learning");
  revalidatePath("/admin");
  return { ok: true };
}

export async function removeLearningManager(userId: string): Promise<SettingsResult> {
  await requireAdmin();
  const existing = await prisma.learningManager.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "That appointment has already been removed." };

  await prisma.learningManager.delete({ where: { userId } });

  revalidatePath("/admin/learning/settings");
  revalidatePath("/admin/learning");
  revalidatePath("/admin");
  return { ok: true };
}
