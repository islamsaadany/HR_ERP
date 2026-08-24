"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { realUserForAction } from "@/lib/reviews/access";

export type ActionResult = { ok: true } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

const SECTIONS = [
  "WENT_WELL",
  "DIDNT_GO_WELL",
  "LEARNING",
  "BLOCKER",
  "EXPECTATION",
] as const;

const entrySchema = z.object({
  occurredOn: z.coerce.date(),
  section: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.enum(SECTIONS).nullable()
  ),
  body: z.string().trim().min(1, "Write what happened first.").max(2000),
});

/**
 * Every function in this file is scoped `where: { …, authorId: me.id }` — never
 * "fetch by id, then compare". A journal entry is readable and writable by its
 * author and by nobody else, ever: not a manager, not an HR Admin, not a Super
 * User, and not a Super User viewing as the author (the module refuses to run
 * under impersonation at all — see lib/reviews/access.ts).
 */
export async function addJournalEntry(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const parsed = entrySchema.safeParse({
    occurredOn: formData.get("occurredOn"),
    section: formData.get("section"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That note could not be saved.");
  }

  await prisma.journalEntry.create({
    data: { authorId: me.id, ...parsed.data },
  });

  revalidatePath("/reviews/journal");
  return OK;
}

export async function editJournalEntry(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const id = String(formData.get("entryId") ?? "");
  const parsed = entrySchema.safeParse({
    occurredOn: formData.get("occurredOn"),
    section: formData.get("section"),
    body: formData.get("body"),
  });
  if (!id || !parsed.success) {
    return fail(parsed.success ? "That note could not be found." : "That note could not be saved.");
  }

  const result = await prisma.journalEntry.updateMany({
    where: { id, authorId: me.id },
    data: parsed.data,
  });
  if (result.count === 0) return fail("That note could not be found.");

  revalidatePath("/reviews/journal");
  return OK;
}

/**
 * Deleting a note does NOT touch anything already promoted onto a review sheet.
 * The sheet holds a copy, deliberately — what you chose to bring to a review is
 * yours to keep or cut there, not something a later tidy-up can rewrite.
 */
export async function deleteJournalEntry(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const id = String(formData.get("entryId") ?? "");
  if (!id) return fail("That note could not be found.");

  const result = await prisma.journalEntry.deleteMany({ where: { id, authorId: me.id } });
  if (result.count === 0) return fail("That note could not be found.");

  revalidatePath("/reviews/journal");
  return OK;
}
