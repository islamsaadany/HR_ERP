/**
 * The pool invariant end to end, against a real Postgres: medical + flexible claims must never
 * exceed the prorated ceiling, through any write path, in any order.
 *
 * These are the scenarios that were run by hand while fixing the 2026-08-20 overrun. They need a
 * database, so they SKIP unless TEST_DATABASE_URL is set — see the guard below, which is
 * deliberately strict: this file truncates tables, and must never be able to reach real data.
 *
 *   createdb hrerp_test
 *   TEST_DATABASE_URL="postgresql://…/hrerp_test" npx prisma db push
 *   TEST_DATABASE_URL="postgresql://…/hrerp_test" npm test
 */
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { poolStateFor, spendable, withPoolLock } from "@/lib/benefits/pool";
import { evaluateClaim, type AllowanceContext } from "@/lib/benefits/rules";

// tests/setup.ts validates the target and points the app client at it. Without it, skip.
const skip = process.env.POOL_TESTS_READY
  ? false
  : "TEST_DATABASE_URL not set — see the header of this file";

describe("pool ceiling invariant (database)", { skip }, () => {
  let cycle: { id: string; startDate: Date | null; endDate: Date | null; flexCapEnabled: boolean };
  let userId: string;
  let item: { id: string; key: string; name: string; coverageRate: number };

  const CEILING = 10000; // 20,000 annual, halved by a six-month cycle

  before(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE "MedicalCycleCharge","MedicalCoveredPerson","MedicalCommitment","BenefitClaim",
       "BenefitCatalogItem","PoolCeiling","MedicalPolicyYear","PlanYear","User" CASCADE`
    );
    cycle = await prisma.planYear.create({
      data: { name: "test cycle", status: "OPEN", flexCapEnabled: false,
              startDate: new Date("2026-07-01"), endDate: new Date("2026-12-31") },
    });
    await prisma.poolCeiling.create({ data: { employmentType: "PART_TIME", tenureBand: "BAND_2_4Y", amount: 20000 } });
    item = await prisma.benefitCatalogItem.create({
      data: { key: "gym", name: "Gym", coverageRate: 100, active: true,
              eligiblePartTime: true, eligibleFullTime: true, claimType: "PROOF" },
    });
    const u = await prisma.user.create({
      data: { name: "Test Person", email: "invariant@forefront.consulting", employmentType: "PART_TIME",
              startDate: new Date("2023-02-01"), dateOfBirth: new Date("1990-04-10") },
    });
    userId = u.id;
  });

  after(async () => { await prisma.$disconnect(); });

  beforeEach(async () => {
    await prisma.medicalCycleCharge.deleteMany({});
    await prisma.medicalCoveredPerson.deleteMany({});
    await prisma.medicalCommitment.deleteMany({});
    await prisma.benefitClaim.deleteMany({});
  });

  /** The guard every medical write path applies. */
  async function medical(premium: number): Promise<boolean> {
    const pool = await poolStateFor(userId, cycle);
    if (pool.ceiling != null && premium > spendable(pool)) return false;
    await prisma.medicalCommitment.create({
      data: { userId, planYearId: cycle.id, premium,
              coveredPeople: { create: [{ dependantId: null, label: "Employee", ageAtCommit: 36, premiumEGP: premium }] } },
    });
    return true;
  }

  /** createClaim's flexible branch, including the re-check inside the per-employee lock. */
  async function claim(fullCost: number): Promise<number> {
    const pool = await poolStateFor(userId, cycle);
    const prior = await prisma.benefitClaim.findMany({
      where: { userId, planYearId: cycle.id, catalogItemId: item.id, status: { not: "REJECTED" } },
      select: { amount: true },
    });
    const ctx: AllowanceContext = {
      ceiling: pool.ceiling ?? 0, medicalPremium: pool.medical,
      claimedByBenefit: { [item.key]: prior.reduce((n, c) => n + c.amount, 0) },
      employmentType: "PART_TIME", flexCapEnabled: cycle.flexCapEnabled,
    };
    const r = evaluateClaim(ctx, { key: item.key, name: item.name, fullCost, coverageRate: item.coverageRate });
    if (r.errors.length > 0 || r.covered <= 0) return 0;
    await withPoolLock(userId, async (tx) => {
      const live = await poolStateFor(userId, cycle, { db: tx });
      if (live.ceiling != null && r.covered > spendable(live)) throw new Error("raced");
      await tx.benefitClaim.create({
        data: { userId, planYearId: cycle.id, catalogItemId: item.id, amount: r.covered, fullCost, status: "SUBMITTED" },
      });
    });
    return r.covered;
  }

  /**
   * Deliberately does NOT trust `remaining` or `over`: the original bug floored the remainder at
   * zero, which would make an overdrawn pool report `over === false` and quietly neuter this very
   * assertion. The sum of the parts against the ceiling is the thing that cannot lie.
   */
  const assertHeld = async (what: string) => {
    const p = await poolStateFor(userId, cycle);
    assert.equal(p.ceiling, CEILING);
    assert.ok(
      p.medical + p.flex <= (p.ceiling ?? 0),
      `${what}: medical ${p.medical} + flex ${p.flex} exceeds the ${p.ceiling} ceiling`
    );
    assert.equal(p.used, p.medical + p.flex, "used must be the sum of what was actually spent");
    return p;
  };

  test("medical first, then a claim: the claim is clamped to what is left", async () => {
    assert.equal(await medical(6093), true);
    assert.equal(await claim(6000), 3907, "6,000 asked against 3,907 free");
    const p = await assertHeld("medical -> claim");
    assert.equal(p.used, CEILING, "the pool may be spent to the penny, just not past it");
  });

  test("claim first, then medical: medical is REFUSED, never clamped", async () => {
    assert.equal(await claim(6000), 6000);
    assert.equal(await medical(6093), false, "you cannot part-buy insurance, so this must refuse");
    const p = await assertHeld("claim -> medical");
    assert.equal(p.medical, 0, "a refused commitment must leave nothing behind");
    assert.equal(p.flex, 6000);
  });

  test("claims walk up to the ceiling and then stop", async () => {
    for (let i = 0; i < 5; i++) assert.equal(await claim(2000), 2000, `claim ${i + 1} should pay in full`);
    assert.equal(await claim(2000), 0, "the sixth has nothing left to draw");
    const p = await assertHeld("six 2,000 claims");
    assert.equal(p.used, CEILING);
  });

  test("a rejected claim frees its money, and reopening it is re-checked", async () => {
    await claim(6000);
    const first = await prisma.benefitClaim.findFirstOrThrow({ where: { userId } });
    await prisma.benefitClaim.update({ where: { id: first.id }, data: { status: "REJECTED" } });
    assert.equal((await poolStateFor(userId, cycle)).flex, 0, "a rejected claim consumes nothing");

    assert.equal(await claim(9000), 9000, "the money is genuinely available again");
    const pool = await poolStateFor(userId, cycle);
    assert.ok(first.amount > spendable(pool), "reopening must now be refused — it was spent elsewhere");
    await assertHeld("reject -> spend -> reopen");
  });

  test("concurrent claims from one employee cannot both spend the same money", async () => {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => claim(6000)));
    const paid = results.filter((r) => r.status === "fulfilled" && r.value > 0).length;
    assert.equal(paid, 1, `exactly one of four simultaneous 6,000 claims may win, got ${paid}`);
    await assertHeld("four concurrent claims");
  });

  test("an EXISTING overrun is reported as negative, not floored to zero", async () => {
    // Some rows predate the 2026-08-20 fix. Write past the guards on purpose, the way the old
    // reconcile path did, and check the reader tells the truth about it — flooring this is
    // exactly what hid the original 2,093 overrun behind a "Pool exhausted" chip.
    await prisma.benefitClaim.create({
      data: { userId, planYearId: cycle.id, catalogItemId: item.id, amount: 6000, fullCost: 6000, status: "SUBMITTED" },
    });
    await prisma.medicalCommitment.create({
      data: { userId, planYearId: cycle.id, premium: 6093,
              coveredPeople: { create: [{ dependantId: null, label: "Employee", ageAtCommit: 36, premiumEGP: 6093 }] } },
    });

    const p = await poolStateFor(userId, cycle);
    assert.equal(p.used, 12093);
    assert.equal(p.remaining, -2093, "remaining must be SIGNED so the report can show the size of the hole");
    assert.equal(p.over, true);
    assert.equal(spendable(p), 0, "an overdrawn pool still offers nothing to spend");
  });

  test("concurrent claims from DIFFERENT employees do not block each other", async () => {
    const others: string[] = [];
    for (let i = 0; i < 4; i++) {
      const u = await prisma.user.upsert({
        where: { email: `invariant${i}@forefront.consulting` }, update: {},
        create: { name: `Person ${i}`, email: `invariant${i}@forefront.consulting`,
                  employmentType: "PART_TIME", startDate: new Date("2023-02-01") },
      });
      others.push(u.id);
    }
    // The lock must be per employee. A database-wide one would fail most of these, which is
    // what a Serializable transaction actually did (1 of 6) before the row lock replaced it.
    const results = await Promise.allSettled(others.map((id) =>
      withPoolLock(id, async (tx) => {
        await poolStateFor(id, cycle, { db: tx });
        await tx.benefitClaim.create({
          data: { userId: id, planYearId: cycle.id, catalogItemId: item.id, amount: 1000, fullCost: 1000, status: "SUBMITTED" },
        });
      })
    ));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, others.length, `all ${others.length} unrelated employees should succeed, got ${ok}`);
  });
});
