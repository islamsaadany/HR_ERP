/**
 * Proof for spec 012 (company coverage rates) — the covered / out-of-pocket split.
 *
 * This file used to prove the 50% cap, the pool ceiling and medical's cap exemption too, through
 * `evaluateBasket`. Spec 018 retired the basket, and those rules now live in `evaluateClaim` and
 * are proven in `tests/pool-rules.test.ts` (flexCap, clampCovered, evaluateClaim, poolCeiling) —
 * so the basket half was removed rather than rewritten. What is left is the half nothing else
 * covers: the arithmetic that decides how much of a bill the company pays.
 *
 * Runs with no database. The migration (023) + backfill are proven separately against a throwaway
 * Postgres — see the shell steps in that spec's quickstart.
 */
import { coveredAmount, outOfPocket, clampRate } from "../src/lib/benefits/coverage";
import { MAX_SELECT_FULL_TIME, MAX_SELECT_PART_TIME } from "../src/lib/benefits/rules";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log("Coverage math (US1, DC-2):");
check("gym 80% of 10,000 → covered 8,000", coveredAmount(10000, 80) === 8000);
check("gym 80% of 10,000 → out-of-pocket 2,000", outOfPocket(10000, 80) === 2000);
check("100% of 3,000 → covered 3,000 / oop 0", coveredAmount(3000, 100) === 3000 && outOfPocket(3000, 100) === 0);
check("50% of 12,000 → covered 6,000 / oop 6,000", coveredAmount(12000, 50) === 6000 && outOfPocket(12000, 50) === 6000);
check("DC-2: 80% of 9,000 → 7,200 (non-1,000, not re-rounded)", coveredAmount(9000, 80) === 7200);
check("rate clamped to 0–100", clampRate(150) === 100 && clampRate(-5) === 0);
check("0% coverage → nothing drawn", coveredAmount(10000, 0) === 0);
check("covered + out-of-pocket always equals the bill", [
  [10000, 80], [3000, 100], [12000, 50], [9000, 80], [7777, 33], [1, 50],
].every(([cost, rate]) => coveredAmount(cost, rate) + outOfPocket(cost, rate) === cost));

console.log("Selection limits (US2.3/2.4):");
check("full-time limit = 5", MAX_SELECT_FULL_TIME === 5);
check("part-time limit = 3", MAX_SELECT_PART_TIME === 3);

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
