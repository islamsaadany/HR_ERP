/**
 * Throwaway-DB proof for releasing a cycle's incentive payments (spec 009 FR-006g).
 *
 * The screens are behind a session, so what this drives is the shipped derivations they
 * are built from — `payoutLines`, `isReleasable`, `releaseIncentivePayouts`,
 * `availablePayables`, `releasedFiguresWouldBreak`, and the message checks — over real
 * rows in a real Postgres.
 *
 * Every fixture string is namespaced (REL…) because these scripts share one database.
 *
 * Run:
 *   POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB npx tsx scripts/verify-incentive-release.mts
 */
import { PrismaClient } from "@prisma/client";
import { loadCycleReport } from "../src/lib/incentive/load";
import { payoutLines, isReleasable, releasedFiguresBroken } from "../src/lib/incentive/payouts";
import { releaseIncentivePayouts } from "../src/lib/incentive/persist";
import { releasedFiguresWouldBreak } from "../src/lib/incentive/released-guard";
import { availablePayables } from "../src/lib/finance/payables";
import { releasableUnitIds, canReleaseForUnit } from "../src/lib/finance/unit-heads";
import {
  INCENTIVE_MESSAGE_DEFAULTS,
  checkIncentiveMessage,
  fillMessage,
  resolveIncentiveMessage,
} from "../src/lib/email/incentive-message";

const prisma = new PrismaClient();
let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ✓ ${label}`); }
  else { failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}
const eq = (label: string, a: unknown, b: unknown) =>
  check(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

const LABEL = "REL-TEST-CYCLE";
const DOM = "@rel-test.example";

async function main() {
  // ── Clean slate for this script's own rows ────────────────────────────────
  await prisma.incentiveCycle.deleteMany({ where: { label: LABEL } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOM } } });
  await prisma.businessUnit.deleteMany({ where: { name: { startsWith: "REL " } } });

  const unitA = await prisma.businessUnit.create({ data: { name: "REL Consulting", shortName: "RC" } });
  const unitB = await prisma.businessUnit.create({ data: { name: "REL Studio", shortName: "RS" } });

  const mk = (name: string, employeeId: string | null, unitId: string | null) =>
    prisma.user.create({
      data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}${DOM}`, name, employeeId, businessUnitId: unitId, status: "ACTIVE" },
    });

  const lead = await mk("REL Dalia", "REL-001", unitA.id);          // clean match
  const mid = await mk("REL Karim", "REL-002", unitA.id);           // clean match
  const other = await mk("REL Yara", "REL-003", unitB.id);          // a second unit
  await mk("REL Twin One", "REL-DUP", unitA.id);                    // two accounts …
  await mk("REL Twin Two", "REL-DUP", unitB.id);                    // … one Employee ID
  const noUnit = await mk("REL Nomad", "REL-004", null);            // matched, no unit
  const head = await mk("REL Head", "REL-999", unitA.id);           // the releaser

  const cycle = await prisma.incentiveCycle.create({ data: { label: LABEL } });
  await prisma.incentivePerson.createMany({
    data: [
      { cycleId: cycle.id, name: "REL Dalia", employeeId: "REL-001", netMonthlySalary: 90000 },
      { cycleId: cycle.id, name: "REL Karim", employeeId: "REL-002", netMonthlySalary: 60000 },
      { cycleId: cycle.id, name: "REL Yara", employeeId: "REL-003", netMonthlySalary: 40000 },
      { cycleId: cycle.id, name: "REL Ghost", employeeId: "REL-NOPE", netMonthlySalary: 30000 },
      { cycleId: cycle.id, name: "REL Twins", employeeId: "REL-DUP", netMonthlySalary: 30000 },
      { cycleId: cycle.id, name: "REL Nomad", employeeId: "REL-004", netMonthlySalary: 30000 },
      { cycleId: cycle.id, name: "REL NoId", employeeId: null, netMonthlySalary: 30000 },
    ],
  });
  // Two payable retainers, so several people earn a fee and one earns commission.
  await prisma.incentiveAssignment.createMany({
    data: [
      { cycleId: cycle.id, client: "REL Alpha", type: "RET", lead: "REL Dalia", bd: "REL Dalia", leadSource: "REL Dalia", revenue: 1800000, directCost: 400000, status: "ongoing" },
      { cycleId: cycle.id, client: "REL Beta", type: "RET", lead: "REL Karim", bd: "REL Karim", leadSource: "REL Karim", revenue: 900000, directCost: 180000, status: "ongoing" },
      { cycleId: cycle.id, client: "REL Gamma", type: "RET", lead: "REL Yara", bd: "REL Yara", leadSource: "REL Yara", revenue: 600000, directCost: 120000, status: "ongoing" },
      { cycleId: cycle.id, client: "REL Delta", type: "RET", lead: "REL Ghost", bd: "REL Ghost", leadSource: "REL Ghost", revenue: 500000, directCost: 100000, status: "ongoing" },
      { cycleId: cycle.id, client: "REL Eps", type: "RET", lead: "REL Twins", bd: "REL Twins", leadSource: "REL Twins", revenue: 500000, directCost: 100000, status: "ongoing" },
      { cycleId: cycle.id, client: "REL Zeta", type: "RET", lead: "REL Nomad", bd: "REL Nomad", leadSource: "REL Nomad", revenue: 500000, directCost: 100000, status: "ongoing" },
      { cycleId: cycle.id, client: "REL Eta", type: "RET", lead: "REL NoId", bd: "REL NoId", leadSource: "REL NoId", revenue: 500000, directCost: 100000, status: "ongoing" },
    ],
  });

  const loaded = await loadCycleReport(cycle.id);
  if (!loaded) throw new Error("cycle did not load");

  // ── 1. Matching on Employee ID ────────────────────────────────────────────
  console.log("\n1. Who is paid — matched on Employee ID, never guessed");
  const lines = await payoutLines(cycle.id, loaded.report);
  const feeFor = (n: string) => lines.find((l) => l.personName === n && l.kind === "SCHEME_FEES");

  eq("a clean match resolves to the account", feeFor("REL Dalia")?.userId, lead.id);
  eq("…and takes that person's business unit", feeFor("REL Dalia")?.businessUnitName, "REL Consulting");
  check("a clean match is releasable", isReleasable(feeFor("REL Dalia")!));
  eq("an unknown Employee ID is refused", feeFor("REL Ghost")?.blocked, "NO_SUCH_EMPLOYEE");
  eq("a missing Employee ID is refused", feeFor("REL NoId")?.blocked, "NO_EMPLOYEE_ID");
  eq("an ID on two accounts is refused", feeFor("REL Twins")?.blocked, "AMBIGUOUS");
  eq("…and both accounts are named", feeFor("REL Twins")?.candidates.length, 2);
  eq("a matched person with no unit is refused", feeFor("REL Nomad")?.blocked, "NO_BUSINESS_UNIT");
  check("nothing blocked is releasable", lines.filter((l) => l.blocked).every((l) => !isReleasable(l)));

  // The name is the cross-check, not the match.
  await prisma.incentivePerson.updateMany({
    where: { cycleId: cycle.id, name: "REL Karim" },
    data: { name: "REL Kareem" },
  });
  await prisma.incentiveAssignment.updateMany({ where: { cycleId: cycle.id, client: "REL Beta" }, data: { lead: "REL Kareem", bd: "REL Kareem", leadSource: "REL Kareem" } });
  const reloaded = (await loadCycleReport(cycle.id))!.report;
  const afterRename = await payoutLines(cycle.id, reloaded);
  const karim = afterRename.find((l) => l.personName === "REL Kareem" && l.kind === "SCHEME_FEES");
  check("a differing name still matches on the ID", karim?.userId === mid.id);
  check("…but is flagged as a mismatch", karim?.nameMismatch === true);
  eq("…and is still releasable, held rather than blocked", karim?.blocked, null);

  // ── 2. The appointment ────────────────────────────────────────────────────
  console.log("\n2. Who may release");
  eq("nobody heads anything yet", await releasableUnitIds(head.id), []);
  await prisma.businessUnitHead.create({ data: { userId: head.id, businessUnitId: unitA.id } });
  eq("the head releases their own unit", await canReleaseForUnit(head.id, unitA.id), true);
  eq("…and not another one", await canReleaseForUnit(head.id, unitB.id), false);
  eq("somebody with no appointment releases nothing", await canReleaseForUnit(lead.id, unitA.id), false);

  // ── 3. Releasing ──────────────────────────────────────────────────────────
  console.log("\n3. Releasing");
  const daliaFee = feeFor("REL Dalia")!;
  const written = await releaseIncentivePayouts(cycle.id, head.id, [
    { userId: daliaFee.userId!, personName: daliaFee.personName, kind: "SCHEME_FEES", amount: daliaFee.amount, businessUnitId: unitA.id },
  ]);
  eq("one payment released", written, 1);

  const again = await releaseIncentivePayouts(cycle.id, head.id, [
    { userId: daliaFee.userId!, personName: daliaFee.personName, kind: "SCHEME_FEES", amount: daliaFee.amount, businessUnitId: unitA.id },
  ]);
  eq("releasing the same thing twice writes nothing", again, 0);

  const afterRelease = await payoutLines(cycle.id, reloaded);
  const daliaAfter = afterRelease.find((l) => l.personName === "REL Dalia" && l.kind === "SCHEME_FEES")!;
  check("it now shows as released", daliaAfter.released != null);
  check("…not yet paid, since nothing reached the bank", daliaAfter.released?.confirmed === false);
  check("…and is no longer releasable", !isReleasable(daliaAfter));
  eq("the frozen amount is what was released", daliaAfter.released?.amount, daliaFee.amount);

  // ── 4. Finance's one queue ────────────────────────────────────────────────
  console.log("\n4. Finance sees it in the same list");
  const payables = await availablePayables();
  const mine = payables.filter((p) => p.kind === "INCENTIVE_PAYOUT" && p.payeeName === "REL Dalia");
  eq("it is waiting as a payable", mine.length, 1);
  eq("…in the unit it was released against", mine[0]?.businessUnitName, "REL Consulting");
  eq("…for the right amount, in piastres", mine[0]?.amountPiastres, Math.round(daliaFee.amount * 100));
  check("…and says what it is for", /Incentive .*Business Partner Fee/.test(mine[0]?.purpose ?? ""));

  // ── 5. An edit cannot re-decide money already gone ────────────────────────
  console.log("\n5. Released money cannot be edited away");
  // An edit that removes every assignment would make the released fee 0.00.
  const wiped = await releasedFiguresWouldBreak(cycle.id, { people: [], assignments: [], contributions: [] });
  check("an edit that would zero a released fee is refused", wiped.length > 0, wiped.join(" | "));
  check("…naming the person", wiped.some((e) => e.includes("REL Dalia")), wiped.join(" | "));
  check("…and saying what was already released", wiped.some((e) => /already released/.test(e)), wiped.join(" | "));

  const releasedRows = await prisma.incentivePayout.findMany({
    where: { cycleId: cycle.id },
    select: { userId: true, personName: true, kind: true, amount: true },
  });
  const stillFine = releasedFiguresBroken(
    afterRelease,
    releasedRows.map((r) => ({ userId: r.userId, personName: r.personName, kind: r.kind, amount: Number(r.amount) }))
  );
  eq("an untouched cycle breaks nothing", stillFine.length, 0);

  // The narrower case: the person stays, but their figure changes.
  const halved = await releasedFiguresWouldBreak(cycle.id, {
    people: [{ id: null, name: "REL Dalia", employeeId: "REL-001", role: null, netMonthlySalary: 90000, startDate: null }],
    assignments: [
      { client: "REL Alpha", type: "RET", lead: "REL Dalia", bd: "REL Dalia", leadSource: "REL Dalia",
        revenue: 900000, directCost: 200000, vendorCost: 0, markupPct: 0, startDate: null, closeDate: null, status: "ongoing" },
    ],
    contributions: [],
  });
  check("halving the revenue behind a released fee is refused", halved.length > 0, halved.join(" | "));

  // ── 6. The message ────────────────────────────────────────────────────────
  console.log("\n6. The editable message");
  eq("an untouched message falls back to the built-in wording", resolveIncentiveMessage({}), INCENTIVE_MESSAGE_DEFAULTS);
  eq("the defaults pass their own checks", checkIncentiveMessage(INCENTIVE_MESSAGE_DEFAULTS), []);
  const values = {
    "{first name}": "Dalia", "{full name}": "REL Dalia", "{cycle}": LABEL,
    "{total}": "EGP 1,000.00", "{transfer date}": "26-Aug 2026", "{business unit}": "REL Consulting",
  };
  check("placeholders substitute", fillMessage(INCENTIVE_MESSAGE_DEFAULTS.subject, values).includes("EGP 1,000.00"));
  check("no braces survive a fill", !/\{[^}]*\}/.test(fillMessage(INCENTIVE_MESSAGE_DEFAULTS.body, values)));
  const typo = checkIncentiveMessage({ ...INCENTIVE_MESSAGE_DEFAULTS, body: "Hi {First Name}, {total}" });
  check("a mis-cased placeholder is refused by name", typo.some((e) => e.includes("{First Name}")), typo.join(" | "));
  const noTotal = checkIncentiveMessage({ ...INCENTIVE_MESSAGE_DEFAULTS, subject: "Paid", body: "Hello.", footer: "" });
  check("a message with no {total} is refused", noTotal.some((e) => e.includes("{total}")), noTotal.join(" | "));

  // ── Done ──────────────────────────────────────────────────────────────────
  await prisma.incentiveCycle.deleteMany({ where: { label: LABEL } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOM } } });
  await prisma.businessUnit.deleteMany({ where: { name: { startsWith: "REL " } } });

  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  if (failures.length) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log("  ✗ " + f);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
