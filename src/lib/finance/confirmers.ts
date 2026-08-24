import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { isSuperUser } from "@/lib/roles";

/**
 * Who may confirm a batch (spec 040).
 *
 * THE ONE DERIVATION — asked by the pages, the actions, the email recipient list, the sidebar door
 * and the daily reminder alike.
 *
 * ═══ READ THIS BEFORE "FIXING" IT ═══
 * Unlike `canManageLearning`, this does NOT union in the role-holders. Holding HR Admin or Super
 * User does not let you confirm a transfer. That looks inconsistent with the house pattern and it
 * is deliberate: the CEO's instruction was that payments wait for him and nobody else stands in.
 * An implicit power held by every top-level account would make the product promise a control it
 * does not enforce — worse than having no control at all.
 *
 * The lock-out that the "role-holders are implicit" pattern exists to prevent is handled instead
 * by `canAppointConfirmers`: a Super User can appoint THEMSELVES at any moment, so an empty table
 * is a pause of one click, never a wall.
 * ════════════════════════════════════
 */

/** May this specific person confirm batches? Appointment only. */
export async function canConfirmBatches(userId: string): Promise<boolean> {
  try {
    const row = await prisma.transactionConfirmer.findUnique({
      where: { userId },
      select: { user: { select: { status: true } } },
    });
    // Someone who has left the company stops confirming, without anyone having to remember to
    // remove the row.
    return !!row && row.user.status === "ACTIVE";
  } catch {
    // Pre-migration database (no table yet) → nobody can confirm, and nothing throws.
    return false;
  }
}

/** Everyone who should receive the emails: appointed, and still here. */
export async function eligibleConfirmers(): Promise<
  { id: string; name: string | null; email: string }[]
> {
  try {
    const rows = await prisma.transactionConfirmer.findMany({
      where: { user: { status: "ACTIVE" } },
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
 * Whether anybody at all can confirm right now.
 *
 * Finance's screen uses this to say so plainly rather than queueing batches into silence: a batch
 * nobody is appointed to confirm still records what went to the bank, but nothing will move it on.
 */
export async function hasAnyConfirmer(): Promise<boolean> {
  return (await eligibleConfirmers()).length > 0;
}
