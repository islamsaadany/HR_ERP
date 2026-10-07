import type { EmailLog } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EMAIL_KINDS, type EmailKind } from "./kinds";

/**
 * What the record of sends says, for Admin → Notifications (2026-10-07).
 *
 * Reads `EmailLog`, which only the send functions write. Every function here answers "nothing
 * recorded" on a database that has not caught up with migration 078 rather than throwing, so the
 * page still opens — it just has no history to show yet.
 */

export type LastSend = {
  at: Date;
  outcome: EmailLog["outcome"];
  recipient: string | null;
  error: string | null;
  /** How many people the send reached for; 1 unless it was a broadcast. */
  people: number;
  /** How many of them were not sent. */
  failed: number;
};

/** The most recent send of each email — a broadcast counted as ONE send to many people. */
export async function lastSendByKind(): Promise<Partial<Record<EmailKind, LastSend>>> {
  try {
    const latest = await Promise.all(
      EMAIL_KINDS.map((kind) => prisma.emailLog.findFirst({ where: { kind }, orderBy: { createdAt: "desc" } }))
    );

    const batchIds = latest.map((r) => r?.batchId).filter((id): id is string => !!id);
    const counts = batchIds.length
      ? await prisma.emailLog.groupBy({
          by: ["batchId", "outcome"],
          where: { batchId: { in: batchIds } },
          _count: { _all: true },
        })
      : [];
    // The reason shown for a broadcast that partly failed — any one of its failures will do.
    const failures = batchIds.length
      ? await prisma.emailLog.findMany({
          where: { batchId: { in: batchIds }, outcome: { not: "SENT" } },
          distinct: ["batchId"],
          select: { batchId: true, error: true, recipient: true },
        })
      : [];

    const out: Partial<Record<EmailKind, LastSend>> = {};
    EMAIL_KINDS.forEach((kind, i) => {
      const row = latest[i];
      if (!row) return;
      if (!row.batchId) {
        out[kind] = {
          at: row.createdAt,
          outcome: row.outcome,
          recipient: row.recipient,
          error: row.error,
          people: 1,
          failed: row.outcome === "SENT" ? 0 : 1,
        };
        return;
      }
      const mine = counts.filter((c) => c.batchId === row.batchId);
      const people = mine.reduce((n, c) => n + c._count._all, 0);
      const failed = mine.filter((c) => c.outcome !== "SENT").reduce((n, c) => n + c._count._all, 0);
      const failure = failures.find((f) => f.batchId === row.batchId);
      out[kind] = {
        at: row.createdAt,
        outcome: failed === 0 ? "SENT" : failed === people ? row.outcome : "REFUSED",
        recipient: people === 1 ? row.recipient : null,
        error: failure?.error ?? null,
        people,
        failed,
      };
    });
    return out;
  } catch {
    return {};
  }
}

/** Sends in the last `days` days: how many went, and how many did not. */
export async function sendTotals(days: number): Promise<{ sent: number; notSent: number }> {
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await prisma.emailLog.groupBy({
      by: ["outcome"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const sent = rows.find((r) => r.outcome === "SENT")?._count._all ?? 0;
    const all = rows.reduce((n, r) => n + r._count._all, 0);
    return { sent, notSent: all - sent };
  } catch {
    return { sent: 0, notSent: 0 };
  }
}

/** Emails that did not go in the last `days` days: how many, and the most recent one. */
export async function recentFailures(days: number): Promise<{ count: number; latest: EmailLog | null }> {
  try {
    const where = { outcome: { not: "SENT" as const }, createdAt: { gte: new Date(Date.now() - days * 86_400_000) } };
    const [count, latest] = await Promise.all([
      prisma.emailLog.count({ where }),
      prisma.emailLog.findFirst({ where, orderBy: { createdAt: "desc" } }),
    ]);
    return { count, latest };
  } catch {
    return { count: 0, latest: null };
  }
}
