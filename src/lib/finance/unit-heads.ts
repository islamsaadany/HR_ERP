import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { isSuperUser } from "@/lib/roles";

/**
 * Who may RELEASE payments, and for WHICH business unit (spec 009 FR-006g, 2026-08-26).
 *
 * THE ONE DERIVATION — asked by the release screen, the release action, and the report's
 * "Release payments…" button alike.
 *
 * ═══ READ THIS BEFORE "FIXING" IT ═══
 * Written as a deliberate twin of `./confirmers`, and it makes the same departure from the
 * house appointment pattern: holding Super User does NOT let you release. The CEO's
 * instruction was that "the business unit head is the one responsible for the release …
 * me in case of forefront and Alaa in case of visual shift" — an implicit power held by
 * every top-level account would make the product promise a control it does not enforce.
 *
 * The lock-out that "role-holders are implicit" exists to prevent is handled the same way
 * as for confirmers: `canAppointUnitHeads` is Super User, so an empty table is a pause of
 * one click rather than a wall.
 *
 * And there is deliberately NO appointment meaning "all units". A company-wide row would
 * silently cover a unit created next month. Somebody who really does release everything
 * holds one row per unit, visibly, and loses a unit the day somebody takes that row away.
 * ════════════════════════════════════
 */

/** Every business unit this person may release for. Empty means they release nothing. */
export async function releasableUnitIds(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.businessUnitHead.findMany({
      where: { userId, user: { status: "ACTIVE" } },
      select: { businessUnitId: true },
    });
    return rows.map((r) => r.businessUnitId);
  } catch {
    // The table is absent until migration 076 lands; releasing nothing is the safe read.
    return [];
  }
}

export async function canReleaseForUnit(userId: string, businessUnitId: string): Promise<boolean> {
  return (await releasableUnitIds(userId)).includes(businessUnitId);
}

/** Does this person head anything at all? Decides whether the Release button is even drawn. */
export async function canReleaseAnything(userId: string): Promise<boolean> {
  return (await releasableUnitIds(userId)).length > 0;
}

/** The heads of one unit, for the settings screen and for naming them on the release screen. */
export async function headsForUnit(
  businessUnitId: string
): Promise<{ id: string; name: string; email: string }[]> {
  try {
    const rows = await prisma.businessUnitHead.findMany({
      where: { businessUnitId, user: { status: "ACTIVE" } },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.user);
  } catch {
    return [];
  }
}

/**
 * Only a Super User appoints. An appointed head appointing another one would let the
 * appointment hand itself out — and it is also what keeps a lock-out impossible, since a
 * Super User can appoint themselves at any moment.
 */
export const canAppointUnitHeads = (role?: Role): boolean => isSuperUser(role);
