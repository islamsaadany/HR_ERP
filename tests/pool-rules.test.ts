/**
 * The money rules that decide what an employee may spend — pure, no database.
 *
 * These exist because the pool ceiling was broken in production (2026-08-20: one employee
 * 2,093 over a 10,000 pool) and the proof that it now holds lived only in a session transcript.
 * If a future change loosens one of these, this file is what says so.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { EmploymentType, TenureBand } from "@prisma/client";
import { poolCeiling, spendable, type PoolState } from "@/lib/benefits/pool";
import { evaluateClaim, clampCovered, flexCap, type AllowanceContext } from "@/lib/benefits/rules";

const CEILINGS: Record<string, number> = {
  "FULL_TIME|BAND_6MO_2Y": 15000, "FULL_TIME|BAND_2_4Y": 22500,
  "PART_TIME|BAND_6MO_2Y": 16000, "PART_TIME|BAND_2_4Y": 20000,
};
const lookup = (t: EmploymentType, b: TenureBand) => CEILINGS[`${t}|${b}`] ?? null;
const FULL_YEAR = { start: new Date("2026-01-01"), end: new Date("2026-12-31") };
const HALF_YEAR = { start: new Date("2026-07-01"), end: new Date("2026-12-31") };

describe("poolCeiling — one derivation, used by the report AND every write", () => {
  test("banded employee, full-year cycle: the configured amount", () => {
    const r = poolCeiling({ employmentType: "PART_TIME", startDate: new Date("2023-02-01") }, lookup, FULL_YEAR);
    assert.equal(r.ceiling, 20000);
    assert.equal(r.proratedFrom, null);
  });

  test("banded employee, half-year cycle: prorated to the cycle, and says what from", () => {
    const r = poolCeiling({ employmentType: "PART_TIME", startDate: new Date("2023-02-01") }, lookup, HALF_YEAR);
    assert.equal(r.ceiling, 10000, "a six-month cycle grants half the annual pool");
    assert.equal(r.proratedFrom, 20000);
  });

  test("no employment type / no start date / no configured ceiling: no pool, with the reason", () => {
    assert.equal(poolCeiling({ employmentType: null, startDate: new Date("2023-02-01") }, lookup, FULL_YEAR).reason,
      "no employment type set");
    assert.equal(poolCeiling({ employmentType: "PART_TIME", startDate: null }, lookup, FULL_YEAR).reason,
      "no start date on file");
    assert.equal(poolCeiling({ employmentType: "PART_TIME", startDate: new Date("2023-02-01") }, () => null, FULL_YEAR).reason,
      "no pool ceiling configured");
  });

  test("under 3 months: nothing has unlocked", () => {
    const justJoined = new Date();
    justJoined.setMonth(justJoined.getMonth() - 1);
    const r = poolCeiling({ employmentType: "FULL_TIME", startDate: justJoined }, lookup, FULL_YEAR);
    assert.equal(r.ceiling, null);
    assert.equal(r.reason, "under 3 months — nothing unlocked yet");
  });

  // 2026-08-23: a sub-6-month employee on a six-month cycle was handed the WHOLE annual ceiling —
  // double their banded colleagues — because that branch prorated by the MID-JOINER fraction,
  // which is 1 whenever the three-month mark falls on or before the cycle's first day. The cycle
  // is one scale for everybody; only the 3-month vs 6-month DOOR differs.
  test("under six months, half-year cycle: scaled to the cycle exactly like a banded colleague", () => {
    const now = new Date();
    // Joined five months ago: no tenure band yet, but medical unlocked three months in — two
    // months before this cycle opened, so the mid-joiner fraction would say "full year".
    const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 15);
    const window = {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth() + 5, 0), // six whole months
    };
    const newcomer = poolCeiling({ employmentType: "FULL_TIME", startDate }, lookup, window);
    assert.equal(newcomer.band, null, "five months of service is still below the first band");
    assert.equal(newcomer.ceiling, 7500, "half a cycle, half the entry-tier pool — not the full 15,000");
    assert.equal(newcomer.proratedFrom, 15000, "and the report must be able to say what it was cut from");

    const colleague = poolCeiling(
      { employmentType: "FULL_TIME", startDate: new Date(now.getFullYear() - 1, now.getMonth(), 15) },
      lookup,
      window
    );
    assert.equal(
      colleague.ceiling! / (CEILINGS["FULL_TIME|BAND_6MO_2Y"] ?? 1),
      newcomer.ceiling! / (CEILINGS["FULL_TIME|BAND_6MO_2Y"] ?? 1),
      "the newcomer and the banded colleague are cut by the same fraction of their own tier"
    );
  });

  test("a ceiling is never negative and never above the configured annual amount", () => {
    for (const w of [FULL_YEAR, HALF_YEAR, null]) {
      for (const s of ["2015-01-01", "2021-06-15", "2024-03-01", "2026-05-01"]) {
        for (const t of ["FULL_TIME", "PART_TIME"] as EmploymentType[]) {
          const r = poolCeiling({ employmentType: t, startDate: new Date(s) }, lookup, w);
          if (r.ceiling == null) continue;
          assert.ok(r.ceiling >= 0, `${t}/${s}: negative ceiling`);
          assert.ok(r.ceiling <= 22500, `${t}/${s}: ceiling above any configured annual amount`);
        }
      }
    }
  });
});

describe("spendable — an overdrawn pool offers nothing, and is not mistaken for an empty one", () => {
  const base: PoolState = {
    ceiling: 10000, reason: null, band: "BAND_2_4Y", proratedFrom: null,
    medical: 0, flex: 0, used: 0, remaining: 10000, over: false, exception: null,
  };
  test("normal pool", () => assert.equal(spendable(base), 10000));
  test("exactly spent", () => assert.equal(spendable({ ...base, used: 10000, remaining: 0 }), 0));
  test("OVERDRAWN offers zero, and remaining stays negative so the report can show it", () => {
    const over = { ...base, medical: 6093, flex: 6000, used: 12093, remaining: -2093, over: true };
    assert.equal(spendable(over), 0, "an overdrawn pool must not hand out money");
    assert.equal(over.remaining, -2093, "remaining must stay SIGNED — flooring it is what hid the overrun");
  });
  test("no ceiling means nothing may be spent", () => {
    assert.equal(spendable({ ...base, ceiling: null, remaining: null }), 0);
  });
});

describe("flexCap — the 50% per-benefit rule and its per-cycle switch", () => {
  test("on: half the ceiling", () => assert.equal(flexCap(10000, true), 5000));
  test("off: the POOL becomes the limit, never Infinity", () => {
    assert.equal(flexCap(10000, false), 10000);
    assert.ok(Number.isFinite(flexCap(10000, false)), "an unbounded cap would let one benefit take everything and more");
  });
});

describe("clampCovered — a claim is paid down to what is left, never past it", () => {
  test("within both limits: paid in full", () => {
    assert.deepEqual(clampCovered(3000, 5000, 8000), { covered: 3000, clampedBy: null });
  });
  test("over the pool: paid the remainder, named as pool", () => {
    assert.deepEqual(clampCovered(6000, 10000, 3907), { covered: 3907, clampedBy: "pool" });
  });
  test("over the benefit cap: paid the remainder, named as benefit", () => {
    assert.deepEqual(clampCovered(6000, 5000, 8000), { covered: 5000, clampedBy: "benefit" });
  });
  test("nothing left: zero, never negative", () => {
    assert.equal(clampCovered(6000, 0, 0).covered, 0);
    assert.equal(clampCovered(6000, -500, -500).covered, 0, "a negative remainder must not become a negative payout");
  });
});

describe("evaluateClaim — the ceiling holds whatever the claim asks for", () => {
  const ctx = (over: Partial<AllowanceContext> = {}): AllowanceContext => ({
    ceiling: 10000, medicalPremium: 0, claimedByBenefit: {},
    employmentType: "PART_TIME", flexCapEnabled: false, ...over,
  });
  const gym = { key: "gym", name: "Gym", fullCost: 6000, coverageRate: 100 };

  test("Yosra's cycle: 6,093 medical already charged clamps a 6,000 claim to 3,907", () => {
    const r = evaluateClaim(ctx({ medicalPremium: 6093 }), gym);
    assert.equal(r.covered, 3907);
    assert.equal(r.clampedBy, "pool");
    assert.equal(r.poolRemaining, 3907);
  });

  test("a claim never takes a pool past its ceiling, and never deepens an existing overrun", () => {
    for (const medical of [0, 2000, 6093, 9999, 10000]) {
      for (const alreadyClaimed of [0, 1000, 4000]) {
        const used = medical + alreadyClaimed;
        const r = evaluateClaim(ctx({ medicalPremium: medical, claimedByBenefit: { gym: alreadyClaimed } }), gym);
        const headroom = Math.max(0, 10000 - used);
        assert.ok(
          r.covered <= headroom,
          `medical ${medical} + claimed ${alreadyClaimed} leaves ${headroom}, but the claim paid ${r.covered}`
        );
        // A pool already overdrawn (some rows predate the 2026-08-20 fix) must pay NOTHING,
        // rather than treating the shortfall as spare room.
        if (used >= 10000) {
          assert.equal(r.covered, 0, `used ${used} is at or past the ceiling, so nothing may be paid`);
        }
      }
    }
  });

  test("a fully used pool refuses rather than paying zero silently", () => {
    const r = evaluateClaim(ctx({ medicalPremium: 10000 }), gym);
    assert.equal(r.covered, 0);
    assert.ok(r.errors.length > 0, "an employee with nothing left must be told, not handed a zero");
  });

  test("the 50% cap binds when the cycle has it on", () => {
    const r = evaluateClaim(ctx({ flexCapEnabled: true }), gym);
    assert.equal(r.cap, 5000);
    assert.equal(r.covered, 5000, "6,000 asked against a 5,000 per-benefit cap pays 5,000");
    assert.equal(r.clampedBy, "benefit");
  });

  test("a receipt of zero or nonsense is rejected, not guessed at", () => {
    for (const bad of [0, -100, NaN]) {
      assert.ok(evaluateClaim(ctx(), { ...gym, fullCost: bad }).errors.length > 0, `fullCost ${bad} should be refused`);
    }
  });
});
