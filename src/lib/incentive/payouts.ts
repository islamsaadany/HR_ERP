/**
 * Incentive Scheme — turning a cycle's computed figures into releasable payments
 * (spec 009 FR-006g, 2026-08-26).
 *
 * A cycle works out what each person earned; this is the one place that decides who that
 * person actually IS, whose bank account pays them, and whether the money has already
 * gone. Everything the release screen and the release action need comes from here, so the
 * screen cannot offer something the server would refuse.
 *
 * ═══ WHO IS PAID ═══
 * Matched on **Employee ID**, at the CEO's instruction ("it should be not only by names it
 * should be by employee ID"). The name is only the CROSS-CHECK. `User.employeeId` is
 * HR-managed, optional, and deliberately NOT unique — one person on two contracts is two
 * accounts sharing an ID — so a line is releasable only when the ID lands on exactly one
 * active account. Every other outcome is REFUSED and named, never guessed: guessing who
 * somebody is means guessing whose bank account the money leaves from.
 * ═══════════════════
 */
import { prisma } from "@/lib/prisma";
import type { IncentivePayoutKind } from "@prisma/client";
import type { CycleReport } from "./compute";

/** Why a line cannot be released. Each is a different thing for the operator to go and fix. */
export type BlockedReason =
  | "NO_EMPLOYEE_ID" // the People sheet has no Employee ID for this person
  | "NO_SUCH_EMPLOYEE" // no active account carries that Employee ID
  | "AMBIGUOUS" // two or more accounts carry it (one person, two contracts)
  | "NO_BUSINESS_UNIT"; // matched, but the account has no unit, so no account pays

export type PayoutLine = {
  /** Stable across a re-render: the person's sheet name plus which half of the scheme. */
  key: string;
  personName: string;
  employeeId: string | null;
  kind: IncentivePayoutKind;
  amount: number;

  /** Set only when the Employee ID landed on exactly one active account. */
  userId: string | null;
  matchedName: string | null;
  businessUnitId: string | null;
  businessUnitName: string | null;

  /** Null when releasable. */
  blocked: BlockedReason | null;
  /** Candidate accounts, so an AMBIGUOUS line can name them rather than say "two". */
  candidates: { id: string; name: string; businessUnitName: string | null }[];

  /** Already released: the amount that went, and whether it has been paid at the bank. */
  released: { amount: number; at: Date; confirmed: boolean } | null;
  /**
   * True when the ID matches one person but their registry name differs from the sheet.
   * Releasable — but held on screen and shown, because a mistyped ID that happens to
   * belong to a real colleague is exactly the mistake nothing else would catch.
   */
  nameMismatch: boolean;
};

const money = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Every line a cycle could pay, releasable or not, with the reason attached.
 *
 * Built from the SAME derivations the report prints — `businessPartnerFeeByPerson` and
 * `commissionByPerson` — so a figure on the release screen and a figure on the report can
 * never disagree.
 */
export async function payoutLines(cycleId: string, report: CycleReport): Promise<PayoutLine[]> {
  const [people, payouts] = await Promise.all([
    prisma.incentivePerson.findMany({
      where: { cycleId },
      select: { name: true, employeeId: true },
    }),
    prisma.incentivePayout.findMany({
      where: { cycleId },
      select: {
        userId: true,
        kind: true,
        amount: true,
        releasedAt: true,
        batchItems: { select: { batch: { select: { status: true } } } },
      },
    }),
  ]);

  const sheetIdByName = new Map(people.map((p) => [norm(p.name), (p.employeeId ?? "").trim()]));

  // Every Employee ID the sheet mentions, resolved in one query. Inactive accounts are
  // excluded here rather than filtered later: paying somebody who has left is a decision,
  // not a default.
  const wantedIds = [...new Set([...sheetIdByName.values()].filter(Boolean))];
  const candidates = wantedIds.length
    ? await prisma.user.findMany({
        where: { employeeId: { in: wantedIds }, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          employeeId: true,
          businessUnit: { select: { id: true, name: true } },
        },
      })
    : [];
  const byEmployeeId = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const k = (c.employeeId ?? "").trim();
    byEmployeeId.set(k, [...(byEmployeeId.get(k) ?? []), c]);
  }

  const releasedFor = new Map(
    payouts.map((p) => [
      `${p.userId}|${p.kind}`,
      {
        amount: Number(p.amount),
        at: p.releasedAt,
        // "Paid" means the transaction was confirmed at the bank — nothing earlier.
        // COMPLETE is that state; SUBMITTED is still only waiting, and RETURNED/WITHDRAWN
        // release their items back to the queue.
        confirmed: p.batchItems.some((i) => i.batch.status === "COMPLETE"),
      },
    ])
  );

  const build = (personName: string, kind: IncentivePayoutKind, amount: number): PayoutLine => {
    const employeeId = sheetIdByName.get(norm(personName)) || null;
    const found = employeeId ? byEmployeeId.get(employeeId) ?? [] : [];
    const one = found.length === 1 ? found[0] : null;

    let blocked: BlockedReason | null = null;
    if (!employeeId) blocked = "NO_EMPLOYEE_ID";
    else if (found.length === 0) blocked = "NO_SUCH_EMPLOYEE";
    else if (found.length > 1) blocked = "AMBIGUOUS";
    else if (!one?.businessUnit) blocked = "NO_BUSINESS_UNIT";

    return {
      key: `${personName}|${kind}`,
      personName,
      employeeId,
      kind,
      amount: money(amount),
      userId: one?.id ?? null,
      matchedName: one?.name ?? null,
      businessUnitId: one?.businessUnit?.id ?? null,
      businessUnitName: one?.businessUnit?.name ?? null,
      blocked,
      candidates: found.map((c) => ({ id: c.id, name: c.name, businessUnitName: c.businessUnit?.name ?? null })),
      released: one ? releasedFor.get(`${one.id}|${kind}`) ?? null : null,
      nameMismatch: one != null && norm(one.name) !== norm(personName),
    };
  };

  const lines: PayoutLine[] = [];
  for (const p of report.businessPartnerFeeByPerson) {
    if (p.amount > 0) lines.push(build(p.name, "SCHEME_FEES", p.amount));
  }
  for (const c of report.commissionByPerson) {
    if (c.amount > 0) lines.push(build(c.name, "COMMISSION", c.amount));
  }
  return lines;
}

/** A line can be released when it matched cleanly and has not been released already. */
export const isReleasable = (l: PayoutLine): boolean => l.blocked === null && l.released === null;

/**
 * What an edit to the cycle would break: any figure that has ALREADY been released and no
 * longer matches what the engine now says. Recalculate is refused on these, naming the
 * person — that money has gone, and the report has to keep agreeing with the bank.
 *
 * Pure, so the caller can compute a PROSPECTIVE report from unsaved rows and ask this
 * before writing anything.
 */
export function releasedFiguresBroken(
  lines: PayoutLine[]
): { personName: string; kind: IncentivePayoutKind; was: number; now: number }[] {
  return lines
    .filter((l) => l.released != null && Math.abs(l.released.amount - l.amount) >= 0.005)
    .map((l) => ({ personName: l.personName, kind: l.kind, was: l.released!.amount, now: l.amount }));
}

/** What the operator sees a half of the scheme called, everywhere. */
export const KIND_LABEL: Record<IncentivePayoutKind, string> = {
  SCHEME_FEES: "Business Partner Fee",
  COMMISSION: "Commission",
};
