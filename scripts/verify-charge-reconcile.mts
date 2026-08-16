/**
 * Throwaway-DB proof for spec 032 (medical charge reconciliation), using the product owner's real
 * configuration: a medical term of 15 Jun 2026 – 14 Jun 2027 against a 1 Jul – 31 Dec 2026 cycle.
 *
 * The shipped `reconcileMedicalCharges` is imported and run — this is the real function, not a copy.
 */
import { PrismaClient } from "@prisma/client";
import { reconcileMedicalCharges } from "../src/lib/benefits/reconcile";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const check = (l: string, c: boolean) => { console.log(`${c ? "  ✓" : "  ✗"} ${l}`); c ? pass++ : fail++; };

const chargesFor = (id: string) =>
  prisma.medicalCycleCharge.findMany({ where: { commitmentId: id }, orderBy: { planYearId: "asc" } });
const amountOn = async (id: string, py: string) =>
  (await prisma.medicalCycleCharge.findFirst({ where: { commitmentId: id, planYearId: py } }))?.amount ?? null;

async function main() {
  await prisma.medicalCycleCharge.deleteMany({});
  await prisma.medicalCommitment.deleteMany({});
  await prisma.planYear.deleteMany({});
  await prisma.medicalPolicyYear.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { contains: "v032" } } });

  const term = await prisma.medicalPolicyYear.create({
    data: { name: "2026/27", status: "OPEN", startDate: new Date(2026,5,15), endDate: new Date(2027,5,14) },
  });
  const y2026 = await prisma.planYear.create({
    data: { name: "2026", status: "OPEN", startDate: new Date(2026,6,1), endDate: new Date(2026,11,31) },
  });
  const rana = await prisma.user.create({
    data: { email: "v032.rana@x.test", name: "Rana", status: "ACTIVE", updatedAt: new Date() },
  });
  // Committed under 2026 only — exactly the state the product owner is looking at: the whole
  // premium parked on one cycle because the next one did not exist.
  const c = await prisma.medicalCommitment.create({
    data: {
      userId: rana.id, planYearId: y2026.id, policyYearId: term.id, premium: 18352,
      updatedAt: new Date(),
      cycleCharges: { create: [{ planYearId: y2026.id, policyYearId: term.id, amount: 18352, overlapMonths: 12, status: "APPLIED", appliedAt: new Date() }] },
    },
  });

  console.log("Repairing the wrong charge that exists today");
  await reconcileMedicalCharges();
  check("the 2026 charge drops to its six-month share (10,010)", (await amountOn(c.id, y2026.id)) === 10010);
  check("…and no second cycle is invented", (await chargesFor(c.id)).length === 1);
  const beforeTotal = (await chargesFor(c.id)).reduce((n, x) => n + x.amount, 0);
  check("the rest is NOT quietly charged somewhere", beforeTotal === 10010);

  console.log("\nOpening 2027 — the money the old code dropped");
  const y2027 = await prisma.planYear.create({
    data: { name: "2027", status: "OPEN", startDate: new Date(2027,0,1), endDate: new Date(2027,11,31) },
  });
  await prisma.planYear.update({ where: { id: y2026.id }, data: { status: "CLOSED" } });
  await reconcileMedicalCharges(y2027.id);
  check("a 2027 charge is created without anyone pre-creating it", (await amountOn(c.id, y2027.id)) === 8342);
  check("…it draws now, because 2027 is open",
    (await prisma.medicalCycleCharge.findFirst({ where: { commitmentId: c.id, planYearId: y2027.id } }))?.status === "APPLIED");
  const total = (await chargesFor(c.id)).reduce((n, x) => n + x.amount, 0);
  check("the two charges sum to the premium exactly", total === 18352);

  console.log("\nSettled history is never rewritten");
  const closed2026 = await amountOn(c.id, y2026.id);
  check("the closed 2026 charge is untouched at 10,010", closed2026 === 10010);
  await prisma.planYear.update({ where: { id: y2026.id }, data: { startDate: new Date(2026,0,1) } });
  await reconcileMedicalCharges();
  check("…even after its window is changed underneath it", (await amountOn(c.id, y2026.id)) === 10010);
  check("…and the remaining premium still lands on the open cycle", (await amountOn(c.id, y2027.id)) === 8342);

  console.log("\nIdempotence");
  const before = JSON.stringify((await chargesFor(c.id)).map((x) => [x.planYearId, x.amount, x.status]));
  await reconcileMedicalCharges();
  await reconcileMedicalCharges(y2027.id);
  const after = JSON.stringify((await chargesFor(c.id)).map((x) => [x.planYearId, x.amount, x.status]));
  check("running it twice more changes nothing", before === after);

  console.log("\nA leaver, and a cycle with no window");
  const gone = await prisma.user.create({ data: { email: "v032.gone@x.test", name: "Gone", status: "LEFT", updatedAt: new Date() } });
  const c2 = await prisma.medicalCommitment.create({
    data: { userId: gone.id, planYearId: y2027.id, policyYearId: term.id, premium: 12000, updatedAt: new Date() },
  });
  await reconcileMedicalCharges();
  const leaverCharges = await chargesFor(c2.id);
  check("a leaver's charges are cancelled, never applied",
    leaverCharges.length > 0 && leaverCharges.every((x) => x.status === "CANCELLED"));
  const undated = await prisma.planYear.create({ data: { name: "undated", status: "OPEN" } });
  await reconcileMedicalCharges();
  check("a cycle with no dates takes no share", (await amountOn(c.id, undated.id)) === null);
  check("…and the premium is still fully charged", (await chargesFor(c.id)).reduce((n,x)=>n+x.amount,0) === 18352);
  check("no charge is ever negative", (await prisma.medicalCycleCharge.findMany({})).every((x) => x.amount >= 0));

  console.log(`\n${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
