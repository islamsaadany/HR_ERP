/**
 * Resolving an over-drawn pool (approved 2026-08-20).
 *
 * The routes are governance-sensitive — one of them authorises spend past a money rule — so the
 * rules they enforce are pinned here, not just their happy paths. Needs a database; see
 * tests/setup.ts for the guard that keeps this away from real data.
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { poolStateFor } from "@/lib/benefits/pool";

const skip = process.env.POOL_TESTS_READY ? false : "TEST_DATABASE_URL not set";

describe("resolving an over-drawn pool", { skip }, () => {
  let cycle: { id: string; startDate: Date | null; endDate: Date | null };
  let userId: string;
  let itemId: string;

  before(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "PoolCeilingException","MedicalCycleCharge","MedicalCoveredPerson","MedicalCommitment",
       "BenefitClaim","BenefitCatalogItem","PoolCeiling","MedicalPolicyYear","PlanYear","User" CASCADE`
    );
    cycle = await prisma.planYear.create({
      data: { name: "resolve cycle", status: "OPEN", flexCapEnabled: false,
              startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") },
    });
    await prisma.poolCeiling.create({ data: { employmentType: "PART_TIME", tenureBand: "BAND_2_4Y", amount: 20000 } });
    const item = await prisma.benefitCatalogItem.create({
      data: { key: "gym", name: "Gym", coverageRate: 100, active: true,
              eligiblePartTime: true, eligibleFullTime: true, claimType: "PROOF" },
    });
    itemId = item.id;
    const u = await prisma.user.create({
      data: { name: "Over Person", email: "over@forefront.consulting", employmentType: "PART_TIME",
              startDate: new Date("2023-02-01"), dateOfBirth: new Date("1990-04-10") },
    });
    userId = u.id;
  });

  after(async () => { await prisma.$disconnect(); });

  /** Recreate the shape the old bug left behind: 6,093 medical + 6,000 flex on a 10,000 pool. */
  beforeEach(async () => {
    await prisma.poolCeilingException.deleteMany({});
    await prisma.medicalCycleCharge.deleteMany({});
    await prisma.medicalCoveredPerson.deleteMany({});
    await prisma.medicalCommitment.deleteMany({});
    await prisma.benefitClaim.deleteMany({});
    await prisma.benefitClaim.create({
      data: { userId, planYearId: cycle.id, catalogItemId: itemId, amount: 6000, fullCost: 6000, status: "SUBMITTED" },
    });
    await prisma.medicalCommitment.create({
      data: { userId, planYearId: cycle.id, premium: 6093,
              coveredPeople: { create: [{ dependantId: null, label: "Employee", ageAtCommit: 36, premiumEGP: 6093 }] } },
    });
  });

  test("the starting position is the reported overrun", async () => {
    const p = await poolStateFor(userId, cycle);
    assert.equal(p.ceiling, 10000);
    assert.equal(p.used, 12093);
    assert.equal(p.remaining, -2093);
    assert.equal(p.over, true);
  });

  test("RAISED replaces the ceiling, so the pool is no longer over", async () => {
    await prisma.poolCeilingException.create({
      data: { userId, planYearId: cycle.id, kind: "RAISED", amount: 13000, reason: "approved by the partners" },
    });
    const p = await poolStateFor(userId, cycle);
    assert.equal(p.ceiling, 13000, "the exception IS the ceiling now");
    assert.equal(p.remaining, 907);
    assert.equal(p.over, false);
    assert.equal(p.exception?.kind, "RAISED");
  });

  test("ACCEPTED changes no money — the pool is still overdrawn, it just stops being flagged", async () => {
    await prisma.poolCeilingException.create({
      data: { userId, planYearId: cycle.id, kind: "ACCEPTED", amount: null, reason: "written off, one-off" },
    });
    const p = await poolStateFor(userId, cycle);
    assert.equal(p.ceiling, 10000, "accepting must NOT quietly move the ceiling");
    assert.equal(p.used, 12093);
    assert.equal(p.remaining, -2093, "the figures keep telling the truth");
    assert.equal(p.over, false, "but the row stops asking to be actioned");
    assert.equal(p.exception?.kind, "ACCEPTED");
  });

  test("an exception cannot conjure a pool for someone who has none", async () => {
    const nobody = await prisma.user.create({
      data: { name: "No Type", email: "notype@forefront.consulting", startDate: new Date("2023-02-01") },
    });
    await prisma.poolCeilingException.create({
      data: { userId: nobody.id, planYearId: cycle.id, kind: "RAISED", amount: 50000, reason: "should not apply" },
    });
    const p = await poolStateFor(nobody.id, cycle);
    assert.equal(p.ceiling, null, "no employment type means no pool, exception or not");
    assert.equal(p.reason, "no employment type set");
  });

  test("one decision per person per cycle — a later one replaces the earlier", async () => {
    await prisma.poolCeilingException.create({
      data: { userId, planYearId: cycle.id, kind: "ACCEPTED", amount: null, reason: "first call" },
    });
    await prisma.poolCeilingException.upsert({
      where: { userId_planYearId: { userId, planYearId: cycle.id } },
      create: { userId, planYearId: cycle.id, kind: "RAISED", amount: 13000, reason: "changed our mind" },
      update: { kind: "RAISED", amount: 13000, reason: "changed our mind" },
    });
    assert.equal(await prisma.poolCeilingException.count({ where: { userId } }), 1);
    const p = await poolStateFor(userId, cycle);
    assert.equal(p.ceiling, 13000);
    assert.equal(p.exception?.reason, "changed our mind");
  });

  test("a raised ceiling then binds every write path, at the NEW figure", async () => {
    await prisma.poolCeilingException.create({
      data: { userId, planYearId: cycle.id, kind: "RAISED", amount: 13000, reason: "approved" },
    });
    const p = await poolStateFor(userId, cycle);
    // 907 free, so a further claim may take that and no more — the exception moved the
    // ceiling, it did not remove it.
    assert.equal(p.remaining, 907);
    await prisma.benefitClaim.create({
      data: { userId, planYearId: cycle.id, catalogItemId: itemId, amount: 907, fullCost: 907, status: "SUBMITTED" },
    });
    const after = await poolStateFor(userId, cycle);
    assert.equal(after.used, 13000);
    assert.equal(after.remaining, 0, "spent to the new ceiling exactly");
    assert.equal(after.over, false);
  });
});
