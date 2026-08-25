import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { isSuperUser } from "@/lib/roles";

/**
 * Who may confirm a transaction, and for WHICH business unit (spec 041, amended 2026-08-25).
 *
 * THE ONE DERIVATION — asked by the pages, the actions, the email recipient list, the sidebar door
 * and the daily reminder alike.
 *
 * ═══ READ THIS BEFORE "FIXING" IT ═══
 * Unlike `canManageLearning`, this does NOT union in the role-holders. Holding HR Admin or Super
 * User does not let you confirm a transfer. That looks inconsistent with the house pattern and it
 * is deliberate: the CEO's instruction was that payments wait for the appointed person and nobody
 * else stands in. An implicit power held by every top-level account would make the product promise
 * a control it does not enforce — worse than having no control at all.
 *
 * The lock-out that the "role-holders are implicit" pattern exists to prevent is handled instead
 * by `canAppointConfirmers`: a Super User can appoint THEMSELVES at any moment, so an empty table
 * is a pause of one click, never a wall.
 * ════════════════════════════════════
 *
 * ═══ AND THE UNIT HALF, ADDED 2026-08-25 ═══
 * The CEO: "we need it by business unit. as every business unit might have an account to confirm
 * and accordingly different people." So the appointment is per (person, unit), and every question
 * below is asked about a unit rather than about the company.
 *
 * There is deliberately NO appointment meaning "all units". A company-wide row would silently
 * cover a unit created next month — the same implicit-authority problem the appointment pattern
 * exists to avoid, one level up. Somebody who really does confirm everything holds one row per
 * unit, visibly, and loses a unit the day somebody takes that row away.
 * ══════════════════════════════════════════
 */

/** Every business unit this person may confirm for. Empty means they confirm nothing. */
export async function confirmableUnitIds(userId: string): Promise<string[]> {
  try {
    const rows = await prisma.transactionConfirmer.findMany({
      where: { userId, user: { status: "ACTIVE" } },
      select: { businessUnitId: true },
    });
    return rows.map((r) => r.businessUnitId);
  } catch {
    // Pre-migration database (no table, or no column yet) → nobody confirms, and nothing throws.
    return [];
  }
}

/**
 * May this person confirm this unit's transactions?
 *
 * Note what is NOT here: no "or they're a Super User". Being able to see the screen is not being
 * able to decide — `canDecide` in ./batches.ts carries the single documented exception, where the
 * record then shows the same person on both halves.
 */
export async function canConfirmUnit(userId: string, businessUnitId: string): Promise<boolean> {
  const units = await confirmableUnitIds(userId);
  return units.includes(businessUnitId);
}

/** Do they confirm for ANY unit? The sidebar door and the page guards ask this. */
export async function canConfirmAnything(userId: string): Promise<boolean> {
  return (await confirmableUnitIds(userId)).length > 0;
}

/**
 * Who to email about one unit's transactions: appointed for THAT unit, and still here.
 *
 * Someone who has left the company stops being emailed without anyone having to remember to
 * remove the row.
 */
export async function confirmersForUnit(
  businessUnitId: string,
): Promise<{ id: string; name: string | null; email: string }[]> {
  try {
    const rows = await prisma.transactionConfirmer.findMany({
      where: { businessUnitId, user: { status: "ACTIVE" } },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.user);
  } catch {
    return [];
  }
}

/** Only a Super User appoints — an appointed confirmer handing out the appointment would let it
 *  hand itself out. Self-appointment is allowed on purpose: it is the recovery path. */
export const canAppointConfirmers = (role?: Role): boolean => isSuperUser(role);

/**
 * Which units currently have somebody who can confirm for them.
 *
 * Finance's screen asks this so it can say plainly, per unit, that nothing can be sent — rather
 * than queueing a submission into silence. A unit with money waiting and nobody appointed is a
 * refusal with a sentence, which is what the CEO chose over falling back to anyone else.
 */
export async function unitsWithConfirmers(): Promise<Set<string>> {
  try {
    const rows = await prisma.transactionConfirmer.findMany({
      where: { user: { status: "ACTIVE" } },
      select: { businessUnitId: true },
      distinct: ["businessUnitId"],
    });
    return new Set(rows.map((r) => r.businessUnitId));
  } catch {
    return new Set();
  }
}
