import { prisma } from "@/lib/prisma";

/**
 * The Learning module's own settings (spec 043) — today, one switch.
 *
 * ITS OWN TABLE rather than a column on `NotificationSettings`, which is the same shape and would
 * have been cheaper. That record is surfaced at Admin → Notifications, a screen a learning manager
 * cannot open, so the person this brake exists for could not reach it. Two ideas that look alike
 * still need two homes (the 2026-08-25 rule).
 *
 * There is deliberately NO cadence here. The reminder bound is a const in `deadlines.ts`.
 */

export type LearningSettingsView = {
  deadlineRemindersEnabled: boolean;
  remindersDisabledAt: Date | null;
  remindersDisabledByName: string | null;
};

/**
 * Reads the singleton, creating it if it has never existed.
 *
 * Defaults to OFF. The scheduled-email reversal must not switch itself on at deploy — turning it on
 * is somebody's deliberate act, and the row records who.
 */
export async function getLearningSettings(): Promise<LearningSettingsView> {
  const row = await prisma.learningSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: {
      deadlineRemindersEnabled: true,
      remindersDisabledAt: true,
      remindersDisabledBy: { select: { name: true } },
    },
  });
  return {
    deadlineRemindersEnabled: row.deadlineRemindersEnabled,
    remindersDisabledAt: row.remindersDisabledAt,
    remindersDisabledByName: row.remindersDisabledBy?.name ?? null,
  };
}

/**
 * Turn the chasing on or off.
 *
 * ONE write path, deliberately — the asymmetric authority (anyone who runs Learning may switch it
 * OFF, only an HR Admin may switch it back ON) is enforced by the action choosing which guard to
 * run, not by two different writes. One place to audit.
 *
 * Who switched it off, and when, is recorded: a control with no record of who moved it produces an
 * unanswerable question three months later.
 */
export async function setRemindersEnabled(enabled: boolean, actorId: string): Promise<void> {
  await prisma.learningSettings.upsert({
    where: { id: "singleton" },
    update: {
      deadlineRemindersEnabled: enabled,
      remindersDisabledById: enabled ? null : actorId,
      remindersDisabledAt: enabled ? null : new Date(),
    },
    create: {
      id: "singleton",
      deadlineRemindersEnabled: enabled,
      remindersDisabledById: enabled ? null : actorId,
      remindersDisabledAt: enabled ? null : new Date(),
    },
  });
}
