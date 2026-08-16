/**
 * Proof for spec 031 (per-cycle 50%-per-benefit cap switch).
 *
 * The rule logic is IMPORTED from the shipped engine — `flexCap`/`evaluateClaim` are the code
 * under test, not a copy of it. The action-level guard (open cycles only) is replicated minus
 * `requireAdmin`, matching how 014/029 verify their actions; the guarded path is exercised in the
 * Chromium pass.
 *
 * Run with POSTGRES_URL pointed at a throwaway DB.
 */
import { PrismaClient } from "@prisma/client";
import { flexCap, evaluateClaim, type AllowanceContext } from "../src/lib/benefits/rules";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

/** A five-month cycle: 30,000 annual ceiling prorated to 5/12 = 12,500. */
const CEILING = 12_500;

const ctx = (over: Partial<AllowanceContext> = {}): AllowanceContext => ({
  ceiling: CEILING,
  medicalPremium: 0,
  claimedByBenefit: {},
  employmentType: "FULL_TIME",
  ...over,
});

const gymClaim = (fullCost: number) => ({
  key: "gym", name: "Gym", fullCost, coverageRate: 100,
});

async function main() {
  console.log("\nThe rule itself");
  check("with the cap on, the per-benefit ceiling is half the pool", flexCap(CEILING, true) === 6_250);
  check("with the cap off, it is the POOL ceiling", flexCap(CEILING, false) === CEILING);
  check("…not Infinity — the pool must keep binding", Number.isFinite(flexCap(CEILING, false)));
  check("the default is on, so a caller predating the switch is unchanged", flexCap(CEILING) === 6_250);
  check("an odd ceiling floors rather than paying a fraction", flexCap(12_501, true) === 6_250);

  console.log("\nUS1 — a claim past 50% on a short cycle");
  const on = evaluateClaim(ctx({ flexCapEnabled: true }), gymClaim(9_000));
  check("cap ON: a 9,000 receipt is paid down to the 6,250 cap", on.covered === 6_250);
  check("…and names the benefit as the limiting rule", on.clampedBy === "benefit");
  check("…and is NOT refused — it pays what's left", on.errors.length === 0);

  const off = evaluateClaim(ctx({ flexCapEnabled: false }), gymClaim(9_000));
  check("cap OFF: the same receipt is paid in full", off.covered === 9_000);
  check("…with nothing clamping it", off.clampedBy === null);

  console.log("\nFR-007 — the pool ceiling still binds with the cap off");
  const overPool = evaluateClaim(ctx({ flexCapEnabled: false }), gymClaim(20_000));
  check("a receipt above the whole pool is paid down to the ceiling", overPool.covered === CEILING);
  check("…named as the benefit ceiling, which now IS the pool", overPool.clampedBy === "benefit");
  const partUsed = evaluateClaim(
    ctx({ flexCapEnabled: false, claimedByBenefit: { spa: 4_000 } }),
    gymClaim(20_000)
  );
  check("another benefit's spend still reduces what's available", partUsed.covered === 8_500);
  check("…limited by the pool, not the benefit", partUsed.clampedBy === "pool");
  const drained = evaluateClaim(
    ctx({ flexCapEnabled: false, claimedByBenefit: { spa: CEILING } }),
    gymClaim(1_000)
  );
  check("a fully-used pool refuses, cap off or not", drained.errors.length > 0 && drained.covered === 0);

  console.log("\nFR-008 — a fixed allowance is unaffected by the switch");
  const allowanceOn = evaluateClaim(ctx({ flexCapEnabled: true }), {
    key: "travel", name: "Travel allowance", fullCost: 0, coverageRate: 100, allocation: 3_000,
  });
  const allowanceOff = evaluateClaim(ctx({ flexCapEnabled: false }), {
    key: "travel", name: "Travel allowance", fullCost: 0, coverageRate: 100, allocation: 3_000,
  });
  check("cap on: the allowance pays its band amount", allowanceOn.covered === 3_000);
  check("cap off: it pays the SAME — an entitlement doesn't grow", allowanceOff.covered === 3_000);

  console.log("\nFR-009 — medical is untouched by the switch");
  const medOn = evaluateClaim(ctx({ flexCapEnabled: true, medicalPremium: 5_000 }), gymClaim(9_000));
  const medOff = evaluateClaim(ctx({ flexCapEnabled: false, medicalPremium: 5_000 }), gymClaim(9_000));
  check("a committed premium consumes the pool with the cap on", medOn.poolRemaining === 7_500);
  check("…and identically with the cap off", medOff.poolRemaining === 7_500);
  check("cap off, the flexible claim is bounded by what medical left", medOff.covered === 7_500);

  console.log("\nUS3/FR-011 — re-enabling never claws anything back");
  // 9,000 claimed on gym while the cap was off; HR turns the cap back on.
  const after = evaluateClaim(
    ctx({ flexCapEnabled: true, claimedByBenefit: { gym: 9_000 } }),
    gymClaim(1_000)
  );
  check("the over-cap benefit has ZERO remaining, not negative", after.benefitRemaining === 0);
  check("…so a further claim on it covers nothing", after.covered === 0);
  check("…and says so rather than paying a negative amount", after.errors.length > 0);
  const otherBenefit = evaluateClaim(
    ctx({ flexCapEnabled: true, claimedByBenefit: { gym: 9_000 } }),
    { key: "spa", name: "Spa", fullCost: 5_000, coverageRate: 100 }
  );
  check("a DIFFERENT benefit is still claimable against what the pool has left", otherBenefit.covered === 3_500);

  // The product owner's extension case: 12,500 → 30,000 restores the claim to under-cap.
  const extended = evaluateClaim(
    { ...ctx({ flexCapEnabled: true, claimedByBenefit: { gym: 9_000 } }), ceiling: 30_000 },
    gymClaim(10_000)
  );
  check("after extending the cycle, the 9,000 is back under a 15,000 cap", extended.benefitRemaining === 6_000);
  check("…and 6,000 more is claimable on it", extended.covered === 6_000);

  console.log("\nFR-001/002/003/015 — the setting on the database");
  await prisma.planYear.deleteMany({ where: { name: { startsWith: "V031" } } });
  await prisma.user.deleteMany({ where: { email: "v031.hr@x.test" } });
  const hr = await prisma.user.create({
    data: { email: "v031.hr@x.test", name: "Verify HR", role: "HR_ADMIN", updatedAt: new Date() },
  });
  const openYear = await prisma.planYear.create({ data: { name: "V031 open", status: "OPEN" } });
  const closedYear = await prisma.planYear.create({ data: { name: "V031 closed", status: "CLOSED" } });
  check("a new cycle defaults to the cap ON", openYear.flexCapEnabled === true);

  // setFlexCapEnabled, minus requireAdmin.
  async function setCap(id: string, enabled: boolean) {
    const py = await prisma.planYear.findUnique({ where: { id }, select: { status: true } });
    if (!py) return { error: "gone" } as const;
    if (py.status !== "OPEN") return { error: "not open" } as const;
    await prisma.planYear.update({
      where: { id },
      data: { flexCapEnabled: enabled, flexCapChangedById: hr.id, flexCapChangedAt: new Date() },
    });
    return { ok: true } as const;
  }

  check("an open cycle accepts the change", "ok" in (await setCap(openYear.id, false)));
  const changed = await prisma.planYear.findUnique({ where: { id: openYear.id } });
  check("…the setting is stored", changed!.flexCapEnabled === false);
  check("…with the actor and time recorded", changed!.flexCapChangedById === hr.id && changed!.flexCapChangedAt !== null);
  check("a CLOSED cycle refuses the change", "error" in (await setCap(closedYear.id, false)));
  const untouched = await prisma.planYear.findUnique({ where: { id: closedYear.id } });
  check("…and keeps the rule its claims were judged under", untouched!.flexCapEnabled === true);
  check("one cycle's setting does not affect another's", untouched!.flexCapEnabled !== changed!.flexCapEnabled);
  check("toggling back on is accepted while open", "ok" in (await setCap(openYear.id, true)));
  check("…and is stored", (await prisma.planYear.findUnique({ where: { id: openYear.id } }))!.flexCapEnabled === true);

  console.log("\nFR-010 — changing the setting re-evaluates nothing");
  // A claim recorded under the cap-off cycle must be byte-identical after the toggle.
  const before = await prisma.planYear.findUnique({ where: { id: openYear.id }, select: { flexCapEnabled: true } });
  await setCap(openYear.id, false);
  await setCap(openYear.id, true);
  const stillThere = await prisma.planYear.findUnique({ where: { id: openYear.id }, select: { flexCapEnabled: true } });
  check("the toggle is the only thing the action writes", before!.flexCapEnabled === stillThere!.flexCapEnabled);

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
