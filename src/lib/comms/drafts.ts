import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";
import { occasionsInWindow, type PreparedOccasion } from "@/lib/comms/occasions";

/**
 * Preparing congratulation drafts (spec 039 US2).
 *
 * THE LINE THIS DOES NOT CROSS: nothing here emails an employee. It writes drafts and works out
 * whose queue they belong in. Every message that reaches a person is the result of a human
 * pressing send — the same rule spec 037 drew for the holidays job, and the reason no scheduled
 * process in this platform has ever reached the company.
 */

/** The words a draft starts with. Whoever sends it rewrites whatever they like. */
export function draftFor(o: PreparedOccasion): { subject: string; body: string } {
  const first = o.name.trim().split(/\s+/)[0] || o.name;

  if (o.kind === "WORK_ANNIVERSARY") {
    const years = o.years ?? 1;
    return {
      subject: `${years} ${years === 1 ? "year" : "years"}, ${first}`,
      body:
        `${years} ${years === 1 ? "year" : "years"} ago today you joined us. Thank you for every one of them — the work you have done and the way you have done it.\n\n` +
        `Here is to the next stretch.`,
    };
  }

  // A birthday states NO age. `years` is not even carried for one.
  return {
    subject: `Happy birthday, ${first}`,
    body:
      `Wishing you a very good one from all of us. Take the day lightly if you can.\n\n` +
      `Have a lovely day.`,
  };
}

/**
 * Whose queue a draft belongs in.
 *
 * The employee's line manager, as the org chart stands — falling back to HR when they have no
 * manager, or when the manager IS the subject. Nobody should be asked to send themselves a
 * birthday message.
 */
export async function assigneeFor(userId: string): Promise<string | null> {
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { reportsToId: true, reportsTo: { select: { id: true, status: true } } },
  });

  const manager = person?.reportsTo;
  if (manager && manager.status === "ACTIVE" && manager.id !== userId) return manager.id;

  // HR, oldest account first so it is deterministic rather than whoever the database felt like.
  const hr = await prisma.user.findFirst({
    where: { status: "ACTIVE", role: { in: ["HR_ADMIN", "SUPER_USER"] }, NOT: { id: userId } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return hr?.id ?? null;
}

export type PreparationSummary = {
  created: number;
  alreadyThere: number;
  closed: number;
  unassigned: number;
};

/**
 * Prepare every occasion in the window, and close what has passed.
 *
 * IDEMPOTENT BY CONSTRUCTION, not by checking: `Occasion` is unique on
 * (userId, kind, occasionYear), so a second run's insert is refused by the database rather than
 * relying on this function to have looked first. Run it ten times a day and nothing duplicates.
 *
 * Work is chosen BY DATE, never by "did yesterday's run happen" — a day the platform was
 * unreachable is caught by the next run rather than skipped forever.
 */
export async function prepareOccasions(today: Date, leadDays: number): Promise<PreparationSummary> {
  const to = new Date(today.getTime() + leadDays * 24 * 60 * 60 * 1000);

  const people = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, status: true, dateOfBirth: true, startDate: true },
  });

  const occasions = occasionsInWindow(people, today, to);
  const summary: PreparationSummary = { created: 0, alreadyThere: 0, closed: 0, unassigned: 0 };

  for (const o of occasions) {
    const existing = await prisma.occasion.findUnique({
      where: { userId_kind_occasionYear: { userId: o.userId, kind: o.kind, occasionYear: o.occasionYear } },
      select: { id: true },
    });
    if (existing) {
      summary.alreadyThere += 1;
      continue;
    }

    const assignedToId = await assigneeFor(o.userId);
    if (!assignedToId) {
      // Nobody to give it to — no manager and no HR. Recorded rather than silently dropped, so the
      // count on the cron's response says something happened that nobody can act on.
      summary.unassigned += 1;
      continue;
    }

    const { subject, body } = draftFor(o);

    try {
      await prisma.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: {
            kind: o.kind,
            state: "DRAFT",
            subject,
            body,
            subjectUserId: o.userId,
            assignedToId,
          },
          select: { id: true },
        });
        await tx.occasion.create({
          data: {
            userId: o.userId,
            kind: o.kind,
            occasionYear: o.occasionYear,
            occasionDate: o.occasionDate,
            years: o.years ?? null,
            messageId: message.id,
          },
        });
      });
      summary.created += 1;
    } catch {
      // The unique index refused it — another run got there first, between the check above and
      // here. That is the constraint doing its job, not an error worth surfacing.
      summary.alreadyThere += 1;
    }
  }

  summary.closed = await closePassed(today);
  return summary;
}

/**
 * Close every draft whose day has gone.
 *
 * A late birthday message is worse than silence, so an unsent draft becomes MISSED rather than
 * lingering as something somebody might still press. Stored rather than derived at read time, so
 * a late send is refused at the WRITE, not merely hidden from a list.
 */
export async function closePassed(today: Date): Promise<number> {
  const startOfToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  const passed = await prisma.occasion.findMany({
    where: { occasionDate: { lt: startOfToday }, message: { state: "DRAFT" } },
    select: { messageId: true },
  });
  const ids = passed.map((p) => p.messageId).filter((id): id is string => id !== null);
  if (ids.length === 0) return 0;

  const result = await prisma.message.updateMany({
    where: { id: { in: ids }, state: "DRAFT" },
    data: { state: "MISSED", missedAt: new Date() },
  });
  return result.count;
}

/** One person's waiting drafts — their sidebar count, and their list. */
export async function pendingForAssignee(userId: string) {
  return prisma.message.findMany({
    where: { assignedToId: userId, state: "DRAFT", kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      subject: true,
      subjectUser: { select: { name: true, businessUnit: { select: { name: true, primaryColor: true } } } },
      occasion: { select: { occasionDate: true, years: true } },
    },
  });
}

/**
 * How many of a manager's congratulations need them TODAY.
 *
 * Counts only what is inside the send window, not every draft they hold. Once messages can be
 * written months ahead, counting all of them would put a permanent "9" beside the nav entry and
 * bury the one that actually has to go out this morning — a badge that is always lit says nothing.
 */
export async function pendingCountFor(userId: string, leadDays = 3): Promise<number> {
  const today = new Date();
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const to = new Date(from.getTime() + Math.max(0, leadDays) * 86_400_000);
  try {
    return await prisma.message.count({
      where: {
        assignedToId: userId,
        state: "DRAFT",
        kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] },
        occasion: { occasionDate: { gte: from, lte: to } },
      },
    });
  } catch {
    // Before migration 067 the table does not exist. Zero keeps the shell working.
    return 0;
  }
}

/** Every waiting draft, for HR — the safety net when a manager is away. */
export async function pendingQueue() {
  return prisma.message.findMany({
    where: { state: "DRAFT", kind: { in: ["BIRTHDAY", "WORK_ANNIVERSARY"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      subject: true,
      subjectUser: { select: { name: true, businessUnit: { select: { name: true, primaryColor: true } } } },
      assignedTo: { select: { name: true } },
      occasion: { select: { occasionDate: true, years: true } },
    },
  });
}

/** HR, or the person it is assigned to. Nobody else may read or send a draft. */
export async function canActOn(
  actor: { id: string; role?: string },
  messageId: string
): Promise<boolean> {
  if (isAdmin(actor.role as never)) return true;
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { assignedToId: true },
  });
  return message?.assignedToId === actor.id;
}
