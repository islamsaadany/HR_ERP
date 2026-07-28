"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { tracksForUser } from "@/lib/onboarding";

/** Toggle a self-attested acknowledgement/completion for the signed-in joiner. */
export async function toggleActivity(
  activityId: string,
  done: boolean
): Promise<{ ok: boolean }> {
  const me = await requireUser();

  // The activity must be active and belong to a track this user is assigned.
  const activity = await prisma.onboardingActivity.findUnique({
    where: { id: activityId },
    select: { id: true, track: true, active: true },
  });
  if (!activity || !activity.active) return { ok: false };

  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: { department: true },
  });
  const allowed = tracksForUser({ department: dbUser?.department ?? null });
  if (!allowed.includes(activity.track)) return { ok: false };

  if (done) {
    await prisma.activityCompletion.upsert({
      where: { userId_activityId: { userId: me.id, activityId } },
      create: { userId: me.id, activityId },
      update: {},
    });
  } else {
    await prisma.activityCompletion.deleteMany({
      where: { userId: me.id, activityId },
    });
  }

  revalidatePath("/onboarding");
  revalidatePath("/dashboard");
  return { ok: true };
}
