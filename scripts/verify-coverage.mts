/**
 * Proof for spec 012 (company coverage rates). Pure coverage + rules math (the money-critical
 * part), exercising the spec's acceptance scenarios. The migration (023) + backfill are proven
 * separately against a throwaway Postgres (see the accompanying shell steps in quickstart.md).
 */
import { coveredAmount, outOfPocket, clampRate } from "../src/lib/benefits/coverage";
import { evaluateBasket, MAX_SELECT_FULL_TIME, MAX_SELECT_PART_TIME } from "../src/lib/benefits/rules";

let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

const medRate = { self: 8000, spouse: 8000, childUnder18: 4500, child18Plus: 8000 };
const noMed = { selected: false, spouse: false, childrenUnder18: 0, children18Plus: 0 };

console.log("Coverage math (US1, DC-2):");
check("gym 80% of 10,000 → covered 8,000", coveredAmount(10000, 80) === 8000);
check("gym 80% of 10,000 → out-of-pocket 2,000", outOfPocket(10000, 80) === 2000);
check("100% of 3,000 → covered 3,000 / oop 0", coveredAmount(3000, 100) === 3000 && outOfPocket(3000, 100) === 0);
check("50% of 12,000 → covered 6,000 / oop 6,000", coveredAmount(12000, 50) === 6000 && outOfPocket(12000, 50) === 6000);
check("DC-2: 80% of 9,000 → 7,200 (non-1,000, not re-rounded)", coveredAmount(9000, 80) === 7200);
check("rate clamped to 0–100", clampRate(150) === 100 && clampRate(-5) === 0);
check("0% coverage → nothing drawn", coveredAmount(10000, 0) === 0);

console.log("Selection limits (US2.3/2.4):");
check("full-time limit = 5", MAX_SELECT_FULL_TIME === 5);
check("part-time limit = 3", MAX_SELECT_PART_TIME === 3);

console.log("Pool total on covered (US1.4):");
const r1 = evaluateBasket({
  employmentType: "FULL_TIME", ceiling: 30000,
  lines: [
    { key: "gym", name: "Gym", cost: 10000, coverageRate: 80 },       // covered 8,000
    { key: "mobile", name: "Mobile", cost: 12000, coverageRate: 50 }, // covered 6,000
  ],
  medical: noMed, medicalRate: medRate,
});
check("pool total = Σ covered (8,000 + 6,000 = 14,000), not Σ cost", r1.total === 14000);
check("remaining = 30,000 − 14,000 = 16,000", r1.remaining === 16000);
check("no errors within pool + cap", r1.errors.length === 0);

console.log("FT 50% cap on covered share (US2.1):");
const r2 = evaluateBasket({
  employmentType: "FULL_TIME", ceiling: 30000,
  lines: [{ key: "schooling", name: "Schooling", cost: 20000, coverageRate: 80 }], // covered 16,000 > 15,000
  medical: noMed, medicalRate: medRate,
});
check("covered 16,000 > 50% cap (15,000) → error", r2.errors.some((e) => /50%/.test(e)));
const r2b = evaluateBasket({
  employmentType: "FULL_TIME", ceiling: 30000,
  lines: [{ key: "schooling", name: "Schooling", cost: 18000, coverageRate: 80 }], // covered 14,400 ≤ 15,000
  medical: noMed, medicalRate: medRate,
});
check("covered 14,400 ≤ cap → no cap error", !r2b.errors.some((e) => /50%/.test(e)));

console.log("Part-time exempt from 50% cap (US2.3):");
const r3 = evaluateBasket({
  employmentType: "PART_TIME", ceiling: 20000,
  lines: [{ key: "schooling", name: "Schooling", cost: 20000, coverageRate: 80 }], // covered 16,000 > 10,000 (half)
  medical: noMed, medicalRate: medRate,
});
check("part-time: no 50% cap error", !r3.errors.some((e) => /50%/.test(e)));
check("part-time maxSelect = 3", r3.maxSelect === 3);

console.log("Over-pool on covered total (US2.2):");
const r4 = evaluateBasket({
  employmentType: "FULL_TIME", ceiling: 30000,
  lines: [
    { key: "a", name: "A", cost: 20000, coverageRate: 80 }, // 16,000
    { key: "b", name: "B", cost: 25000, coverageRate: 80 }, // 20,000  → total 36,000 > 30,000
  ],
  medical: noMed, medicalRate: medRate,
});
check("Σ covered 36,000 > ceiling → over-pool error", r4.errors.some((e) => /Over your pool/.test(e)));

console.log("Medical 100% covered, cap-exempt (US2 / FR-C06):");
const r5 = evaluateBasket({
  employmentType: "FULL_TIME", ceiling: 30000,
  lines: [],
  medical: { selected: true, spouse: true, childrenUnder18: 2, children18Plus: 0 }, // 8000+8000+9000 = 25,000
  medicalRate: medRate,
});
check("medical premium = covered = pool draw (25,000)", r5.medicalAmount === 25000 && r5.total === 25000);
check("medical > 50% cap allowed (no cap error)", !r5.errors.some((e) => /50%/.test(e)));

console.log(`\n${pass}/${pass + fail} checks passed.`);
if (fail > 0) process.exit(1);
