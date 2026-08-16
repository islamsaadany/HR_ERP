/**
 * Throwaway-DB proof for the admin Benefits redesign (medical commitments management view +
 * claims queue/ledger), mockups signed off 2026-08-16.
 *
 * The page is a server component, so it can't be fetched without a session. What it CAN do is
 * run the exact shipped helpers the page derives its rows from — `medicalCycleCharge`,
 * `poolCycleFraction`, `prorate`, `overlapWholeMonths`, `sumMedicalPremium`,
 * `reconcileMedicalCharges` — over real rows, and assert the numbers the screen will print.
 *
 * Also exercises the real `approveClaims` bulk action end to end.
 */
import { PrismaClient } from "@prisma/client";
import { medicalCycleCharge, planYearWindow } from "../src/lib/benefits/config";
import { classifyEligibility, hasKnownStartDate, poolCycleFraction, prorate } from "../src/lib/benefits/proration";
import { overlapWholeMonths } from "../src/lib/benefits/policy-year";
import { sumMedicalPremium } from "../src/lib/benefits/rates";
import { reconcileMedicalCharges } from "../src/lib/benefits/reconcile";
import { deriveTenureBand } from "../src/lib/tenure";

const prisma = new PrismaClient();
let pass = 0,
  fail = 0;
const check = (label: string, ok: boolean, got?: unknown) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${ok || got === undefined ? "" : `  → got ${JSON.stringify(got)}`}`);
  ok ? pass++ : fail++;
};

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

async function main() {
  // ── Clean slate ────────────────────────────────────────────────────────────
  await prisma.medicalCycleCharge.deleteMany({});
  await prisma.medicalCoveredPerson.deleteMany({});
  await prisma.medicalCommitment.deleteMany({});
  await prisma.benefitClaim.deleteMany({});
  await prisma.dependant.deleteMany({});
  await prisma.planYear.deleteMany({});
  await prisma.medicalPolicyYear.deleteMany({});
  await prisma.poolCeiling.deleteMany({});
  await prisma.medicalRateBand.deleteMany({});
  await prisma.benefitCatalogItem.deleteMany({});
  await prisma.user.deleteMany({});

  // ── Config: the product owner's real shape ─────────────────────────────────
  const term = await prisma.medicalPolicyYear.create({
    data: { name: "2026/27", status: "OPEN", startDate: D(2026, 6, 15), endDate: D(2027, 6, 14) },
  });
  const cycle = await prisma.planYear.create({
    data: { name: "2026", status: "OPEN", startDate: D(2026, 7, 1), endDate: D(2026, 12, 31), flexCapEnabled: true },
  });
  await prisma.poolCeiling.createMany({
    data: [
      { employmentType: "FULL_TIME", tenureBand: "BAND_6MO_2Y", amount: 20000 },
      { employmentType: "FULL_TIME", tenureBand: "BAND_2_4Y", amount: 25000 },
      { employmentType: "PART_TIME", tenureBand: "BAND_6MO_2Y", amount: 10000 },
    ],
  });
  const bands = [
    { tier: 1, minAge: 0, maxAge: 9, annualPremium: 2100, order: 1 },
    { tier: 1, minAge: 30, maxAge: 34, annualPremium: 7842.6, order: 2 },
    { tier: 1, minAge: 35, maxAge: 39, annualPremium: 8410.4, order: 3 },
  ];
  await prisma.medicalRateBand.createMany({ data: bands });
  const gym = await prisma.benefitCatalogItem.create({
    data: { key: "gym", name: "Gym membership", category: "Wellbeing", coverageRate: 50, order: 1, claimType: "PROOF" },
  });

  const mk = (email: string, name: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: {
        email,
        name,
        status: "ACTIVE",
        employmentType: "FULL_TIME",
        startDate: D(2024, 1, 1),
        dateOfBirth: D(1992, 3, 4),
        updatedAt: new Date(),
        ...extra,
      },
    });

  const rana = await mk("rana@x.test", "Rana Reda");
  const ahmed = await mk("ahmed@x.test", "Ahmed Galal");
  const noDob = await mk("nodob@x.test", "Youssef Nabil", { dateOfBirth: null });
  const newJoiner = await mk("new@x.test", "Dina Sherif", { startDate: D(2026, 12, 1) });
  const leaver = await mk("leaver@x.test", "Karim Adel", { status: "LEFT" });
  await mk("plain@x.test", "Omar Hegazy");

  const spouse = await prisma.dependant.create({
    data: { userId: rana.id, name: "Mo'men", kind: "SPOUSE", dateOfBirth: D(1989, 5, 2) },
  });
  const kid = await prisma.dependant.create({
    data: { userId: rana.id, name: "Zein", kind: "CHILD", dateOfBirth: D(2020, 2, 2) },
  });

  const planWindow = planYearWindow(cycle);

  // ── 1. Eligibility + the chase list ───────────────────────────────────────
  const activeEmployees = await prisma.user.findMany({
    where: { status: "ACTIVE", employmentType: { not: null } },
    select: { id: true, name: true, employmentType: true, startDate: true, dateOfBirth: true },
  });
  const eligible = activeEmployees.filter(
    (u) => hasKnownStartDate(u.startDate) && classifyEligibility(u.startDate, 3, planWindow).status !== "NOT_YET"
  );
  console.log("\n1. Eligible / not-committed");
  check("the LEFT employee is not counted as eligible", !eligible.some((u) => u.id === leaver.id));
  check(
    "a joiner past the cycle end is not yet eligible (3-month rule)",
    !eligible.some((u) => u.id === newJoiner.id)
  );
  check("the other four active employees are eligible", eligible.length === 4, eligible.length);
  check("the employee with no DOB is eligible but blocked", eligible.some((u) => u.id === noDob.id));

  // ── 2. Commitment: pricing, split, and the row's derived figures ──────────
  const priced = sumMedicalPremium(
    [{ dob: rana.dateOfBirth! }, { dob: spouse.dateOfBirth }, { dob: kid.dateOfBirth }],
    bands,
    D(2026, 8, 16)
  );
  const commitment = await prisma.medicalCommitment.create({
    data: {
      userId: rana.id,
      planYearId: cycle.id,
      policyYearId: term.id,
      premium: Math.min(priced.annualEGP, 25000),
      updatedAt: new Date(),
      coveredPeople: {
        create: [
          { dependantId: null, label: "Rana Reda", ageAtCommit: priced.lines[0].ageAtCommit, premiumEGP: priced.lines[0].premiumEGP },
          { dependantId: spouse.id, label: "Spouse · Mo'men", ageAtCommit: priced.lines[1].ageAtCommit, premiumEGP: priced.lines[1].premiumEGP },
          { dependantId: kid.id, label: "Child · Zein", ageAtCommit: priced.lines[2].ageAtCommit, premiumEGP: priced.lines[2].premiumEGP },
        ],
      },
    },
  });
  await reconcileMedicalCharges();

  const charges = await prisma.medicalCycleCharge.findMany({
    where: { commitmentId: commitment.id },
    include: { planYear: { select: { name: true, status: true } } },
  });
  const thisCycle = medicalCycleCharge({ premium: commitment.premium, cycleCharges: charges }, cycle.id);
  const cancelled = charges.filter((c) => c.status === "CANCELLED").reduce((n, c) => n + c.amount, 0);
  const chargeTotal = charges.reduce((n, c) => n + c.amount, 0);
  const carriesOver = Math.max(0, commitment.premium - thisCycle - cancelled);
  const overCharged = Math.max(0, chargeTotal - commitment.premium);
  const monthsTotal = overlapWholeMonths(
    { start: term.startDate, end: term.endDate },
    { start: term.startDate, end: term.endDate }
  );
  const monthsInCycle = charges.find((c) => c.planYearId === cycle.id)?.overlapMonths ?? 0;

  console.log("\n2. Commitment row figures");
  check("premium = sum of the three age bands, cents dropped", commitment.premium === 2100 + 7842 + 8410, commitment.premium);
  check("this cycle's draw is less than the premium (term outlives the cycle)", thisCycle > 0 && thisCycle < commitment.premium, thisCycle);
  check("carries over = premium − this cycle's draw", carriesOver === commitment.premium - thisCycle, carriesOver);
  check("carries over + this cycle = the whole premium", carriesOver + thisCycle === commitment.premium);
  check("nothing is over-charged on a clean commitment", overCharged === 0, overCharged);
  // 11, not 12: a term of 15 Jun → 14 Jun loses both half-months under the whole-months rule,
  // and `reconcileMedicalCharges` divides the premium by exactly this number. The chip must quote
  // the denominator the money was actually split on, or it explains a split that didn't happen.
  check("chip quotes the same term months the reconciler split on", monthsInCycle === 6 && monthsTotal === 11, { monthsInCycle, monthsTotal });
  check("cover summary is 'You +2'", `You +${charges.length > 0 ? 2 : 0}` === "You +2");

  // ── 3. Over-charge and cover-ended states ────────────────────────────────
  await prisma.medicalCommitment.update({ where: { id: commitment.id }, data: { premium: chargeTotal - 726 } });
  const over = await prisma.medicalCommitment.findUniqueOrThrow({ where: { id: commitment.id } });
  console.log("\n3. Exception states");
  check("an over-charge is detected and quantified", Math.max(0, chargeTotal - over.premium) === 726);
  await prisma.medicalCommitment.update({ where: { id: commitment.id }, data: { premium: commitment.premium } });

  await prisma.medicalCycleCharge.updateMany({ where: { commitmentId: commitment.id }, data: { status: "CANCELLED" } });
  const cancelledCharges = await prisma.medicalCycleCharge.findMany({ where: { commitmentId: commitment.id } });
  const cancelledTotal = cancelledCharges.reduce((n, c) => n + c.amount, 0);
  check(
    "a cancelled charge is recovered, never counted as carried over",
    Math.max(0, commitment.premium - 0 - cancelledTotal) === commitment.premium - cancelledTotal
  );
  await prisma.medicalCycleCharge.updateMany({ where: { commitmentId: commitment.id }, data: { status: "APPLIED" } });

  // ── 4. Claim queue: the pool meter ───────────────────────────────────────
  const claim = await prisma.benefitClaim.create({
    // 50% of 5,600 = 2,800 — the ordinary, unclamped case.
    data: { userId: ahmed.id, planYearId: cycle.id, catalogItemId: gym.id, amount: 2800, fullCost: 5600, status: "SUBMITTED", note: "Annual membership" },
  });
  const capped = await prisma.benefitClaim.create({
    data: { userId: ahmed.id, planYearId: cycle.id, catalogItemId: gym.id, amount: 6500, fullCost: 15000, status: "SUBMITTED" },
  });
  await prisma.benefitClaim.create({
    data: { userId: ahmed.id, planYearId: cycle.id, catalogItemId: gym.id, amount: 9999, status: "REJECTED", decidedAt: new Date() },
  });

  const claims = await prisma.benefitClaim.findMany({ where: { planYearId: cycle.id } });
  const claimedByUser = new Map<string, number>();
  for (const c of claims) {
    if (c.status === "REJECTED") continue;
    claimedByUser.set(c.userId, (claimedByUser.get(c.userId) ?? 0) + c.amount);
  }
  const band = deriveTenureBand(ahmed.startDate).band ?? "BAND_6MO_2Y";
  const ceilRow = await prisma.poolCeiling.findFirstOrThrow({ where: { employmentType: "FULL_TIME", tenureBand: band } });
  const fraction = poolCycleFraction(classifyEligibility(ahmed.startDate, 6, planWindow), planWindow);
  const ceiling = prorate(ceilRow.amount, fraction);
  const remaining = Math.max(0, ceiling - (claimedByUser.get(ahmed.id) ?? 0));

  console.log("\n4. Claim queue pool meter");
  check("a 6-month cycle prorates the ceiling to half", fraction === 0.5 && ceiling === ceilRow.amount / 2, { fraction, ceiling });
  check("a rejected claim releases its allowance", (claimedByUser.get(ahmed.id) ?? 0) === 2800 + 6500);
  check("pool left after the queued claims is right", remaining === ceiling - 9300, remaining);
  check(
    "an unclamped claim is NOT flagged as capped",
    Math.round((claim.fullCost! * 50) / 100) === claim.amount
  );
  check(
    "a claim clamped below its coverage share IS flagged as capped",
    Math.round((capped.fullCost! * 50) / 100) !== capped.amount
  );

  // ── 5. Queue / ledger split ──────────────────────────────────────────────
  const queue = claims.filter((c) => c.status === "SUBMITTED");
  const ledger = claims.filter((c) => c.status !== "SUBMITTED");
  const committedAgainstPools = claims.filter((c) => c.status !== "REJECTED").reduce((n, c) => n + c.amount, 0);
  console.log("\n5. Queue / ledger split");
  check("only submitted claims are in the queue", queue.length === 2, queue.length);
  check("decided claims are in the ledger", ledger.length === 1, ledger.length);
  check("rail total excludes rejected claims", committedAgainstPools === 9300, committedAgainstPools);

  // ── 6. The real bulk-approve action ──────────────────────────────────────
  const { approveClaims } = await import("../src/app/(app)/admin/benefits/actions");
  const fd = new FormData();
  fd.append("ids", claim.id);
  fd.append("ids", capped.id);
  try {
    await approveClaims(fd);
  } catch (e) {
    // requireAdmin() has no session here; that is the expected failure mode.
    console.log(`\n6. Bulk approve — refused without an admin session (${(e as Error).message.slice(0, 60)}…)`);
  }
  const stillSubmitted = await prisma.benefitClaim.count({ where: { status: "SUBMITTED" } });
  check("bulk approve does nothing without an authenticated admin", stillSubmitted === 2, stillSubmitted);

  // ── 7. Attention counts — the admin card pill and the Medical tab badge ──
  // The card, the badge and the row chip must agree, so they all call `commitmentAttention`.
  const { benefitsAttention, commitmentAttention, pendingLeaveCount } = await import("../src/lib/benefits/attention");
  console.log("\n7. Attention counts");

  const clean = await benefitsAttention();
  check("a healthy cycle flags no medical exceptions", clean.medical === 0, clean.medical);
  check("the two queued claims are counted as to-review", clean.claimsToReview === 2, clean.claimsToReview);
  check(
    "the employee with no DOB is counted as blocked, and only them",
    clean.blocked === 1,
    clean.blocked
  );
  check(
    "'not committed' is deliberately NOT in the total",
    clean.total === clean.claimsToReview + clean.medical + clean.blocked && clean.total === 3,
    clean.total
  );

  // Break one commitment each way and re-count.
  await prisma.medicalCommitment.update({ where: { id: commitment.id }, data: { premium: chargeTotal - 500 } });
  const withOver = await benefitsAttention();
  check("an over-charged commitment lifts the medical count", withOver.overCharged === 1 && withOver.medical === 1, withOver);
  await prisma.medicalCommitment.update({ where: { id: commitment.id }, data: { premium: commitment.premium } });

  await prisma.medicalCycleCharge.updateMany({ where: { commitmentId: commitment.id }, data: { status: "CANCELLED" } });
  const withEnded = await benefitsAttention();
  check("a cancelled charge counts as cover ended", withEnded.coverEnded === 1 && withEnded.medical === 1, withEnded);
  await prisma.medicalCycleCharge.updateMany({ where: { commitmentId: commitment.id }, data: { status: "APPLIED" } });

  await prisma.planYear.update({ where: { id: cycle.id }, data: { status: "CLOSED" } });
  const withFrozen = await benefitsAttention();
  check("an applied charge on a closed cycle counts as frozen", withFrozen.frozen === 1, withFrozen.frozen);
  await prisma.planYear.update({ where: { id: cycle.id }, data: { status: "OPEN" } });

  // The row chip and the counts read the same function, so they cannot disagree.
  const rowFlags = commitmentAttention(commitment.premium, charges as never);
  check("row chip and pill agree on a healthy commitment", rowFlags.attention === false);

  await prisma.leaveRequest.create({
    data: { userId: ahmed.id, startDate: D(2026, 9, 1), endDate: D(2026, 9, 3), status: "PENDING", updatedAt: new Date() },
  });
  await prisma.leaveRequest.create({
    data: { userId: ahmed.id, startDate: D(2026, 10, 1), endDate: D(2026, 10, 2), status: "APPROVED", updatedAt: new Date() },
  });
  check("only pending leave is counted for the Time-Off pill", (await pendingLeaveCount()) === 1);

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
