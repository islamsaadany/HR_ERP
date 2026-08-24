import { prisma } from "@/lib/prisma";
import { getNotificationSettings } from "@/lib/notifications/settings";

/**
 * Communication settings, and the group identity every email carries (spec 039).
 *
 * There is no new settings table. The display name and the master toggle already exist on
 * `NotificationSettings` and are reused: adding a second display name would have meant two places
 * deciding who the platform sounds like, and the second one would eventually win somewhere
 * nobody was looking (research D10).
 */

export type CommsSettings = {
  /** The display name every email is sent under, e.g. "People of Forefront Group". */
  fromName: string | null;
  /** Whether sending is on at all. */
  emailEnabled: boolean;
  /** How many days ahead congratulations are prepared. */
  congratsLeadDays: number;
};

export async function getCommsSettings(): Promise<CommsSettings> {
  const s = await getNotificationSettings();
  const row = await prisma.notificationSettings
    .findUnique({ where: { id: "singleton" }, select: { congratsLeadDays: true } })
    .catch(() => null);
  return {
    fromName: s.fromName,
    emailEnabled: s.emailEnabled,
    // Before migration 067 the column does not exist; the documented default is the honest answer.
    congratsLeadDays: row?.congratsLeadDays ?? 3,
  };
}

/**
 * The group's name, as it appears in small caps above the unit on every email.
 *
 * Read from `BrandSettings.companyName` — the app-wide brand, which IS the group level. A business
 * unit's name is the LARGE line and comes from the recipient's own record; this is the constant
 * above it.
 */
export async function groupName(): Promise<string> {
  const brand = await prisma.brandSettings
    .findUnique({ where: { id: "singleton" }, select: { companyName: true } })
    .catch(() => null);
  return brand?.companyName?.trim() || "Forefront Group";
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
