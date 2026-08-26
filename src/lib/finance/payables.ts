import { prisma } from "@/lib/prisma";
import { toPiastres, sumPiastres } from "@/lib/finance/money";
import { unitsWithConfirmers } from "@/lib/finance/confirmers";

/**
 * What Finance can put into a submission (spec 041).
 *
 * Three kinds of payable, one shape. Each is money the company owes that Finance has created a
 * bank transaction for:
 *   • an approved payback request — somebody paid out of their own pocket,
 *   • a petty cash top-up — money going out to a float holder,
 *   • an approved benefit claim awaiting reimbursement (added at the CEO's note, 2026-08-24:
 *     the employee is told when HE confirms at the bank, not when Finance records a transfer),
 *   • a released incentive payment (2026-08-26) — the CEO: "the finance should see the release
 *     of amounts in the same place not to confuse him, he always sees the amounts to release in
 *     1 place coming from the different areas". So it joins this list rather than getting a
 *     screen of its own; nothing about Finance's job changes.
 *
 * "Available" means: in the right state, and not already awaiting confirmation in a live
 * submission. Membership lives in `PaymentBatchItem`, so the second half is a simple absence check
 * — and the unique indexes behind it make a double-submit impossible even if two people try at
 * once.
 *
 * EACH PAYABLE CARRIES ITS BUSINESS UNIT (2026-08-25), because each unit banks separately and a
 * submission corresponds to one transaction in one account. The unit is DERIVED from the person
 * being paid — the CEO's choice of three offered — so nobody types it and it cannot be got wrong:
 *
 *   • a payback and a benefit claim belong to an employee, so they take that employee's unit;
 *   • an incentive payout carries the unit it was RELEASED against — frozen at release rather
 *     than re-derived, because that is the account the money was released from and a later
 *     transfer between units must not silently move where it is paid;
 *   • a float top-up is paid to the custodian holding the float, so it takes the custodian's.
 *
 * Somebody with no business unit yields a payable with `businessUnitId: null`. That is not a
 * fallback to anywhere — the screen groups them under "No business unit" and cannot send them,
 * the same refusal as a unit with nobody appointed. Guessing a unit here would mean guessing a
 * bank account.
 */

export type PayableKind = "PAYBACK" | "FLOAT_TOPUP" | "BENEFIT_CLAIM" | "INCENTIVE_PAYOUT";

export type Payable = {
  kind: PayableKind;
  /** The source record's id — carried on the submission item as the matching foreign key. */
  id: string;
  payeeName: string;
  purpose: string;
  amountPiastres: number;
  /** Display-formatted date the payable arose, for the selection screen. */
  since: Date;
  /** Whose account pays this. Null when the person being paid has no business unit set. */
  businessUnitId: string | null;
  businessUnitName: string | null;
};

/** One unit's worth of what is waiting — the shape Finance's screen is built from. */
export type PayableGroup = {
  /** Null is the "No business unit" group: real payables that cannot be sent anywhere yet. */
  businessUnitId: string | null;
  businessUnitName: string;
  payables: Payable[];
  totalPiastres: number;
  /** False when this unit has nobody appointed — or when there is no unit at all. */
  canSend: boolean;
  /** Named on screen so Finance knows who it is going to before they send it. */
  confirmerNames: string[];
};

export async function availablePayables(): Promise<Payable[]> {
  const [paybacks, topUps, payouts, claims] = await Promise.all([
    prisma.paybackRequest.findMany({
      where: { status: "APPROVED", batchItems: { none: {} } },
      include: {
        user: { select: { name: true, businessUnit: { select: { id: true, name: true } } } },
        category: { select: { name: true } },
      },
      orderBy: { decidedAt: "asc" },
    }),
    prisma.pettyCashFunding.findMany({
      where: { type: "TOP_UP", batchItems: { none: {} } },
      include: {
        account: {
          select: {
            name: true,
            custodian: { select: { name: true, businessUnit: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
    prisma.incentivePayout.findMany({
      where: { batchItems: { none: {} } },
      include: {
        user: { select: { name: true } },
        cycle: { select: { label: true } },
        businessUnit: { select: { id: true, name: true } },
      },
      orderBy: { releasedAt: "asc" },
    }),
    prisma.benefitClaim.findMany({
      where: { status: "APPROVED", batchItems: { none: {} } },
      include: {
        user: { select: { name: true, businessUnit: { select: { id: true, name: true } } } },
        guaranteedBenefit: { select: { name: true } },
        catalogItem: { select: { name: true } },
      },
      orderBy: { decidedAt: "asc" },
    }),
  ]);

  return [
    ...paybacks.map((p): Payable => ({
      kind: "PAYBACK",
      id: p.id,
      payeeName: p.user.name ?? "—",
      purpose: p.category?.name ? `${p.description} · ${p.category.name}` : p.description,
      amountPiastres: toPiastres(p.amount),
      since: p.decidedAt ?? p.submittedAt,
      businessUnitId: p.user.businessUnit?.id ?? null,
      businessUnitName: p.user.businessUnit?.name ?? null,
    })),
    ...topUps.map((f): Payable => ({
      kind: "FLOAT_TOPUP",
      id: f.id,
      payeeName: f.account.custodian.name ?? "—",
      purpose: `${f.account.name} — top-up`,
      amountPiastres: toPiastres(f.amount),
      since: f.date,
      // The float is paid to whoever holds it, so it banks where that person does.
      businessUnitId: f.account.custodian.businessUnit?.id ?? null,
      businessUnitName: f.account.custodian.businessUnit?.name ?? null,
    })),
    ...payouts.map((p): Payable => ({
      kind: "INCENTIVE_PAYOUT",
      id: p.id,
      payeeName: p.user.name ?? p.personName,
      purpose: `Incentive ${p.cycle.label} · ${
        p.kind === "SCHEME_FEES" ? "Business Partner Fee" : "commission"
      }`,
      amountPiastres: toPiastres(p.amount),
      since: p.releasedAt,
      // Frozen at release — see the note above; never re-derived from the person now.
      businessUnitId: p.businessUnit.id,
      businessUnitName: p.businessUnit.name,
    })),
    ...claims.map((c): Payable => ({
      kind: "BENEFIT_CLAIM",
      id: c.id,
      payeeName: c.user.name ?? "—",
      purpose: `Benefit claim — ${c.guaranteedBenefit?.name ?? c.catalogItem?.name ?? "a benefit"}`,
      // Benefits money is whole EGP `Int`, not the two-decimal Decimal petty cash uses. Converting
      // here keeps every amount in one currency of arithmetic once it reaches a submission.
      amountPiastres: c.amount * 100,
      since: c.decidedAt ?? c.createdAt,
      businessUnitId: c.user.businessUnit?.id ?? null,
      businessUnitName: c.user.businessUnit?.name ?? null,
    })),
  ].sort((a, b) => a.since.getTime() - b.since.getTime());
}

/** Turn the form's "KIND:id" values back into the foreign key the item row needs. */
export function itemParentFor(kind: PayableKind, id: string) {
  switch (kind) {
    case "PAYBACK":
      return { paybackRequestId: id };
    case "FLOAT_TOPUP":
      return { pettyCashFundingId: id };
    case "BENEFIT_CLAIM":
      return { benefitClaimId: id };
    case "INCENTIVE_PAYOUT":
      return { incentivePayoutId: id };
  }
}

/**
 * What is waiting, split into one group per business unit (2026-08-25).
 *
 * THE shape Finance's screen is built from, and the reason a submission can never mix two units:
 * there is no list containing both. Groups come back in a stable order — units by their own sort
 * order, then the "No business unit" group last, because it is the one that needs fixing rather
 * than sending.
 *
 * `canSend` is answered here, from `unitsWithConfirmers`, so the screen, the button and the server
 * action all read the same fact. A unit with money waiting and nobody appointed says so and
 * refuses; it does not fall through to anybody else (the CEO's choice, of three offered).
 */
export async function payableGroups(): Promise<PayableGroup[]> {
  const [payables, withConfirmers, units] = await Promise.all([
    availablePayables(),
    unitsWithConfirmers(),
    prisma.businessUnit.findMany({
      select: {
        id: true,
        name: true,
        order: true,
        transactionConfirmers: {
          where: { user: { status: "ACTIVE" } },
          select: { user: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
  ]);

  const byUnit = new Map<string | null, Payable[]>();
  for (const p of payables) {
    const key = p.businessUnitId;
    const list = byUnit.get(key);
    if (list) list.push(p);
    else byUnit.set(key, [p]);
  }

  const groups: PayableGroup[] = [];
  for (const unit of units) {
    const list = byUnit.get(unit.id);
    if (!list?.length) continue;
    groups.push({
      businessUnitId: unit.id,
      businessUnitName: unit.name,
      payables: list,
      totalPiastres: sumPiastres(list.map((p) => p.amountPiastres)),
      canSend: withConfirmers.has(unit.id),
      confirmerNames: unit.transactionConfirmers.map((c) => c.user.name ?? "—"),
    });
  }

  // People with no business unit set. Real money, genuinely owed, with nowhere to pay it from —
  // so it is shown rather than hidden, and cannot be sent until somebody gives them a unit.
  const orphans = byUnit.get(null);
  if (orphans?.length) {
    groups.push({
      businessUnitId: null,
      businessUnitName: "No business unit",
      payables: orphans,
      totalPiastres: sumPiastres(orphans.map((p) => p.amountPiastres)),
      canSend: false,
      confirmerNames: [],
    });
  }

  return groups;
}
