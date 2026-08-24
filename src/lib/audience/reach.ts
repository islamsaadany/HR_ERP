import { prisma } from "@/lib/prisma";
import { audienceWhere, type AudienceRule } from "@/lib/audience/rules";
import { isRuleField, type AudienceChoice } from "@/lib/audience/types";
import type { AudienceKind } from "@prisma/client";

/**
 * How many people each choice reaches TODAY, counted per choice.
 *
 * A PLAIN query, deliberately not exported from a `"use server"` file. Its predecessor lived in an
 * actions file, which made it a publicly callable endpoint carrying no guard — audience sizes were
 * enumerable by anyone who knew the request shape. Callers do their own authorisation.
 *
 * COUNTED PER CHOICE, and that is the whole point. The Learning page this replaces counted
 * everyone matched by ANY rule and printed that same total beside every choice, so a nine-person
 * department and an empty business unit both read 23 — defeating the one thing the column existed
 * for. Each figure now means what it says.
 *
 * And counted THROUGH `audienceWhere`, the same derivation the real reach uses. A count written
 * separately to "look right" eventually disagrees with who actually gets the thing, and then it is
 * worse than no count at all.
 */
export async function reachByChoice(
  choices: Array<AudienceChoice & { id: string }>,
  now: Date = new Date()
): Promise<Map<string, number>> {
  const counts = await Promise.all(
    choices.map(async (choice) => {
      const count = await reachOf(choice, now);
      return [choice.id, count] as const;
    })
  );
  return new Map(counts);
}

/** One choice's reach. Zero — never everyone — when the choice is no longer usable. */
export async function reachOf(choice: AudienceChoice, now: Date = new Date()): Promise<number> {
  if (choice.field === "PERSON") {
    return prisma.user.count({ where: { id: choice.value, status: "ACTIVE" } });
  }
  if (choice.field === "GROUP") {
    return prisma.learnerGroupMember.count({
      where: { groupId: choice.value, user: { status: "ACTIVE" } },
    });
  }
  if (!isRuleField(choice.field)) return 0;

  const rule: AudienceRule = { kind: choice.field as AudienceKind, value: choice.value };
  const where = audienceWhere([rule], now);
  // `null` means the rule is not usable — a value that no longer exists. ZERO, never everyone:
  // widening a broken rule to the whole company is exactly the failure this returns null to
  // prevent, and it is the failure that would be least visible.
  return where ? prisma.user.count({ where }) : 0;
}

/**
 * The DISTINCT people a set of choices reaches — never the sum, which counts anybody matched
 * twice twice over.
 */
export async function reachedUserIds(
  choices: AudienceChoice[],
  now: Date = new Date()
): Promise<string[]> {
  const ids = new Set<string>();

  const ruleChoices = choices.filter((c) => isRuleField(c.field));
  if (ruleChoices.length > 0) {
    const rules: AudienceRule[] = ruleChoices.map((c) => ({
      kind: c.field as AudienceKind,
      value: c.value,
    }));
    const where = audienceWhere(rules, now);
    if (where) {
      const matched = await prisma.user.findMany({ where, select: { id: true } });
      matched.forEach((u) => ids.add(u.id));
    }
  }

  const groupIds = choices.filter((c) => c.field === "GROUP").map((c) => c.value);
  if (groupIds.length > 0) {
    const members = await prisma.learnerGroupMember.findMany({
      where: { groupId: { in: groupIds }, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    members.forEach((m) => ids.add(m.userId));
  }

  const personIds = choices.filter((c) => c.field === "PERSON").map((c) => c.value);
  if (personIds.length > 0) {
    // Re-checked for ACTIVE rather than trusted: a named person who has since left must not be
    // emailed because somebody chose them three weeks ago.
    const people = await prisma.user.findMany({
      where: { id: { in: personIds }, status: "ACTIVE" },
      select: { id: true },
    });
    people.forEach((u) => ids.add(u.id));
  }

  return [...ids];
}
