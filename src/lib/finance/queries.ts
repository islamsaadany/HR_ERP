import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toPiastres } from "@/lib/finance/money";
import {
  periodReconciliation,
  accountBalance,
  type PeriodFigures,
  type FundingInput,
  type LineInput,
} from "@/lib/finance/pettycash";

/**
 * The database side of petty cash: loading rows and handing them to the pure derivation in
 * `pettycash.ts`. Nothing here does arithmetic of its own — if a figure is computed anywhere
 * but `pettycash.ts`, that is a second derivation and it will eventually disagree.
 */

/**
 * Run a write with THIS account held still.
 *
 * Petty cash has no ceiling to breach — a float is allowed to go negative, which is what
 * "amount to reimburse" means — so this lock is not the benefits pool's lock in a new costume.
 * What it protects is STATE: a line inserted while Finance is closing the period would land in
 * a closed period and silently change a balance somebody has already signed off, and two
 * "open a period" calls would race into two open periods, after which no line has an
 * unambiguous home.
 *
 * A row lock on the account gives exactly that granularity: writes on one float serialize,
 * writes on different floats never meet. (Serializable was measured on this codebase before and
 * aborted unrelated subjects' writes — see `withPoolLock`.)
 */
export async function withAccountLock<T>(
  accountId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT id FROM "PettyCashAccount" WHERE id = ${accountId} FOR UPDATE`;
      return fn(tx);
    },
    { timeout: 15000 },
  );
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * A period's figures, computed from the rows that belong to it.
 *
 * `db` lets a caller that is about to write re-read inside its own transaction — a close that
 * trusted the totals the page rendered a minute ago would freeze a figure that is no longer true.
 */
export async function periodFiguresFor(
  periodId: string,
  db: Db = prisma,
): Promise<(PeriodFigures & { periodId: string }) | null> {
  const period = await db.pettyCashPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, openingBalance: true, budget: true },
  });
  if (!period) return null;

  const [fundings, lines] = await Promise.all([
    db.pettyCashFunding.findMany({
      where: { periodId },
      select: { type: true, amount: true },
    }),
    db.pettyCashLine.findMany({
      where: { periodId },
      select: { method: true, amount: true },
    }),
  ]);

  const figures = periodReconciliation({
    openingBalance: toPiastres(period.openingBalance),
    budget: period.budget === null ? null : toPiastres(period.budget),
    fundings: fundings.map(
      (f): FundingInput => ({
        type: f.type,
        amountPiastres: toPiastres(f.amount),
      }),
    ),
    lines: lines.map(
      (l): LineInput => ({
        method: l.method,
        amountPiastres: toPiastres(l.amount),
      }),
    ),
  });
  return { ...figures, periodId };
}

/**
 * An account's balance right now, across every period it has ever had.
 *
 * Takes the FIRST period's opening balance (normally 0, non-zero only when a figure was carried
 * in by hand at go-live) and every movement since. Deliberately not "the latest period's closing
 * balance read from a column", because there is no such column — that is the point.
 */
export async function accountBalanceFor(accountId: string, db: Db = prisma): Promise<number> {
  const [first, fundings, lines] = await Promise.all([
    db.pettyCashPeriod.findFirst({
      where: { accountId },
      orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
      select: { openingBalance: true },
    }),
    db.pettyCashFunding.findMany({
      where: { accountId },
      select: { type: true, amount: true },
    }),
    db.pettyCashLine.findMany({
      where: { period: { accountId } },
      select: { method: true, amount: true },
    }),
  ]);

  return accountBalance({
    initialOpeningBalance: first ? toPiastres(first.openingBalance) : 0,
    fundings: fundings.map(
      (f): FundingInput => ({
        type: f.type,
        amountPiastres: toPiastres(f.amount),
      }),
    ),
    lines: lines.map(
      (l): LineInput => ({
        method: l.method,
        amountPiastres: toPiastres(l.amount),
      }),
    ),
  });
}

/**
 * The lines in a period that still have no receipt. Used by the close action (which refuses
 * without an acknowledgement) and by the period view (which flags them).
 */
export async function linesMissingEvidence(periodId: string, db: Db = prisma) {
  return db.pettyCashLine.findMany({
    where: { periodId, evidence: { none: {} } },
    select: { id: true, datePaid: true, description: true, amount: true },
    orderBy: { datePaid: "asc" },
  });
}

/**
 * Petty cash lines that look like they might be the same purchase as a payback request
 * (FR-022). Information for Finance at review time — never a check any write path performs,
 * because the system cannot actually know two receipts are the same purchase.
 */
export async function possibleDuplicateLines(args: {
  userId: string;
  amount: Prisma.Decimal | number | string;
  datePaid: Date;
}) {
  const from = new Date(args.datePaid);
  from.setDate(from.getDate() - 7);
  const to = new Date(args.datePaid);
  to.setDate(to.getDate() + 7);

  return prisma.pettyCashLine.findMany({
    where: {
      amount: args.amount as Prisma.Decimal,
      datePaid: { gte: from, lte: to },
      period: { account: { custodianId: args.userId } },
    },
    select: {
      id: true,
      datePaid: true,
      description: true,
      amount: true,
      period: { select: { label: true, account: { select: { name: true } } } },
    },
    take: 5,
  });
}
