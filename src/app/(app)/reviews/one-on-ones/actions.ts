"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { realUserForAction, myHalf } from "@/lib/reviews/access";
import { isCurrentPair, oneOnOneForRead } from "@/lib/reviews/queries";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

const NOT_FOUND = "That 1:1 could not be found.";
const FINAL = "You have both agreed this outcome, so the record is closed.";

function refresh(id?: string) {
  revalidatePath("/reviews/one-on-ones");
  if (id) revalidatePath(`/reviews/one-on-ones/${id}`);
}

const createSchema = z.object({
  counterpartId: z.string().min(1),
  heldOn: z.coerce.date(),
});

/**
 * A 1:1 is between a manager and their direct report — checked against the
 * CURRENT org chart at creation, and then the pair is STORED. Later reads
 * authorise against the stored pair, so a change of manager neither breaks an
 * old record nor hands it to somebody new.
 */
export async function createOneOnOne(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const parsed = createSchema.safeParse({
    counterpartId: formData.get("counterpartId"),
    heldOn: formData.get("heldOn"),
  });
  if (!parsed.success) return fail("Pick a person and a date.");
  const { counterpartId, heldOn } = parsed.data;

  const iAmTheReport = await isCurrentPair(me.id, counterpartId);
  const theyAreTheReport = await isCurrentPair(counterpartId, me.id);
  if (!iAmTheReport && !theyAreTheReport) {
    return fail(
      "1:1s are between a manager and their direct report. You are not in that " +
        "relationship with this person."
    );
  }

  const record = await prisma.oneOnOne.create({
    data: {
      employeeId: iAmTheReport ? me.id : counterpartId,
      managerId: iAmTheReport ? counterpartId : me.id,
      heldOn,
      createdById: me.id,
    },
    select: { id: true },
  });

  refresh(record.id);
  return { ok: true, id: record.id };
}

export async function addOneOnOneNote(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const oneOnOneId = String(formData.get("oneOnOneId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return fail("Write a note first.");
  if (body.length > 2000) return fail("That note is too long.");

  const record = await oneOnOneForRead(oneOnOneId, me.id);
  if (!record) return fail(NOT_FOUND);
  if (record.finalAt) return fail(FINAL);

  await prisma.oneOnOneNote.create({
    data: { oneOnOneId: record.id, authorId: me.id, body },
  });

  refresh(record.id);
  return OK;
}

/**
 * Nothing is sealed in a 1:1 — both parties write freely, because the value of a
 * 1:1 is being quick. What needs both of them is the OUTCOME: it is what gets
 * carried to the quarterly review as settled, so it is not settled until both
 * say so. Editing it clears both acknowledgements.
 */
export async function writeOneOnOneOutcome(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const oneOnOneId = String(formData.get("oneOnOneId") ?? "");
  const outcome = String(formData.get("outcome") ?? "").trim();
  if (!outcome) return fail("Write the outcome first.");
  if (outcome.length > 2000) return fail("That outcome is too long.");

  const record = await oneOnOneForRead(oneOnOneId, me.id);
  if (!record) return fail(NOT_FOUND);
  if (record.finalAt) return fail(FINAL);

  await prisma.oneOnOne.update({
    where: { id: record.id },
    data: { outcome, employeeAckAt: null, managerAckAt: null, finalAt: null },
  });

  refresh(record.id);
  return OK;
}

export async function acknowledgeOneOnOne(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const oneOnOneId = String(formData.get("oneOnOneId") ?? "");
  const record = await oneOnOneForRead(oneOnOneId, me.id);
  if (!record) return fail(NOT_FOUND);
  if (!record.outcome) return fail("There is no outcome to agree to yet.");
  if (record.finalAt) return OK;

  const half = myHalf(record, me.id);
  if (!half) return fail(NOT_FOUND);

  const now = new Date();
  const employeeAckAt = half === "employee" ? (record.employeeAckAt ?? now) : record.employeeAckAt;
  const managerAckAt = half === "manager" ? (record.managerAckAt ?? now) : record.managerAckAt;

  await prisma.oneOnOne.update({
    where: { id: record.id },
    data: {
      employeeAckAt,
      managerAckAt,
      finalAt: employeeAckAt && managerAckAt ? now : null,
    },
  });

  refresh(record.id);
  return OK;
}
