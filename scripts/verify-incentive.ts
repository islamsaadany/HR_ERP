/**
 * Verification harness for the Incentive Scheme engine.
 *
 * Reproduces the figures in "Team Benefits System v1.5", Appendix A (H1 2026
 * actuals), straight from the documented Gross Profit + contribution inputs.
 * Run: `npx tsx scripts/verify-incentive.ts`
 *
 * This is a proof of correctness for the money rules — not a unit-test suite.
 */
import {
  computeAssignment,
  envelope,
  profitShareEntitlement,
  money,
  type AssignmentInput,
} from "../src/lib/incentive/rules";

let pass = 0;
let fail = 0;
function check(label: string, got: number, want: number) {
  const ok = money(got) === money(want);
  (ok ? pass++ : fail++, console.log(`${ok ? "✓" : "✗ FAIL"}  ${label}: got ${money(got)}  want ${want}`));
}

// A margin-passing assignment expressed directly from its Gross Profit
// (revenue = GP, directCost = 0 → 100% margin, clears the 70% gate).
function fromGP(client: string, gp: number, over: Partial<AssignmentInput> = {}): AssignmentInput {
  return {
    client,
    type: "RET",
    revenue: gp,
    directCost: 0,
    leadName: "Lead",
    leadEligible: true,
    bd: "Lead",
    leadSource: "Lead",
    payable: true,
    contributions: [{ name: "Lead", share: 1 }],
    salaries: {},
    ...over,
  };
}

console.log("\n— Appendix A: envelope = GP × 3% —");
const gps: Array<[string, number, number]> = [
  ["El Abd", 1_619_472, 48_584.16],
  ["Wander", 1_514_995, 45_449.85],
  ["Raya Holding", 585_000, 17_550.0],
  ["Imtenan", 506_991, 15_209.73],
  ["Alasila CX", 348_076, 10_442.28],
  ["Sportify", 144_622, 4_338.66],
  ["JRNY", 113_682, 3_410.46],
  ["Bashar Soft", 64_722, 1_941.66],
];
for (const [c, gp, want] of gps) check(`${c} envelope`, envelope(gp, 0), want);

console.log("\n— Appendix A: lead fee = envelope × (1 − deduction) —");
// El Abd — full contributor breakdown from the documented shares + salaries.
const elabd = computeAssignment(
  fromGP("El Abd", 1_619_472, {
    leadName: "Islam",
    bd: "Islam",
    leadSource: "Islam",
    contributions: [
      { name: "Islam", share: 0.075 }, // Lead — recorded, earns nothing
      { name: "Momen", share: 0.634 },
      { name: "Aley", share: 0.237 },
      { name: "Noran", share: 0.054 },
    ],
    salaries: { Islam: 150_000, Momen: 90_000, Aley: 85_000, Noran: 25_000 },
  })
);
check("El Abd total deduction", elabd.totalDeduction, 0.4);
check("El Abd lead fee (Islam)", elabd.leadFee, 29_150.5);
check("El Abd Momen payment", elabd.contributors.find((c) => c.name === "Momen")!.payment, 14_575.25);
check("El Abd Aley payment", elabd.contributors.find((c) => c.name === "Aley")!.payment, 4_858.42);
check("El Abd Noran payment", elabd.contributors.find((c) => c.name === "Noran")!.payment, 0);
check("El Abd firm retained", elabd.firmRetained, 0);

// Wander, JRNY — single-contributor 10% deductions.
check("Wander lead fee", computeAssignment(fromGP("Wander", 1_514_995, {
  leadName: "Lead", contributions: [{ name: "Lead", share: 0.778 }, { name: "X", share: 0.222 }],
  salaries: { X: 1_000_000 }, // 22.2% → 10% tier; high salary keeps focus on the lead fee
})).leadFee, 40_904.86);
check("JRNY lead fee", computeAssignment(fromGP("JRNY", 113_682, {
  leadName: "Lead", contributions: [{ name: "Lead", share: 0.61 }, { name: "Y", share: 0.39 }],
  salaries: { Y: 1_000_000 },
})).leadFee, 3_069.41);

console.log("\n— Appendix A: contributor floor (Raya Holding) —");
// Islam contributes 22% (→10% tier) on a small project; allocation 1,755 falls
// below his 7,500 floor → paid 0, firm keeps 1,755.
const raya = computeAssignment(
  fromGP("Raya Holding", 585_000, {
    type: "PRJ",
    leadName: "Omar",
    contributions: [{ name: "Omar", share: 0.78 }, { name: "Islam", share: 0.22 }],
    salaries: { Omar: 50_000, Islam: 150_000 },
  })
);
check("Raya Holding lead fee (Omar)", raya.leadFee, 15_795);
const islamOnRaya = raya.contributors.find((c) => c.name === "Islam")!;
check("Raya Holding Islam allocation", islamOnRaya.allocation, 1_755);
check("Raya Holding Islam payment", islamOnRaya.payment, 0);
check("Raya Holding firm retained", raya.firmRetained, 1_755);

console.log("\n— Appendix A: the 70% margin gate (Raya Trade) —");
// GP 222,556 on 410,000 revenue = 54.3% margin → below the gate → envelope 0.
const rayaTrade = computeAssignment(
  fromGP("Raya Trade", 0, { revenue: 410_000, directCost: 187_444, leadName: "Islam" })
);
check("Raya Trade margin %", Math.round(rayaTrade.grossMarginPct * 1000) / 10, 54.3);
check("Raya Trade envelope", rayaTrade.envelope, 0);
check("Raya Trade lead fee", rayaTrade.leadFee, 0);

console.log("\n— Part 3: Profit Share table (proposed) —");
check("Profit share @20%", profitShareEntitlement(0.2, 1) , 0.67);
check("Profit share @25%", profitShareEntitlement(0.25, 1), 0.83);
check("Profit share @30%", profitShareEntitlement(0.3, 1), 1);
check("Profit share @12% (below floor)", profitShareEntitlement(0.12, 1), 0);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
