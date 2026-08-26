/**
 * Throwaway-DB proof for editing the incentive Review & validation tables in place
 * (mockup signed off 2026-08-25).
 *
 * The section is a client component behind a Super User session, so it can't be
 * driven headlessly. What it CAN do is run the exact shipped helpers the screen
 * and its action are built from — `toDraft`, `draftPayload`, `draftRowTotal`,
 * `validateReview`, `writeReviewTables` — over real rows, then re-read the
 * database and run the real engine (`computeCycle`) over what actually landed.
 *
 * Every fixture string is namespaced (RVW…) because these scripts share one
 * database: a script that reaches for a bare "Consulting" or an id of "alice"
 * inherits whichever other script ran first.
 *
 * Run:
 *   POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB npx tsx scripts/verify-incentive-review-edit.mts
 */
import { PrismaClient } from "@prisma/client";
import {
  draftPayload,
  draftRowTotal,
  isOffTotal,
  toDraft,
  validateReview,
  type Draft,
  type ReviewData,
  type ReviewPayload,
} from "../src/lib/incentive/review";
import { writeReviewTables } from "../src/lib/incentive/persist";
import { parseAssignments } from "../src/lib/incentive/import";
import { INCENTIVE_TEMPLATES } from "../src/lib/incentive/templates";
import { displayIncentiveDate, parseSheetDate, parseTypedDate } from "../src/lib/incentive/dates";
import { computeCycle, type CycleAssignment } from "../src/lib/incentive/compute";
import type { AssignmentType } from "../src/lib/incentive/rules";

const prisma = new PrismaClient();

let passed = 0;
const failures: string[] = [];
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label + (detail ? ` — ${detail}` : ""));
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
const eq = (label: string, actual: unknown, expected: unknown) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);

const LABEL = "RVW-TEST-CYCLE";
const P = { lead: "RVW Dalia Sobhy", mid: "RVW Karim Adel", junior: "RVW Salma Nabil" };
const C = { ret: "RVW Nile Retail", prj: "RVW Delta Foods" };

/** The payload a person would send having changed nothing at all. */
const untouched = (data: ReviewData): ReviewPayload => draftPayload(toDraft(data));

/** Read the three sheets back exactly the way the cycle page does. */
async function readBack(cycleId: string): Promise<ReviewData> {
  const cycle = await prisma.incentiveCycle.findUniqueOrThrow({
    where: { id: cycleId },
    include: { people: { orderBy: { name: "asc" } }, assignments: { orderBy: { client: "asc" } }, contributions: true },
  });
  return {
    people: cycle.people.map((p) => ({
      id: p.id,
      name: p.name,
      employeeId: p.employeeId,
      role: p.role,
      netMonthlySalary: p.netMonthlySalary,
      startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
    })),
    assignments: cycle.assignments.map((a) => ({
      id: a.id,
      client: a.client,
      type: a.type,
      lead: a.lead,
      bd: a.bd,
      leadSource: a.leadSource,
      revenue: a.revenue,
      directCost: a.directCost,
      vendorCost: a.vendorCost,
      markupPct: a.markupPct,
      startDate: a.startDate ? a.startDate.toISOString().slice(0, 10) : null,
      closeDate: a.closeDate ? a.closeDate.toISOString().slice(0, 10) : null,
      status: a.status,
    })),
    contributions: cycle.contributions.map((c) => ({ client: c.client, person: c.person, share: c.share })),
  };
}

/** Run the shipped engine over whatever is actually stored. */
async function reportFor(cycleId: string) {
  const data = await readBack(cycleId);
  return computeCycle(
    data.people.map((p) => ({
      name: p.name,
      role: p.role,
      netMonthlySalary: p.netMonthlySalary,
      eligibleToLead: true,
      utilization: null,
    })),
    data.assignments.map(
      (a): CycleAssignment => ({
        client: a.client,
        type: a.type as AssignmentType,
        lead: a.lead,
        bd: a.bd,
        leadSource: a.leadSource,
        revenue: a.revenue,
        directCost: a.directCost,
        vendorCost: a.vendorCost,
        markupPct: a.markupPct,
        status: a.status,
      })
    ),
    data.contributions,
    { revenue: null, deliveryCost: null, totalExpenses: null }
  );
}

async function main() {
  // ── Clean slate for this script's own rows only ─────────────────────────
  await prisma.incentiveCycle.deleteMany({ where: { label: LABEL } });
  const cycle = await prisma.incentiveCycle.create({ data: { label: LABEL } });

  // Seeded the way an upload leaves it: El Abd-style, one client short of 100%.
  await prisma.incentivePerson.createMany({
    data: [
      { cycleId: cycle.id, name: P.lead, role: "Partner", netMonthlySalary: 90000, startDate: new Date("2021-03-01"), eligibleToLead: false, utilization: 0.72 },
      { cycleId: cycle.id, name: P.mid, role: "Senior Consultant", netMonthlySalary: 60000 },
      { cycleId: cycle.id, name: P.junior, role: "Consultant", netMonthlySalary: 40000 },
    ],
  });
  await prisma.incentiveAssignment.createMany({
    data: [
      { cycleId: cycle.id, client: C.ret, type: "RET", lead: P.lead, bd: P.lead, leadSource: P.lead, revenue: 1800000, directCost: 400000, status: "ongoing" },
      { cycleId: cycle.id, client: C.prj, type: "PRJ", lead: P.mid, bd: P.lead, leadSource: "Referral", revenue: 600000, directCost: 140000, closeDate: new Date("2026-05-28"), status: "closed" },
    ],
  });
  await prisma.incentiveContribution.createMany({
    data: [
      { cycleId: cycle.id, client: C.ret, person: P.lead, share: 0.6 },
      { cycleId: cycle.id, client: C.ret, person: P.mid, share: 0.4 },
      { cycleId: cycle.id, client: C.prj, person: P.mid, share: 0.55 },
      { cycleId: cycle.id, client: C.prj, person: P.junior, share: 0.38 }, // → 93%
    ],
  });

  // ── 1. Round trip: opening the editor and saving without touching a cell ──
  console.log("\n1. Opening the editor changes nothing");
  const seeded = await readBack(cycle.id);
  const draft = toDraft(seeded);

  eq("salary reaches the cell as typed", draft.people.map((p) => p.netMonthlySalary), ["90000", "60000", "40000"]);
  eq("a 0.55 share shows as 55 percent", draft.rows.find((r) => r.client === C.prj)?.shares, ["", "55", "38"]);
  eq("a blank direct cost stays blank", toDraft({ ...seeded, assignments: [{ ...seeded.assignments[0], directCost: null }] }).assignments[0].directCost, "");
  eq("a stored date reaches the cell as 28-May 2026", draft.assignments.find((a) => a.client === C.prj)?.closeDate, "28-May 2026");

  const roundTrip = validateReview(untouched(seeded));
  check("an untouched draft validates", roundTrip.ok, roundTrip.ok ? "" : (roundTrip as { errors: string[] }).errors.join(" · "));
  if (roundTrip.ok) {
    eq(
      "…and comes back as the identical shares",
      roundTrip.clean.contributions.map((c) => c.share).sort(),
      [0.38, 0.4, 0.55, 0.6]
    );
    eq(
      "…and the identical salaries",
      roundTrip.clean.people.map((p) => p.netMonthlySalary),
      [90000, 60000, 40000]
    );
  }

  // ── 1b. Dates: 14-Jul 2026 on screen and in the cells ─────────────────────
  console.log("\n1b. Dates read and print as 14-Jul 2026");
  eq("a stored date prints 28-May 2026", displayIncentiveDate("2026-05-28"), "28-May 2026");
  eq("a single-digit day is padded", displayIncentiveDate("2021-03-01"), "01-Mar 2021");
  eq("a missing date prints an em dash", displayIncentiveDate(null), "—");
  // Reordered from the UTC parts, so it cannot shift a day in a timezone behind UTC.
  eq("the first of the month is not the day before", displayIncentiveDate("2026-01-01"), "01-Jan 2026");
  eq("July reads as the example does", displayIncentiveDate("2026-07-14"), "14-Jul 2026");

  // The typed cells: the spelled form in, the spelled form back out, refusals between.
  const typed = (start: string) => {
    const p2 = untouched(seeded);
    p2.people[0].startDate = start;
    return validateReview(p2);
  };
  const asIso = (r: ReturnType<typeof validateReview>) =>
    r.ok ? r.clean.people[0].startDate?.toISOString().slice(0, 10) : null;

  eq("a typed 14-Jul 2026 is 14 July", asIso(typed("14-Jul 2026")), "2026-07-14");
  eq("…spelled out in full too", asIso(typed("14 July 2026")), "2026-07-14");
  eq("…and lower case", asIso(typed("14-jul-2026")), "2026-07-14");
  // Still accepted, unstated, so nothing a person pastes in is needlessly refused.
  eq("a pasted 07/11/2023 is still day-first", asIso(typed("07/11/2023")), "2023-11-07");
  eq("an untouched ISO value is still accepted", asIso(typed("2023-11-07")), "2023-11-07");

  check("a made-up month is refused", !typed("14-Jly 2026").ok);
  check("31-Feb 2026 is refused", !typed("31-Feb 2026").ok);
  check("13/13/2026 is refused", !typed("13/13/2026").ok);
  check("a bare number is refused, not read as an Excel serial", !typed("45000").ok);
  const bogus = typed("hello");
  check("nonsense is refused", !bogus.ok);
  if (!bogus.ok) check("…and the message shows the form", bogus.errors.some((e) => /14-Jul 2026/.test(e)), bogus.errors.join(" · "));

  // Off a sheet, the same reader plus Excel serials.
  const sheet = parseAssignments(
    [
      "client,type,lead,bd,revenue,direct_cost,start_date,close_date",
      `${C.ret} NAMED,RET,${P.lead},${P.lead},100,10,14-Jul 2026,01-Aug 2026`,
      `${C.ret} DF,RET,${P.lead},${P.lead},100,10,01/03/2021,05/12/2021`,
      `${C.prj} ISO,PRJ,${P.lead},${P.lead},100,10,2021-03-01,2021-12-05`,
      `${C.prj} US,PRJ,${P.lead},${P.lead},100,10,3/22/2021,12/5/2021`,
    ].join("\n")
  );
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  eq("a sheet's 14-Jul 2026 is 14 July", iso(sheet.rows[0].startDate), "2026-07-14");
  eq("01/03/2021 is 1 March, not 3 January", iso(sheet.rows[1].startDate), "2021-03-01");
  eq("05/12/2021 is 5 December", iso(sheet.rows[1].closeDate), "2021-12-05");
  eq("an ISO cell is still read as ISO", iso(sheet.rows[2].startDate), "2021-03-01");
  eq("3/22/2021 can only be 22 March", iso(sheet.rows[3].startDate), "2021-03-22");
  eq("…and 12/5/2021 beside it stays day-first", iso(sheet.rows[3].closeDate), "2021-05-12");
  eq("a bare number is NOT a date when typed", iso(parseTypedDate("45000")), null);
  eq("…but off a sheet it is still an Excel serial", iso(parseSheetDate("45000")), "2023-03-15");

  // The template an operator downloads must be in the form the parser reads back.
  const tpl = parseAssignments(INCENTIVE_TEMPLATES.assignments.csv);
  eq("the sample template round-trips", iso(tpl.rows[1].closeDate), "2026-05-30");
  eq("…and its start date too", iso(tpl.rows[1].startDate), "2026-01-01");
  check("the template shows the spelled month", INCENTIVE_TEMPLATES.people.csv.includes("01-Jun 2024"));

  // ── 2. The live total the operator watches ────────────────────────────────
  console.log("\n2. The Total column");
  eq("a short client reads 93", Math.round(draftRowTotal(draft.rows.find((r) => r.client === C.prj)!) * 10) / 10, 93);
  check("…and is flagged", isOffTotal(93));
  check("100 is not flagged", !isOffTotal(100));
  check("99.5 is inside the ±1 point tolerance", !isOffTotal(99.5));
  check("98 is outside it", isOffTotal(98));
  eq("a typed '1,000' still counts", draftRowTotal({ client: "x", shares: ["1,000"] }), 1000);

  // ── 3. Validation refuses the whole save, and names every fault at once ───
  console.log("\n3. Refusing a bad save");
  const bad = untouched(seeded);
  bad.people[0].name = "";
  bad.people[1].netMonthlySalary = "not a number";
  bad.people[2].name = P.mid; // duplicate
  bad.assignments[0].type = "XXX";
  bad.assignments[1].status = "nonsense";
  bad.assignments[1].revenue = "-5";
  bad.contributions.rows[0].client = "";
  const rejected = validateReview(bad);
  check("a bad payload is refused", !rejected.ok);
  if (!rejected.ok) {
    check(`every fault is reported at once (${rejected.errors.length})`, rejected.errors.length === 7, rejected.errors.join(" · "));
    check("the missing name is named", rejected.errors.some((e) => /People row 1: enter a name/.test(e)));
    check("the bad salary is named", rejected.errors.some((e) => /net monthly salary must be a number/.test(e)));
    check("the duplicate person is named", rejected.errors.some((e) => /Two people are called/.test(e)));
    check("the bad type is named", rejected.errors.some((e) => /type must be PRJ or RET/.test(e)));
    check("the bad status is named", rejected.errors.some((e) => /pick a status/.test(e)));
    check("the negative revenue is named", rejected.errors.some((e) => /revenue can't be negative/.test(e)));
  }

  const dupeClient = untouched(seeded);
  dupeClient.assignments[1].client = dupeClient.assignments[0].client;
  check("two rows for one client are refused", !validateReview(dupeClient).ok);

  const dupeCol = untouched(seeded);
  dupeCol.contributions.persons.push(dupeCol.contributions.persons[0]);
  dupeCol.contributions.rows.forEach((r) => r.shares.push(""));
  check("two columns for one person are refused", !validateReview(dupeCol).ok);

  // ── 4. But a client short of 100% still saves ─────────────────────────────
  console.log("\n4. A half-finished client is still storable");
  check("93% saves (it is a payout rule, not a save rule)", validateReview(untouched(seeded)).ok);

  // ── 5. The write itself ───────────────────────────────────────────────────
  console.log("\n5. Writing the edits");
  const edited: Draft = JSON.parse(JSON.stringify(draft));
  const leadIdx = edited.people.findIndex((p) => p.name === P.lead);
  const renamed = "RVW Dalia Sobhi"; // the rename the screen propagates
  edited.people[leadIdx].name = renamed;
  edited.people[leadIdx].netMonthlySalary = "95,000"; // typed with a separator
  edited.people.push({ id: null, name: "RVW Hana Wagdy", employeeId: "", role: "Analyst", netMonthlySalary: "22000", startDate: "05-Jan 2026" });
  for (const a of edited.assignments) {
    if (a.lead === P.lead) a.lead = renamed;
    if (a.bd === P.lead) a.bd = renamed;
    if (a.leadSource === P.lead) a.leadSource = renamed;
  }
  edited.persons = edited.persons.map((p) => (p === P.lead ? renamed : p));
  // Correct the short client: 55 + 45 = 100.
  const prjRow = edited.rows.find((r) => r.client === C.prj)!;
  prjRow.shares[edited.persons.indexOf(P.junior)] = "45";

  const checked = validateReview(draftPayload(edited));
  check("the edited payload validates", checked.ok, checked.ok ? "" : (checked as { errors: string[] }).errors.join(" · "));
  if (!checked.ok) throw new Error("edited payload rejected");

  const counts = await writeReviewTables(cycle.id, checked.clean);
  eq("row counts written", counts, { people: 4, assignments: 2, contributions: 4 });

  const after = await readBack(cycle.id);
  eq("the added person is stored", after.people.filter((p) => p.name === "RVW Hana Wagdy").length, 1);
  eq("the typed 95,000 is stored as a number", after.people.find((p) => p.name === renamed)?.netMonthlySalary, 95000);
  check("the old name is gone", !after.people.some((p) => p.name === P.lead));
  eq("the rename followed into Lead", after.assignments.find((a) => a.client === C.ret)?.lead, renamed);
  eq("the rename followed into the contributions column", after.contributions.filter((c) => c.person === renamed).length, 1);
  eq("the corrected share is stored as a fraction", after.contributions.find((c) => c.client === C.prj && c.person === P.junior)?.share, 0.45);

  // The two retired columns are not on screen; they must survive the save anyway.
  const carried = await prisma.incentivePerson.findFirst({ where: { cycleId: cycle.id, name: renamed } });
  eq("eligibleToLead survived the save, across a rename", carried?.eligibleToLead, false);
  eq("utilization survived it too", carried?.utilization, 0.72);
  const fresh = await prisma.incentivePerson.findFirst({ where: { cycleId: cycle.id, name: "RVW Hana Wagdy" } });
  eq("a brand-new row gets the defaults", [fresh?.eligibleToLead, fresh?.utilization], [true, null]);

  // ── 6. The report actually rebuilds ───────────────────────────────────────
  console.log("\n6. The rest of the report regenerates");
  const report = await reportFor(cycle.id);
  eq("nothing is blocked any more", report.blocked.length, 0);
  check("the corrected client is now paid", report.assignments.some((a) => a.client === C.prj));
  check("its lead earns a fee", (report.assignments.find((a) => a.client === C.prj)?.leadFee ?? 0) > 0);
  check(
    "the newly added person appears in the by-person table",
    report.byPerson.some((p) => p.name === "RVW Hana Wagdy")
  );
  eq(
    "cost recovery uses the edited salary",
    report.costRecovery.find((c) => c.name === renamed)?.sixMonthSalary,
    95000 * 6
  );

  // ── 7. Removing rows ──────────────────────────────────────────────────────
  console.log("\n7. Removing a row removes it");
  const trimmed: Draft = toDraft(after);
  const dropIdx = trimmed.assignments.findIndex((a) => a.client === C.prj);
  trimmed.assignments.splice(dropIdx, 1);
  const rowIdx = trimmed.rows.findIndex((r) => r.client === C.prj);
  trimmed.rows.splice(rowIdx, 1);
  const trimChecked = validateReview(draftPayload(trimmed));
  if (!trimChecked.ok) throw new Error("trimmed payload rejected: " + trimChecked.errors.join(" · "));
  await writeReviewTables(cycle.id, trimChecked.clean);
  const afterTrim = await readBack(cycle.id);
  eq("the assignment is gone", afterTrim.assignments.length, 1);
  eq("its contribution rows went with it", afterTrim.contributions.filter((c) => c.client === C.prj).length, 0);

  // ── 8. Two people trading names ───────────────────────────────────────────
  // The reason the write is replace-then-recreate rather than update-in-place:
  // an update pass hits the (cycleId, name) unique index halfway through.
  console.log("\n8. Two people can trade names");
  const swapped: Draft = toDraft(afterTrim);
  const a = swapped.people.findIndex((p) => p.name === renamed);
  const b = swapped.people.findIndex((p) => p.name === P.mid);
  swapped.people[a].name = P.mid;
  swapped.people[b].name = renamed;
  const swapChecked = validateReview(draftPayload(swapped));
  check("a name swap validates", swapChecked.ok);
  if (swapChecked.ok) {
    await writeReviewTables(cycle.id, swapChecked.clean);
    const afterSwap = await readBack(cycle.id);
    eq("both names still present, once each", afterSwap.people.filter((p) => p.name === renamed || p.name === P.mid).length, 2);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  await prisma.incentiveCycle.deleteMany({ where: { label: LABEL } });

  console.log(`\n${passed}/${passed + failures.length} checks passed.`);
  if (failures.length > 0) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log("  ✗ " + f);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
