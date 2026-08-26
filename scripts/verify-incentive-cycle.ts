/**
 * End-to-end check: the uploaded sample sheets → parse → computeCycle.
 * Confirms flag-and-block and the payout figures that reconcile with Appendix A.
 * Run: `npx tsx scripts/verify-incentive-cycle.ts`
 */
import { parsePeople, parseAssignments, parseContributions } from "../src/lib/incentive/import";
import { computeCycle } from "../src/lib/incentive/compute";

const people = `name,role,net_monthly_salary,start_date,eligible_to_lead,utilization
Islam,Senior Consultant,150000,2024-01-01,yes,0.66
Galal,Consultant,60000,2024-01-01,yes,0.63
Omar,Consultant,50000,2024-01-01,yes,0.90
Aley,Consultant,85000,2024-01-01,yes,0.63
Momen,Consultant,90000,2024-01-01,yes,0.75
Essam,Associate,50000,2024-01-01,No,0.3
Noran,Analyst,25000,2024-07-01,No,0.25`;

const assignments = `client,type,cycle,lead,bd,lead_source,revenue,direct_cost,vendor_cost,markup_pct,start_date,close_date
El Abd,RET,H1-2026,Islam,Islam,Islam,2250000,630528,0,0,2026-01-01,Ongoing
Wander,RET,H1-2026,Galal,Islam,Islam,990000,270101,0,0,2026-01-01,Ongoing
Imtenan,RET,H1-2026,Galal,Islam,Islam,600000,93009,0,0,2026-01-01,Ongoing
Alasila CX,RET,H1-2026,Aley,Aley,Aley,405941,57865,0,0,2026-01-01,Ongoing
Raya Trade,RET,H1-2026,Islam,Omar,Islam,410000,187444,0,0,2026-01-01,Ongoing
Beverages Expert,PRJ,H1-2026,Islam,Islam,Islam,398396,92911,0,0,2026-01-01,In Progress
Sportify,PRJ,H1-2026,Omar,Omar,Islam,167400,22778,0,0,2026-01-01,2026-06-20
JRNY,PRJ,H1-2026,Islam,Islam,Islam,160650,46968,0,0,2026-01-01,2026-06-20
Bashar Soft,PRJ,H1-2026,Islam,Islam,Islam,85000,20278,0,0,2026-01-01,2026-06-20
Forefront Trading,PRJ,H1-2026,Omar,Omar,Islam,649000,Pending,100000,0.1,2026-01-01,In Progress
Melanin,PRJ,H1-2026,Omar,Omar,Islam,368900,Pending,0,0,2026-01-01,In Progress
Raya Holding,PRJ,H1-2026,Omar,Omar,Islam,650000,65000,0,0,2026-01-01,2026-03-15`;

const contributions = `client,Islam,Momen,Galal,Aley,Omar,Essam,Noran
El Abd,0.07,0.59,,0.22,,,0.05
Wander,0.14,,0.6,0.22,,,0.03
Imtenan,0.05,0.09,0.86,,,,
Alasila CX,,,,1,,,
Raya Trade,0.15,0.11,,,0.7,,0.03
Sportify,,,,,0.86,,0.14
JRNY,0.5,,0.39,,0.04,,0.07
Bashar Soft,1,,,,,,
Raya Holding,0.22,,,,0.78,,`;

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  (ok ? pass++ : fail++, console.log(`${ok ? "✓" : "✗ FAIL"}  ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
}

const pp = parsePeople(people);
const pa = parseAssignments(assignments);
const pc = parseContributions(contributions);
console.log("parse issues:", [...pp.issues, ...pa.issues, ...pc.issues]);

const rep = computeCycle(
  pp.rows,
  pa.rows,
  pc.rows,
  { revenue: 6514087, deliveryCost: 2477345.335, totalExpenses: 3981202.77 }
);

const find = (client: string) => rep.assignments.find((a) => a.client === client);

console.log("\n— flag-and-block —");
check("El Abd is blocked (93%)", rep.blocked.some((b) => b.client === "El Abd"), true);
check("Beverages Expert not payable", rep.notPayable.some((n) => n.client === "Beverages Expert"), true);
check("Melanin not payable", rep.notPayable.some((n) => n.client === "Melanin"), true);

console.log("\n— payouts that match Appendix A —");
check("Imtenan envelope", find("Imtenan")?.envelope, 15209.73);
check("Imtenan lead fee (Galal, no deduction)", find("Imtenan")?.leadFee, 15209.73);
check("Bashar Soft lead fee", find("Bashar Soft")?.leadFee, 1941.66);
check("Sportify lead fee", find("Sportify")?.leadFee, 4338.66);
check("JRNY lead fee (10% deduction)", find("JRNY")?.leadFee, 3069.41);
check("JRNY Galal floored to £0", find("JRNY")?.contributors.find((c) => c.name === "Galal")?.payment, 0);
check("Raya Holding lead fee (Omar)", find("Raya Holding")?.leadFee, 15795);
check("Raya Holding Islam payment floored", find("Raya Holding")?.contributors.find((c) => c.name === "Islam")?.payment, 0);
check("Raya Holding firm retained", find("Raya Holding")?.firmRetained, 1755);

console.log("\n— the 70% gate —");
check("Raya Trade envelope 0 (54.3%)", find("Raya Trade")?.envelope, 0);

console.log("\n— structure —");
check("cost recovery has rows", rep.costRecovery.length, 7);
check("firm P&L present", rep.firm != null, true);
check("Bashar contribution parsed (Islam=1)", pc.rows.find((c) => c.client === "Bashar Soft")?.share, 1);

console.log("\n— Business Partner Fee by person (2026-08-26) —");
// The new per-person table must be the SAME money as the per-client one, only gathered
// by who earned it. If these two ever disagree, one of them is lying to the operator.
const bpf = rep.businessPartnerFeeByPerson;
const bpfSum = Math.round(bpf.reduce((s, p) => s + p.amount, 0) * 100) / 100;
check(
  "per-person total = lead fees + contributor payments",
  bpfSum,
  Math.round((rep.totals.leadFees + rep.totals.contributorPayments) * 100) / 100
);
check(
  "every listed person earned something",
  bpf.every((p) => p.amount > 0),
  true
);
check(
  "each person's lines add up to their own total",
  bpf.every((p) => Math.abs(p.lines.reduce((s, l) => s + l.amount, 0) - p.amount) < 0.005),
  true
);
check("sorted largest first", bpf.every((p, i) => i === 0 || bpf[i - 1].amount >= p.amount), true);
check(
  "a person's figure matches their row in the by-person table",
  bpf.every((p) => {
    const row = rep.byPerson.find((b) => b.name === p.name);
    return row != null && Math.abs(row.total - p.amount) < 0.005;
  }),
  true
);
// Omar led Raya Holding, so he must carry a Lead line for it; Islam's contribution there
// floored to zero, so his line must still be PRESENT and marked, not silently dropped.
check(
  "Omar has a Lead line for Raya Holding",
  bpf.find((p) => p.name === "Omar")?.lines.some((l) => l.role === "lead" && l.client === "Raya Holding"),
  true
);
check(
  "Islam's floored Raya Holding contribution is still shown",
  bpf.find((p) => p.name === "Islam")?.lines.some(
    (l) => l.role === "contributor" && l.client === "Raya Holding" && l.flooredToZero && l.amount === 0
  ),
  true
);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
