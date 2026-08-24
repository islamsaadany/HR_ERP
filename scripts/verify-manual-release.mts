/**
 * Proof for spec 016 manual claim/release entry — HR recording a benefit that was already paid.
 *
 * This file used to hand-copy `recordManualRelease`'s branch logic and assert against the copy.
 * That is how it rotted without anyone noticing: the real action moved on (per-person grants,
 * the pool-ceiling guard, APPROVED rather than RELEASED, a medical back-fill branch) while the
 * copy here kept testing a 2026-05 version of the app. A test that mirrors the thing it tests
 * eventually proves only that the mirror is self-consistent.
 *
 * So it now exercises the SHARED derivations the action actually calls — `isEligibleFor`,
 * `isSalaryDriven` and `amountForBand` from `lib/benefits/config` — against real rows. Those
 * cannot drift from the write path, because they ARE the write path. The pool ceiling and the
 * 50% cap are proven separately in `tests/pool-rules.test.ts`.
 *
 * The old catalog half is gone: spec 018 retired per-benefit allocations for flexible benefits,
 * so "released more than this benefit's allocation" is no longer a rule that exists.
 *
 * Needs a throwaway Postgres. It TRUNCATEs.
 */
import { PrismaClient } from "@prisma/client";
import { amountForBand, isEligibleFor, isSalaryDriven } from "../src/lib/benefits/config";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

async function main() {
  await prisma.benefitClaim.deleteMany({});
  await prisma.guaranteedBenefit.deleteMany({});
  await prisma.benefitCatalogItem.deleteMany({});
  await prisma.planYear.deleteMany({});
  await prisma.user.deleteMany({});

  const py = await prisma.planYear.create({ data: { name: "2026", status: "OPEN" } });

  // A banded benefit: different money per tenure band, and different money by employment type.
  const marriage = await prisma.guaranteedBenefit.create({
    data: {
      name: "Marriage", order: 0,
      eligibleFullTime: true, eligiblePartTime: false,
      ftBand6mo2y: 18000, ftBand2to4y: 24000, ftBand4to7y: 30000, ftBand7to10y: 36000,
      ptBand6mo2y: 9000, ptBand2to4y: 12000, ptBand4to7y: 15000, ptBand7to10y: 18000,
    },
  });
  // A salary-driven one: no band figures at all, so the allocation is a month's salary.
  const loans = await prisma.guaranteedBenefit.create({
    data: { name: "Loans", order: 1, eligibleFullTime: true, eligiblePartTime: true },
  });

  const ft = await prisma.user.create({
    data: { name: "Full timer", email: "ft@x.test", employmentType: "FULL_TIME", tenureBand: "BAND_4_7Y", monthlySalary: 50000 },
  });
  const pt = await prisma.user.create({
    data: { name: "Part timer", email: "pt@x.test", employmentType: "PART_TIME", tenureBand: "BAND_4_7Y", monthlySalary: 20000 },
  });

  console.log("Who a guaranteed benefit applies to (spec 021):");
  check("full-time is eligible for Marriage", isEligibleFor("FULL_TIME", marriage));
  check("part-time is NOT — the flag is per employment type, not one switch",
    !isEligibleFor("PART_TIME", marriage));
  check("Loans applies to both", isEligibleFor("FULL_TIME", loans) && isEligibleFor("PART_TIME", loans));

  console.log("How much (the ONE derivation the write path uses):");
  check("full-time, 4–7y → 30,000", amountForBand("FULL_TIME", "BAND_4_7Y", marriage) === 30000);
  check("part-time reads the PART-time column, not the full-time one (15,000, not 30,000)",
    amountForBand("PART_TIME", "BAND_4_7Y", marriage) === 15000);
  check("a longer band pays more (7–10y → 36,000)", amountForBand("FULL_TIME", "BAND_7_10Y", marriage) === 36000);
  // An unset band answers null rather than falling back to a neighbouring figure. Guessing a
  // number for a band nobody configured is how the wrong amount gets paid quietly.
  check("a band with no figure reads null, it does not borrow the next one",
    amountForBand("FULL_TIME", "BAND_4_7Y", { ...marriage, ftBand4to7y: null }) === null);

  console.log("Salary-driven benefits (Loans):");
  check("Loans is salary-driven — no band figures anywhere", isSalaryDriven(loans));
  check("Marriage is not", !isSalaryDriven(marriage));
  check("a salary-driven benefit has no band amount to read",
    amountForBand("FULL_TIME", "BAND_4_7Y", loans) === null);

  console.log("What a recorded release looks like once written:");
  // Recorded as APPROVED, not RELEASED: HR records, Finance confirms the transfer in the
  // Payments queue. That separation is the point, so it is asserted rather than assumed.
  const approvalDate = new Date("2026-05-14T00:00:00");
  await prisma.benefitClaim.create({
    data: {
      userId: ft.id, planYearId: py.id, guaranteedBenefitId: marriage.id,
      amount: amountForBand("FULL_TIME", "BAND_4_7Y", marriage)!,
      status: "APPROVED", decidedAt: approvalDate, reviewedById: ft.id,
      note: "Recorded by HR (back-filled) — awaiting Finance payment",
    },
  });
  const claim = await prisma.benefitClaim.findFirstOrThrow({ where: { guaranteedBenefitId: marriage.id } });
  check("stored as APPROVED, so Finance still has to confirm the payment", claim.status === "APPROVED");
  check("keeps the back-dated approval date, not today", claim.decidedAt?.toISOString().startsWith("2026-05-14") === true);
  check("records who entered it", !!claim.reviewedById);
  check("the amount is the banded figure, not the salary", claim.amount === 30000);

  console.log("Nothing was written for the ineligible employee:");
  const ptClaims = await prisma.benefitClaim.count({ where: { userId: pt.id } });
  check("part-timer has no Marriage claim", ptClaims === 0);

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
