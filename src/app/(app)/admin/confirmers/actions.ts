"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";

/**
 * Appointing who confirms transactions at the bank (spec 041).
 *
 * Super User only, and — unusually for this codebase — holding Super User does NOT itself let you
 * confirm. The CEO's instruction was that transactions wait for the appointed person and nobody
 * stands in, so the appointment list is the whole truth. What keeps that from being a trap is
 * exactly this file: a Super User can appoint THEMSELVES, so an empty list is a pause of one
 * click, not a wall.
 *
 * Per BUSINESS UNIT since 2026-08-25 — every unit banks separately, so the appointment names both
 * the person and the unit. One person may hold several units; there is no row meaning "all of
 * them", so a unit created next month starts with nobody, visibly, rather than inheriting whoever
 * happened to be appointed before it existed.
 */

const q = (s: string) => encodeURIComponent(s);
const BACK = "/admin/confirmers";

function fail(msg: string): never {
  redirect(`${BACK}?error=${q(msg)}`);
}

export async function appointConfirmer(formData: FormData): Promise<void> {
  const actor = await requireSuperUser();
  const userId = ((formData.get("userId") as string | null) ?? "").trim();
  const businessUnitId = ((formData.get("businessUnitId") as string | null) ?? "").trim();
  if (!userId) fail("Choose somebody.");
  if (!businessUnitId) fail("Choose which business unit they confirm for.");

  const [person, unit] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { status: true, name: true } }),
    prisma.businessUnit.findUnique({ where: { id: businessUnitId }, select: { name: true } }),
  ]);
  if (!person) fail("That person isn't in the employee registry.");
  if (person.status !== "ACTIVE") fail("That person is no longer active.");
  if (!unit) fail("That business unit no longer exists.");

  await prisma.transactionConfirmer.upsert({
    where: { userId_businessUnitId: { userId, businessUnitId } },
    create: { userId, businessUnitId, appointedById: actor.id },
    update: {},
  });

  revalidatePath(BACK);
  redirect(
    `${BACK}?ok=${q(`${person.name ?? "They"} can now confirm ${unit.name}'s transactions.`)}`,
  );
}

export async function removeConfirmer(formData: FormData): Promise<void> {
  await requireSuperUser();
  const userId = ((formData.get("userId") as string | null) ?? "").trim();
  const businessUnitId = ((formData.get("businessUnitId") as string | null) ?? "").trim();
  if (!userId || !businessUnitId) fail("Nothing to remove.");

  // One unit at a time. Removing somebody everywhere at once would be a second, wider action
  // wearing the same button, and the wider one is the one that gets clicked by accident.
  await prisma.transactionConfirmer.deleteMany({ where: { userId, businessUnitId } });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q("Removed. They will no longer be emailed about that unit.")}`);
}

/**
 * Appointing who RELEASES payments for a business unit (spec 009 FR-006g, 2026-08-26).
 *
 * The CEO: "the business unit head is the one responsible for the release." Built as a
 * twin of the confirmer appointment above, and Super-User-only for the same reason — a
 * head appointing another head would let the appointment hand itself out, and being able
 * to appoint yourself is what keeps an empty list from being a lock-out.
 */
export async function appointUnitHead(formData: FormData): Promise<void> {
  const actor = await requireSuperUser();
  const userId = String(formData.get("userId") ?? "").trim();
  const businessUnitId = String(formData.get("businessUnitId") ?? "").trim();
  if (!userId || !businessUnitId) redirect(`${BACK}?error=${q("Pick somebody to appoint.")}`);

  const [person, unit] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, status: true } }),
    prisma.businessUnit.findUnique({ where: { id: businessUnitId }, select: { name: true } }),
  ]);
  if (!person || !unit) redirect(`${BACK}?error=${q("That person or unit no longer exists.")}`);
  if (person.status !== "ACTIVE") {
    redirect(`${BACK}?error=${q("That person is no longer active, so they could not release anything.")}`);
  }

  await prisma.businessUnitHead.upsert({
    where: { userId_businessUnitId: { userId, businessUnitId } },
    update: {},
    create: { userId, businessUnitId, appointedById: actor.id },
  });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q(`${person.name} now releases payments for ${unit.name}.`)}`);
}

export async function removeUnitHead(formData: FormData): Promise<void> {
  await requireSuperUser();
  const userId = String(formData.get("userId") ?? "").trim();
  const businessUnitId = String(formData.get("businessUnitId") ?? "").trim();
  if (!userId || !businessUnitId) redirect(BACK);

  const [person, unit] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.businessUnit.findUnique({ where: { id: businessUnitId }, select: { name: true } }),
  ]);

  await prisma.businessUnitHead.deleteMany({ where: { userId, businessUnitId } });
  revalidatePath(BACK);
  redirect(
    `${BACK}?ok=${q(`${person?.name ?? "They"} no longer releases payments for ${unit?.name ?? "that unit"}.`)}`
  );
}
