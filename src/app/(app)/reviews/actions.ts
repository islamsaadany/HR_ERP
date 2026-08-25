"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { realUserForAction, isOpen, myHalf, readyToOpen } from "@/lib/reviews/access";
import { isAgendaQuestion, isStrengthsQuestion } from "@/lib/reviews/agenda";
import { isQuarter } from "@/lib/reviews/quarters";
import { isCurrentPair, sheetForRead } from "@/lib/reviews/queries";

export type ActionResult = { ok: true } | { ok: false; error: string };

const OK: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

/** "Not one of the pair" is answered as not-found — a refusal confirms it exists. */
const NOT_FOUND = "That review could not be found.";
const FROZEN =
  "This review is closed. Both halves locked when you confirmed the meeting — " +
  "what you discussed belongs in the agreed outcome.";

function refreshSheet(sheetId: string) {
  revalidatePath("/reviews");
  revalidatePath(`/reviews/${sheetId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening a sheet for a quarter
// ─────────────────────────────────────────────────────────────────────────────

const openSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
  counterpartId: z.string().min(1),
});

/**
 * Create this quarter's sheet if it does not exist.
 *
 * The pair comes from the CURRENT org chart — the only thing the live chart is
 * used for — and is then STORED. Every later read authorises against the stored
 * pair, so a change of manager cannot hand somebody the previous manager's
 * conversations.
 */
export async function openSheetForQuarter(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const parsed = openSchema.safeParse({
    year: formData.get("year"),
    quarter: formData.get("quarter"),
    counterpartId: formData.get("counterpartId"),
  });
  if (!parsed.success) return fail("That quarter is not valid.");
  const { year, quarter, counterpartId } = parsed.data;
  if (!isQuarter(quarter)) return fail("That quarter is not valid.");

  // Whichever way round the pair is, work out who is the employee.
  const iAmTheReport = await isCurrentPair(me.id, counterpartId);
  const theyAreTheReport = await isCurrentPair(counterpartId, me.id);
  if (!iAmTheReport && !theyAreTheReport) {
    return fail(
      "A review is between a manager and their direct report. You are not in that " +
        "relationship with this person right now."
    );
  }
  const employeeId = iAmTheReport ? me.id : counterpartId;
  const managerId = iAmTheReport ? counterpartId : me.id;

  await prisma.reviewSheet.upsert({
    where: { year_quarter_employeeId_managerId: { year, quarter, employeeId, managerId } },
    update: {},
    create: { year, quarter, employeeId, managerId },
  });

  revalidatePath("/reviews");
  return OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// Writing your half
// ─────────────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  sheetId: z.string().min(1),
  questionKey: z.string().min(1),
  body: z.string().trim().min(1, "Write something first.").max(2000),
});

export async function saveItem(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const parsed = itemSchema.safeParse({
    sheetId: formData.get("sheetId"),
    questionKey: formData.get("questionKey"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That answer could not be saved.");
  }
  const { sheetId, questionKey, body } = parsed.data;

  // Never trusted from the form: the question must be in the agenda registry.
  if (!isAgendaQuestion(questionKey)) return fail("That question is not on the agenda.");

  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (isOpen(sheet)) return fail(FROZEN);

  const position = await prisma.reviewSheetItem.count({
    where: { sheetId, authorId: me.id, questionKey },
  });

  await prisma.reviewSheetItem.create({
    // `authorId` is always the caller — never read from the form.
    data: { sheetId, authorId: me.id, questionKey, position, body, sourceKind: "TYPED" },
  });

  refreshSheet(sheetId);
  return OK;
}

export async function deleteItem(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return fail("That answer could not be found.");

  // Scoped by author, not fetched-then-compared.
  const item = await prisma.reviewSheetItem.findFirst({
    where: { id: itemId, authorId: me.id },
    select: { id: true, sheetId: true, sheet: { select: { openedAt: true } } },
  });
  if (!item) return fail("That answer could not be found.");
  if (isOpen(item.sheet)) return fail(FROZEN);

  await prisma.reviewSheetItem.delete({ where: { id: item.id } });
  refreshSheet(item.sheetId);
  return OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion — copies, never links
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The copy is deliberate: editing or deleting the journal entry afterwards must
 * not reach the sheet. The partial unique index makes re-promoting a no-op, so
 * this is safe to call twice.
 */
export async function promoteJournalEntry(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const sheetId = String(formData.get("sheetId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const questionKey = String(formData.get("questionKey") ?? "");
  if (!isAgendaQuestion(questionKey)) return fail("That question is not on the agenda.");

  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (isOpen(sheet)) return fail(FROZEN);

  const entry = await prisma.journalEntry.findFirst({
    where: { id: entryId, authorId: me.id },
    select: { id: true, body: true },
  });
  if (!entry) return fail("That journal note could not be found.");

  await addPromotedItem(sheetId, me.id, questionKey, entry.body, "JOURNAL", entry.id);
  refreshSheet(sheetId);
  return OK;
}

export async function promoteOneOnOneOutcome(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const sheetId = String(formData.get("sheetId") ?? "");
  const oneOnOneId = String(formData.get("oneOnOneId") ?? "");
  const questionKey = String(formData.get("questionKey") ?? "");
  if (!isAgendaQuestion(questionKey)) return fail("That question is not on the agenda.");

  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (isOpen(sheet)) return fail(FROZEN);

  // Must be the same pair as the sheet, and agreed by both.
  const record = await prisma.oneOnOne.findFirst({
    where: {
      id: oneOnOneId,
      employeeId: sheet.employeeId,
      managerId: sheet.managerId,
      finalAt: { not: null },
    },
    select: { id: true, outcome: true },
  });
  if (!record?.outcome) return fail("That 1:1 outcome could not be found.");

  await addPromotedItem(sheetId, me.id, questionKey, record.outcome, "ONE_ON_ONE", record.id);
  refreshSheet(sheetId);
  return OK;
}

async function addPromotedItem(
  sheetId: string,
  authorId: string,
  questionKey: string,
  body: string,
  sourceKind: "JOURNAL" | "ONE_ON_ONE",
  sourceId: string
) {
  const already = await prisma.reviewSheetItem.findFirst({
    where: { sheetId, authorId, questionKey, sourceKind, sourceId },
    select: { id: true },
  });
  if (already) return; // idempotent; the partial unique index is the real guard

  const position = await prisma.reviewSheetItem.count({
    where: { sheetId, authorId, questionKey },
  });
  await prisma.reviewSheetItem.create({
    data: { sheetId, authorId, questionKey, position, body, sourceKind, sourceId },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Strengths picks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stores the theme NAME as the item body, which is what makes a past answer
 * survive the employee re-taking the assessment: the sheet holds text, not a
 * pointer into a profile that can be replaced.
 */
export async function setStrengthsPicks(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const sheetId = String(formData.get("sheetId") ?? "");
  const questionKey = String(formData.get("questionKey") ?? "");
  const codes = formData.getAll("themeCode").map(String).filter(Boolean);

  if (!isStrengthsQuestion(questionKey)) {
    return fail("That question does not take strengths.");
  }

  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (isOpen(sheet)) return fail(FROZEN);

  // Only the caller's OWN themes — the picker is per person by construction.
  const mine = await prisma.strengthsProfileTheme.findMany({
    where: { profile: { employeeId: me.id }, themeCode: { in: codes } },
    include: { theme: { select: { code: true, name: true } } },
    orderBy: { rank: "asc" },
  });
  if (mine.length !== codes.length) {
    return fail("You can only choose from your own strengths.");
  }

  await prisma.$transaction([
    prisma.reviewSheetItem.deleteMany({
      where: { sheetId, authorId: me.id, questionKey, sourceKind: "STRENGTH" },
    }),
    ...mine.map((t, i) =>
      prisma.reviewSheetItem.create({
        data: {
          sheetId,
          authorId: me.id,
          questionKey,
          position: i,
          body: t.theme.name,
          sourceKind: "STRENGTH",
          sourceId: t.theme.code,
        },
      })
    ),
  ]);

  refreshSheet(sheetId);
  return OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// The seal
// ─────────────────────────────────────────────────────────────────────────────

/** Submitting says "I am ready to meet". It opens nothing. */
export async function submitHalf(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const sheetId = String(formData.get("sheetId") ?? "");
  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (isOpen(sheet)) return fail(FROZEN);

  const half = myHalf(sheet, me.id);
  if (!half) return fail(NOT_FOUND);

  const already = half === "employee" ? sheet.employeeSubmittedAt : sheet.managerSubmittedAt;
  if (already) return fail("You have already submitted this review.");

  await prisma.reviewSheet.update({
    where: { id: sheet.id },
    data:
      half === "employee"
        ? { employeeSubmittedAt: new Date() }
        : { managerSubmittedAt: new Date() },
  });

  refreshSheet(sheetId);
  return OK;
}

/**
 * Confirm the meeting happened — and, if that was the fourth of the four
 * timestamps, open the sheet.
 *
 * BOTH parties must confirm. One confirming alone would be a way to read the
 * other's half by declaring a meeting that never took place.
 *
 * `openedAt` is written HERE and nowhere else, inside a transaction that first
 * takes a row lock on the sheet. Without the lock, two simultaneous confirmations
 * could each read "the other hasn't confirmed yet", each write only their own
 * timestamp, and leave a sheet that satisfies every condition to be open but
 * never got stamped — sealed forever, with nothing in the UI to explain why.
 */
export async function confirmMeetingHeld(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const sheetId = String(formData.get("sheetId") ?? "");
  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (isOpen(sheet)) return fail("This review is already open.");

  const half = myHalf(sheet, me.id);
  if (!half) return fail(NOT_FOUND);

  if (!sheet.employeeSubmittedAt || !sheet.managerSubmittedAt) {
    return fail(
      "You both need to submit your halves before confirming the meeting. " +
        "Submitting does not show anyone your answers."
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialise the two confirmations against each other.
    await tx.$queryRaw`SELECT "id" FROM "ReviewSheet" WHERE "id" = ${sheet.id} FOR UPDATE`;

    const fresh = await tx.reviewSheet.findUnique({ where: { id: sheet.id } });
    if (!fresh || fresh.openedAt) return "already-open" as const;

    const now = new Date();
    const withMine = {
      ...fresh,
      ...(half === "employee"
        ? { employeeMetConfirmedAt: fresh.employeeMetConfirmedAt ?? now }
        : { managerMetConfirmedAt: fresh.managerMetConfirmedAt ?? now }),
    };

    await tx.reviewSheet.update({
      where: { id: sheet.id },
      data: {
        employeeMetConfirmedAt: withMine.employeeMetConfirmedAt,
        managerMetConfirmedAt: withMine.managerMetConfirmedAt,
        // The one place this is ever written.
        openedAt: readyToOpen(withMine) ? now : null,
      },
    });

    return readyToOpen(withMine) ? ("opened" as const) : ("waiting" as const);
  });

  refreshSheet(sheetId);
  return result === "already-open" ? fail("This review is already open.") : OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// The agreed outcome
// ─────────────────────────────────────────────────────────────────────────────

const outcomeSchema = z.object({
  sheetId: z.string().min(1),
  priorities: z.string().trim().max(2000),
  risks: z.string().trim().max(2000),
  successDefinition: z.string().trim().max(2000),
  employeeCommitments: z.string().trim().max(2000),
  managerCommitments: z.string().trim().max(2000),
});

export async function writeOutcome(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const parsed = outcomeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("That outcome could not be saved.");
  const { sheetId, ...fields } = parsed.data;

  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet) return fail(NOT_FOUND);
  if (!isOpen(sheet)) {
    return fail(
      "There is no outcome to write yet — you both need to confirm the meeting happened first."
    );
  }
  if (sheet.outcome?.finalAt) {
    return fail("You have both agreed this outcome, so it can no longer be changed.");
  }

  await prisma.reviewOutcome.upsert({
    where: { sheetId },
    create: { sheetId, authoredById: me.id, ...fields },
    // Any edit clears BOTH acknowledgements: nobody's agreement should stay
    // attached to text they never saw.
    update: { ...fields, employeeAckAt: null, managerAckAt: null, finalAt: null },
  });

  refreshSheet(sheetId);
  return OK;
}

export async function acknowledgeOutcome(formData: FormData): Promise<ActionResult> {
  const gate = await realUserForAction();
  if (!gate.ok) return gate;
  const me = gate.user;

  const sheetId = String(formData.get("sheetId") ?? "");
  const sheet = await sheetForRead(sheetId, me.id);
  if (!sheet?.outcome) return fail(NOT_FOUND);
  if (sheet.outcome.finalAt) return OK; // already agreed by both

  const half = myHalf(sheet, me.id);
  if (!half) return fail(NOT_FOUND);

  const now = new Date();
  const employeeAckAt =
    half === "employee" ? (sheet.outcome.employeeAckAt ?? now) : sheet.outcome.employeeAckAt;
  const managerAckAt =
    half === "manager" ? (sheet.outcome.managerAckAt ?? now) : sheet.outcome.managerAckAt;

  await prisma.reviewOutcome.update({
    where: { sheetId },
    data: {
      employeeAckAt,
      managerAckAt,
      finalAt: employeeAckAt && managerAckAt ? now : null,
    },
  });

  refreshSheet(sheetId);
  return OK;
}
