// Reads for the reviews & 1:1s module (spec 042).
//
// Every function here takes the caller's REAL id (from `requireRealUser`) and
// filters on the pair STORED on the record. None of them accepts "whose reviews
// to look at" as a parameter, because there is no such question in this module:
// you read your own, or you read nothing.

import { prisma } from "@/lib/prisma";
import { pairWhere, oneOnOnePairWhere, isPartyTo, visibleItemsWhere } from "@/lib/reviews/access";
import type { QuarterRef } from "@/lib/reviews/quarters";

const PERSON = { select: { id: true, name: true, title: true, photoUrl: true } } as const;

/** The counterpart the current org chart says I would review with, if any. */
export async function currentManagerOf(employeeId: string) {
  const me = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { reportsTo: { select: { id: true, name: true, title: true, status: true } } },
  });
  const m = me?.reportsTo;
  if (!m || m.status !== "ACTIVE") return null;
  return { id: m.id, name: m.name, title: m.title };
}

/** My active direct reports, from the current org chart. */
export async function currentReportsOf(managerId: string) {
  return prisma.user.findMany({
    where: { reportsToId: managerId, status: "ACTIVE" },
    select: { id: true, name: true, title: true, photoUrl: true },
    orderBy: { name: "asc" },
  });
}

/** Are these two in a manager↔report relationship right now? */
export async function isCurrentPair(employeeId: string, managerId: string) {
  if (employeeId === managerId) return false;
  const e = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { reportsToId: true, status: true },
  });
  return e?.status === "ACTIVE" && e.reportsToId === managerId;
}

/**
 * A sheet I am a party to, or null. The `where` filters on the stored pair, so a
 * sheet written with a previous manager is invisible to a new one — and so
 * "not one of the pair" is indistinguishable from "does not exist".
 */
export async function sheetForRead(sheetId: string, meId: string) {
  const sheet = await prisma.reviewSheet.findFirst({
    where: { id: sheetId, ...pairWhere(meId) },
    include: {
      employee: PERSON,
      manager: PERSON,
      outcome: { include: { authoredBy: { select: { id: true, name: true } } } },
    },
  });
  if (!sheet || !isPartyTo(sheet, meId)) return null;
  return sheet;
}

export type SheetForRead = NonNullable<Awaited<ReturnType<typeof sheetForRead>>>;

/**
 * The items visible to me on this sheet.
 *
 * Until the sheet opens this loads MY items only — the counterpart's rows are
 * never fetched, so there is nothing in the payload for the page to hide. That
 * is what makes "no preview, no summary, no word count, no per-question
 * completion state" true rather than merely invisible.
 */
export async function visibleItems(sheet: SheetForRead, meId: string) {
  return prisma.reviewSheetItem.findMany({
    where: visibleItemsWhere(sheet, meId),
    orderBy: [{ questionKey: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });
}

/** The pair's sheets, newest quarter first — the spine of the reviews list. */
export async function mySheets(meId: string) {
  return prisma.reviewSheet.findMany({
    where: pairWhere(meId),
    include: {
      employee: PERSON,
      manager: PERSON,
      outcome: { select: { finalAt: true } },
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });
}

export async function findSheet(ref: QuarterRef, employeeId: string, managerId: string) {
  return prisma.reviewSheet.findUnique({
    where: {
      year_quarter_employeeId_managerId: {
        year: ref.year,
        quarter: ref.quarter,
        employeeId,
        managerId,
      },
    },
  });
}

/**
 * The previous quarter's agreed outcome for the SAME pair — the carry-forward.
 * Only a finalised outcome carries: a draft one party never acknowledged is not
 * something they agreed.
 */
export async function carryForward(
  previous: QuarterRef,
  employeeId: string,
  managerId: string
) {
  const sheet = await prisma.reviewSheet.findUnique({
    where: {
      year_quarter_employeeId_managerId: {
        year: previous.year,
        quarter: previous.quarter,
        employeeId,
        managerId,
      },
    },
    select: { outcome: true },
  });
  const outcome = sheet?.outcome;
  return outcome?.finalAt ? outcome : null;
}

// ── Journal ─────────────────────────────────────────────────────────────────
// Every read is scoped to the author. There is no function here that takes
// somebody else's id, deliberately.

export async function myJournal(meId: string) {
  return prisma.journalEntry.findMany({
    where: { authorId: meId },
    orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
  });
}

/** Which of my entries are already on this sheet, so the list can say so. */
export async function promotedEntryIds(sheetId: string, meId: string) {
  const rows = await prisma.reviewSheetItem.findMany({
    where: { sheetId, authorId: meId, sourceKind: "JOURNAL" },
    select: { sourceId: true },
  });
  return new Set(rows.flatMap((r) => (r.sourceId ? [r.sourceId] : [])));
}

// ── 1:1s ────────────────────────────────────────────────────────────────────

export async function myOneOnOnes(meId: string) {
  return prisma.oneOnOne.findMany({
    where: oneOnOnePairWhere(meId),
    include: { employee: PERSON, manager: PERSON, _count: { select: { notes: true } } },
    orderBy: { heldOn: "desc" },
  });
}

export async function oneOnOneForRead(id: string, meId: string) {
  const record = await prisma.oneOnOne.findFirst({
    where: { id, ...oneOnOnePairWhere(meId) },
    include: {
      employee: PERSON,
      manager: PERSON,
      notes: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!record || !isPartyTo(record, meId)) return null;
  return record;
}

/**
 * The quarter's agreed 1:1 outcomes for a pair, offered beside the sheet. Only
 * final ones: an outcome one party never acknowledged is not something to bring
 * to a review as settled.
 */
export async function agreedOneOnOnesInWindow(
  employeeId: string,
  managerId: string,
  start: Date,
  end: Date
) {
  return prisma.oneOnOne.findMany({
    where: {
      employeeId,
      managerId,
      finalAt: { not: null },
      outcome: { not: null },
      heldOn: { gte: start, lte: end },
    },
    select: { id: true, heldOn: true, outcome: true },
    orderBy: { heldOn: "asc" },
  });
}

export async function promotedOneOnOneIds(sheetId: string, meId: string) {
  const rows = await prisma.reviewSheetItem.findMany({
    where: { sheetId, authorId: meId, sourceKind: "ONE_ON_ONE" },
    select: { sourceId: true },
  });
  return new Set(rows.flatMap((r) => (r.sourceId ? [r.sourceId] : [])));
}

// ── Strengths ───────────────────────────────────────────────────────────────

/** The caller's own themes, in rank order — what the strengths pickers offer. */
export async function myStrengths(meId: string) {
  const profile = await prisma.strengthsProfile.findUnique({
    where: { employeeId: meId },
    include: {
      themes: { include: { theme: true }, orderBy: { rank: "asc" } },
    },
  });
  return profile;
}

export async function strengthsProfileOf(employeeId: string) {
  return prisma.strengthsProfile.findUnique({
    where: { employeeId },
    include: {
      themes: { include: { theme: true }, orderBy: { rank: "asc" } },
      confirmedBy: { select: { id: true, name: true } },
    },
  });
}

export async function allThemes() {
  return prisma.strengthsTheme.findMany({ orderBy: { sortOrder: "asc" } });
}
