import { prisma } from "@/lib/prisma";
import { toPiastres } from "@/lib/finance/money";

/**
 * What Finance can put into a submission (spec 040).
 *
 * Three kinds of payable, one shape. Each is money the company owes that Finance has created a
 * bank transaction for:
 *   • an approved payback request — somebody paid out of their own pocket,
 *   • a petty cash top-up — money going out to a float holder,
 *   • an approved benefit claim awaiting reimbursement (added at the CEO's note, 2026-08-24:
 *     the employee is told when HE confirms at the bank, not when Finance records a transfer).
 *
 * "Available" means: in the right state, and not already awaiting confirmation in a live
 * submission. Membership lives in `PaymentBatchItem`, so the second half is a simple absence check
 * — and the unique indexes behind it make a double-submit impossible even if two people try at
 * once.
 */

export type PayableKind = "PAYBACK" | "FLOAT_TOPUP" | "BENEFIT_CLAIM";

export type Payable = {
  kind: PayableKind;
  /** The source record's id — carried on the submission item as the matching foreign key. */
  id: string;
  payeeName: string;
  purpose: string;
  amountPiastres: number;
  /** Display-formatted date the payable arose, for the selection screen. */
  since: Date;
};

export async function availablePayables(): Promise<Payable[]> {
  const [paybacks, topUps, claims] = await Promise.all([
    prisma.paybackRequest.findMany({
      where: { status: "APPROVED", batchItems: { none: {} } },
      include: { user: { select: { name: true } }, category: { select: { name: true } } },
      orderBy: { decidedAt: "asc" },
    }),
    prisma.pettyCashFunding.findMany({
      where: { type: "TOP_UP", batchItems: { none: {} } },
      include: { account: { select: { name: true, custodian: { select: { name: true } } } } },
      orderBy: { date: "asc" },
    }),
    prisma.benefitClaim.findMany({
      where: { status: "APPROVED", batchItems: { none: {} } },
      include: {
        user: { select: { name: true } },
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
    })),
    ...topUps.map((f): Payable => ({
      kind: "FLOAT_TOPUP",
      id: f.id,
      payeeName: f.account.custodian.name ?? "—",
      purpose: `${f.account.name} — top-up`,
      amountPiastres: toPiastres(f.amount),
      since: f.date,
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
  }
}
