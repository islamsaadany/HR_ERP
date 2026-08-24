import { prisma } from "@/lib/prisma";
import { reachByChoice, reachedUserIds } from "@/lib/audience/reach";
import type { AudienceChoice, AudienceField } from "@/lib/audience/types";

/**
 * Reads for the Communications module.
 *
 * PLAIN FUNCTIONS, not a `"use server"` file — deliberately. Spec 038's `audienceReach` was
 * exported from an actions file with no guard, which made audience sizes enumerable by anyone who
 * knew the shape of the request. Nothing here is dangerous on its own, but "every export in that
 * file is a public POST endpoint" is exactly the property that is easy to forget. Callers do their
 * own authorisation, as they already do for every other query in this codebase.
 */

export type AudienceRow = {
  id: string;
  field: AudienceField;
  value: string;
  /** How many people THIS choice reaches today. */
  reach: number;
};

/** One message's audience, each choice with its own count. */
export async function audienceFor(messageId: string): Promise<{
  rows: AudienceRow[];
  /** DISTINCT people — never the sum of the rows, which counts anybody matched twice, twice. */
  total: number;
}> {
  const stored = await prisma.messageAudience.findMany({
    where: { messageId },
    orderBy: { createdAt: "asc" },
    select: { id: true, field: true, value: true },
  });

  const choices = stored.map((s) => ({
    id: s.id,
    field: s.field as AudienceField,
    value: s.value,
  }));

  const [counts, reached] = await Promise.all([
    reachByChoice(choices),
    reachedUserIds(choices.map(({ field, value }) => ({ field, value }))),
  ]);

  return {
    rows: choices.map((c) => ({ ...c, reach: counts.get(c.id) ?? 0 })),
    total: reached.length,
  };
}

/** What a choice should read as on screen — a department is its own name, an id is not. */
export async function labelChoices(rows: AudienceRow[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  const unitIds = rows.filter((r) => r.field === "BUSINESS_UNIT").map((r) => r.value);
  const groupIds = rows.filter((r) => r.field === "GROUP").map((r) => r.value);
  const userIds = rows
    .filter((r) => r.field === "PERSON" || r.field === "REPORTS_TO")
    .map((r) => r.value);

  const [units, groups, people] = await Promise.all([
    unitIds.length ? prisma.businessUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true } }) : [],
    groupIds.length ? prisma.learnerGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } }) : [],
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
  ]);

  units.forEach((u) => labels.set(u.id, u.name));
  groups.forEach((g) => labels.set(g.id, g.name));
  people.forEach((p) => labels.set(p.id, p.name));
  return labels;
}

/** The message list on the module's home. */
export async function recentMessages(limit = 40) {
  return prisma.message.findMany({
    where: { kind: "ANNOUNCEMENT" },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      subject: true,
      state: true,
      sentAt: true,
      recipientCount: true,
      createdAt: true,
      sentBy: { select: { name: true } },
      _count: { select: { recipients: true } },
    },
  });
}

/** Per-recipient delivery for one sent message — the answer to "did Karim get it?". */
export async function deliveriesFor(messageId: string) {
  return prisma.messageRecipient.findMany({
    where: { messageId },
    orderBy: [{ state: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      state: true,
      error: true,
      user: { select: { name: true } },
      businessUnit: { select: { name: true } },
    },
  });
}

/** How many people a set of choices would reach, for a confirmation dialog. */
export async function countFor(choices: AudienceChoice[]): Promise<number> {
  return (await reachedUserIds(choices)).length;
}
