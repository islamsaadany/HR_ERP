import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { occasionsInWindow, type PreparedOccasion } from "@/lib/comms/occasions";

/**
 * Who is coming up, and what state each one is in (approved 2026-08-25).
 *
 * The look-ahead is DERIVED, not stored. `occasionsInWindow` already answers "whose birthday or
 * anniversary falls between these two dates" for any window, so a quarter of forward visibility
 * needs no new table, no scheduled job filling one in, and no list for anybody to maintain. It is
 * simply the same question asked with a wider window.
 *
 * That also settles what a draft is FOR. Drafts are not pre-created for the whole quarter — a
 * hundred rows nobody has looked at would inflate every manager's badge and bury the two that
 * actually need them today. A draft appears when the platform prepares one near the day, or when
 * somebody chooses to write early. Until then the occasion is real and the message simply does
 * not exist yet, which is exactly what the screen says.
 */

export type UpcomingState =
  /** Nobody has written it. The occasion is derived from a date on a record. */
  | "UNWRITTEN"
  /** A draft exists and the day has not arrived. Editable; not sendable yet. */
  | "WRITTEN"
  /** The day is here (or within the lead window). Somebody needs to press send. */
  | "DUE"
  | "SENT"
  | "MISSED";

export type UpcomingRow = {
  userId: string;
  name: string;
  kind: "BIRTHDAY" | "WORK_ANNIVERSARY";
  occasionYear: number;
  occasionDate: Date;
  years?: number;
  unitName: string | null;
  unitColor: string | null;
  /** The draft, once one exists. */
  messageId: string | null;
  state: UpcomingState;
  /** Who is expected to send it. Null means nobody can be found — see the note below. */
  assigneeId: string | null;
  assigneeName: string | null;
  /** Whether the person asking may act on this one. */
  mine: boolean;
};

/** UTC midnight, so day comparisons never drift on a timezone. */
function dayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * A message may be sent from `leadDays` before the day up to the day itself.
 *
 * The upper bound already existed: a missed congratulation CLOSES rather than going out late. This
 * is the lower bound, and it is the same argument pointed the other way — a birthday message three
 * weeks early is worse than one that is late, and once drafts can be written months ahead the
 * button is sitting there waiting to be pressed by mistake.
 */
export function sendWindow(occasionDate: Date, today: Date, leadDays: number): {
  opensOn: Date;
  open: boolean;
  past: boolean;
} {
  const day = dayUtc(occasionDate);
  const now = dayUtc(today);
  const opensOn = new Date(day.getTime() - Math.max(0, leadDays) * 86_400_000);
  return {
    opensOn,
    open: now.getTime() >= opensOn.getTime() && now.getTime() <= day.getTime(),
    past: now.getTime() > day.getTime(),
  };
}

/** The calendar month containing `today`, as a window. */
export function monthWindow(today: Date): { from: Date; to: Date } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 0)) };
}

/** The calendar quarter containing `today`, as a window. */
export function quarterWindow(today: Date): { from: Date; to: Date } {
  const y = today.getUTCFullYear();
  const q = Math.floor(today.getUTCMonth() / 3);
  return { from: new Date(Date.UTC(y, q * 3, 1)), to: new Date(Date.UTC(y, q * 3 + 3, 0)) };
}

type Viewer = { id: string; role?: string };

/**
 * The people this viewer may see occasions for.
 *
 * HR sees everybody. A line manager sees their own reports — the same people whose dates they can
 * already read on the team screens, so the look-ahead opens nothing to anybody who could not
 * already see it. Nobody else gets a list at all.
 */
async function subjectsFor(viewer: Viewer) {
  const where = isAdmin(viewer.role as never)
    ? { status: "ACTIVE" as const }
    : { status: "ACTIVE" as const, reportsToId: viewer.id };

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      status: true,
      dateOfBirth: true,
      startDate: true,
      businessUnit: { select: { name: true, primaryColor: true } },
    },
  });
}

export async function upcomingFor(
  viewer: Viewer,
  from: Date,
  to: Date,
  today: Date,
  leadDays: number
): Promise<UpcomingRow[]> {
  const people = await subjectsFor(viewer);
  if (people.length === 0) return [];

  const occasions = occasionsInWindow(
    people.map((p) => ({
      id: p.id,
      name: p.name ?? "Someone",
      status: p.status,
      dateOfBirth: p.dateOfBirth,
      startDate: p.startDate,
    })),
    from,
    to
  );
  if (occasions.length === 0) return [];

  // Whatever already exists for these occasions, in one query rather than one per row.
  const existing = await prisma.occasion.findMany({
    where: {
      userId: { in: occasions.map((o) => o.userId) },
      occasionYear: { in: [...new Set(occasions.map((o) => o.occasionYear))] },
    },
    select: {
      userId: true,
      kind: true,
      occasionYear: true,
      message: {
        select: {
          id: true,
          state: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
        },
      },
    },
  });

  const key = (o: { userId: string; kind: string; occasionYear: number }) =>
    `${o.userId}:${o.kind}:${o.occasionYear}`;
  const byKey = new Map(existing.map((e) => [key(e), e]));
  const unitOf = new Map(people.map((p) => [p.id, p.businessUnit]));
  const admin = isAdmin(viewer.role as never);

  const rows = occasions.map((o: PreparedOccasion): UpcomingRow => {
    const found = byKey.get(key(o));
    const message = found?.message ?? null;
    const window = sendWindow(o.occasionDate, today, leadDays);

    let state: UpcomingState;
    if (!message) state = window.past ? "MISSED" : "UNWRITTEN";
    else if (message.state === "SENT") state = "SENT";
    else if (message.state === "MISSED") state = "MISSED";
    else state = window.open ? "DUE" : window.past ? "MISSED" : "WRITTEN";

    const unit = unitOf.get(o.userId) ?? null;
    return {
      userId: o.userId,
      name: o.name,
      kind: o.kind,
      occasionYear: o.occasionYear,
      occasionDate: o.occasionDate,
      years: o.years,
      unitName: unit?.name ?? null,
      unitColor: unit?.primaryColor ?? null,
      messageId: message?.id ?? null,
      state,
      assigneeId: message?.assignedToId ?? null,
      assigneeName: message?.assignedTo?.name ?? null,
      // HR may act on anybody's — the safety net when a manager is away. A manager may act on
      // their own team's, which is every row they can see at all.
      mine: admin || !message || message.assignedToId === viewer.id,
    };
  });

  return rows.sort((a, b) => a.occasionDate.getTime() - b.occasionDate.getTime());
}

/**
 * The rows for a screen, with each written message's editable content attached.
 *
 * Both screens call this — HR's queue and a manager's own — so the only difference between them is
 * the viewer passed in. Two loaders would be two chances to disagree about who may see what.
 */
export async function boardRows(
  viewer: Viewer,
  period: "due" | "month" | "quarter",
  today: Date,
  leadDays: number
) {
  const window =
    period === "month"
      ? monthWindow(today)
      : period === "quarter"
        ? quarterWindow(today)
        : // "Due now" is the send window looking FORWARD: today, and the next `leadDays` days. It
        // was written as [today - leadDays, today], which is the window pointing backwards — a
        // birthday two days away fell outside it and the tab showed only the ones happening today.
          { from: today, to: new Date(today.getTime() + leadDays * 86_400_000) };

  const rows = await upcomingFor(viewer, window.from, window.to, today, leadDays);
  // "Due now" is everything inside the send window — INCLUDING occasions nobody has written yet.
  // Filtering on state === "DUE" hid exactly the case this screen exists to catch: a birthday
  // today that the preparation job never got to, which is the one that actually gets missed.
  const shown =
    period === "due"
      ? rows.filter((r) => {
          if (r.state === "SENT" || r.state === "MISSED") return false;
          return sendWindow(r.occasionDate, today, leadDays).open;
        })
      : rows;

  const ids = shown.map((r) => r.messageId).filter((id): id is string => Boolean(id));
  const drafts = ids.length
    ? await prisma.message.findMany({
        where: { id: { in: ids }, state: "DRAFT" },
        select: { id: true, kind: true, subject: true, body: true },
      })
    : [];
  const byId = new Map(drafts.map((d) => [d.id, d]));

  return shown.map((r) => {
    const draft = r.messageId ? byId.get(r.messageId) : null;
    const window = sendWindow(r.occasionDate, today, leadDays);
    return {
      ...r,
      draft: draft
        ? {
            id: draft.id,
            kind: draft.kind as "BIRTHDAY" | "WORK_ANNIVERSARY",
            subject: draft.subject,
            body: draft.body,
            personName: r.name,
            unitName: r.unitName,
            unitColor: r.unitColor,
            occasionDate: r.occasionDate,
            years: r.years ?? null,
            assigneeName: r.assigneeName,
            // Null once the day is close enough — the row then shows a live Send button.
            sendOpensOn: window.open || window.past ? null : window.opensOn,
          }
        : null,
    };
  });
}
