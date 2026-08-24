"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";

/**
 * Appointing who confirms transactions at the bank (spec 041).
 *
 * Super User only, and — unusually for this codebase — holding Super User does NOT itself let you
 * confirm. The CEO's instruction was that transactions wait for him and nobody stands in, so the
 * appointment list is the whole truth. What keeps that from being a trap is exactly this file: a
 * Super User can appoint THEMSELVES, so an empty list is a pause of one click, not a wall.
 */

const q = (s: string) => encodeURIComponent(s);
const BACK = "/admin/confirmers";

function fail(msg: string): never {
  redirect(`${BACK}?error=${q(msg)}`);
}

export async function appointConfirmer(formData: FormData): Promise<void> {
  const actor = await requireSuperUser();
  const userId = ((formData.get("userId") as string | null) ?? "").trim();
  if (!userId) fail("Choose somebody.");

  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true, name: true },
  });
  if (!person) fail("That person isn't in the employee registry.");
  if (person.status !== "ACTIVE") fail("That person is no longer active.");

  await prisma.transactionConfirmer.upsert({
    where: { userId },
    create: { userId, appointedById: actor.id },
    update: {},
  });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q(`${person.name ?? "They"} can now confirm transactions.`)}`);
}

export async function removeConfirmer(formData: FormData): Promise<void> {
  await requireSuperUser();
  const userId = ((formData.get("userId") as string | null) ?? "").trim();

  await prisma.transactionConfirmer.deleteMany({ where: { userId } });

  revalidatePath(BACK);
  redirect(`${BACK}?ok=${q("Removed. They will no longer be emailed.")}`);
}
