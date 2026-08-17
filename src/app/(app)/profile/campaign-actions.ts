"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import {
  campaignField,
  CAMPAIGN_USER_SELECT,
} from "@/lib/profile/campaign-fields";
import { parseDependantsList } from "@/lib/profile/requestable";
import type { DataRequestFieldStatus, Prisma } from "@prisma/client";

export type AnswerState = { ok?: true; error?: string } | null;

/** Round-trip a parsed value back to serialised text (matches the change-request store rule). */
function serialiseParsed(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/**
 * Record a batch of campaign answers (spec 033, US1).
 *
 * Only fields PRESENT in the form are touched — the modal includes a field only once the
 * employee engaged with it, so partial saves are natural (FR-008) and an untouched field
 * stays pending. Each answered value writes DIRECTLY to the employee's own record (the
 * aligned decision — HR asked for the data), then every PENDING state for that field across
 * the employee's open campaigns is settled at once (FR-012).
 *
 * Status is derived server-side from what the record held: empty → FILLED; unchanged →
 * CONFIRMED; changed → CORRECTED. The client never gets to claim "confirmed" for a value
 * that differs from the record.
 */
export async function answerDataRequests(
  _prev: AnswerState,
  formData: FormData
): Promise<AnswerState> {
  const me = await requireUser();

  const [user, targets] = await Promise.all([
    prisma.user.findUnique({ where: { id: me.id }, select: CAMPAIGN_USER_SELECT }),
    prisma.dataRequestTarget.findMany({
      where: { userId: me.id, campaign: { closedAt: null } },
      // ALL requested fields, not just pending: answering must be IDEMPOTENT. A row the
      // client shows as unanswered can already be settled (a refresh landed mid-save), and
      // re-confirming or re-editing it must succeed — latest answer wins — never dead-end
      // in "nothing pending" (live-testing bug, 2026-08-17).
      include: { fields: true },
    }),
  ]);
  if (!user) return { error: "Profile not found." };

  // FR-011: an employee can only ever answer fields that were actually requested FROM THEM.
  const requestedKeys = new Set(targets.flatMap((t) => t.fields.map((f) => f.field)));
  if (requestedKeys.size === 0) return { error: "There is nothing to answer here anymore." };

  const userWrites: Prisma.UserUpdateInput = {};
  const settlements: { field: string; status: DataRequestFieldStatus; value: string }[] = [];

  for (const key of requestedKeys) {
    const raw = formData.get(key);
    if (raw === null) continue; // untouched — stays pending
    const field = campaignField(key);
    if (!field) continue;

    const parsed = field.parse(String(raw));
    if (!parsed.ok) return { error: parsed.error };

    const submitted = serialiseParsed(parsed.value);
    const current = field.serialise(user);

    if (current === "" && submitted === "") continue; // an empty answer to an empty field is not an answer
    if (current !== "" && submitted === "") {
      // Clearing a value HR asked to verify would be data loss dressed as an answer.
      return { error: `${field.label}: enter a value or press Confirm — it can't be emptied here.` };
    }

    const status: DataRequestFieldStatus =
      current === "" ? "FILLED" : submitted === current ? "CONFIRMED" : "CORRECTED";

    if (key === "dependants") {
      const list = parseDependantsList(submitted);
      if (!list.ok) return { error: list.error };
      userWrites.dependants = {
        deleteMany: {},
        create: list.list.map((d) => ({
          name: d.name,
          dateOfBirth: new Date(`${d.dateOfBirth}T00:00:00.000Z`),
          kind: d.kind,
        })),
      };
    } else {
      (userWrites as Record<string, unknown>)[key] = parsed.value;
    }
    settlements.push({ field: key, status, value: submitted });
  }

  if (settlements.length === 0) {
    return { error: "Nothing was filled in, so there is nothing to save." };
  }

  const answeredAt = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: userWrites }),
    ...settlements.map((s) =>
      prisma.dataRequestFieldState.updateMany({
        // No status filter: a re-answer updates the earlier settlement (latest wins).
        where: {
          field: s.field,
          target: { userId: me.id, campaign: { closedAt: null } },
        },
        data: { status: s.status, value: s.value, answeredAt },
      })
    ),
  ]);

  revalidatePath("/profile");
  revalidatePath("/directory");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/data-requests");
  return { ok: true };
}
