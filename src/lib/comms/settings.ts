import { prisma } from "@/lib/prisma";
import { getNotificationSettings } from "@/lib/notifications/settings";

/**
 * Communication settings, and the group identity every email carries (spec 039).
 *
 * There is no new settings table. The display name and the master toggle already exist on
 * `NotificationSettings` and are reused: adding a second display name would have meant two places
 * deciding who the platform sounds like, and the second one would eventually win somewhere
 * nobody was looking (research D10).
 *
 * The GROUP name is the exception, and it is the opposite lesson (2026-08-25). It borrowed
 * `BrandSettings.companyName` — the platform's own name — on the same "don't invent a second
 * field" instinct, and that was wrong: the two are different ideas that merely share a shape. The
 * header read "Forefront Consulting" when it had been agreed as "Forefront Group", and the only
 * way to fix it was to rename the whole application. Reuse a field when it is the same fact;
 * add one when it is a different fact that happens to look alike.
 */

export type CommsSettings = {
  /** The display name every email is sent under, e.g. "People of Forefront Group". */
  fromName: string | null;
  /** The umbrella name in small caps above the unit, e.g. "Forefront Group". */
  groupName: string;
  /** Whether sending is on at all. */
  emailEnabled: boolean;
  /** How many days ahead congratulations are prepared. */
  congratsLeadDays: number;
};

/** The name shown when nobody has set one. Named once so the fallback cannot drift. */
export const DEFAULT_GROUP_NAME = "Forefront Group";

export async function getCommsSettings(): Promise<CommsSettings> {
  const s = await getNotificationSettings();
  const row = await prisma.notificationSettings
    .findUnique({ where: { id: "singleton" }, select: { congratsLeadDays: true, groupName: true } })
    .catch(() => null);
  return {
    fromName: s.fromName,
    groupName: row?.groupName?.trim() || DEFAULT_GROUP_NAME,
    emailEnabled: s.emailEnabled,
    // Before migrations 067 / 074 these columns do not exist; the documented defaults are the
    // honest answer rather than an error on a database that has not caught up yet.
    congratsLeadDays: row?.congratsLeadDays ?? 3,
  };
}

/**
 * The group's name, as it appears in small caps above the unit on every email.
 *
 * Its OWN setting. It read `BrandSettings.companyName` until 2026-08-25 on the reasoning that the
 * app-wide brand IS the group level — which is wrong: that column names the platform ("Forefront
 * Consulting"), and the group above the units is "Forefront Group". A business unit's name is the
 * LARGE line and comes from the recipient's own record; this is the constant above it.
 */
export async function groupName(): Promise<string> {
  const row = await prisma.notificationSettings
    .findUnique({ where: { id: "singleton" }, select: { groupName: true } })
    .catch(() => null);
  return row?.groupName?.trim() || DEFAULT_GROUP_NAME;
}

/**
 * What one person's copy should be branded with.
 *
 * Null unit is not an error — plenty of people have no business unit set, and the renderer has a
 * defined answer for them (the message type in place of a unit name, and the group's own colour).
 */
export type RecipientBrand = {
  userId: string;
  name: string;
  email: string;
  unit: { id: string; name: string; primaryColor: string } | null;
};

export async function brandForRecipients(userIds: string[]): Promise<RecipientBrand[]> {
  if (userIds.length === 0) return [];
  const people = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      name: true,
      email: true,
      businessUnit: { select: { id: true, name: true, primaryColor: true } },
    },
    orderBy: { name: "asc" },
  });
  return people.map((p) => ({
    userId: p.id,
    name: p.name,
    email: p.email,
    unit: p.businessUnit
      ? { id: p.businessUnit.id, name: p.businessUnit.name, primaryColor: p.businessUnit.primaryColor }
      : null,
  }));
}
