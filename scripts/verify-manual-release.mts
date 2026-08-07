/**
 * Proof for spec 016 manual claim/release entry. Mirrors recordManualRelease's validation/logic
 * (minus requireAdmin) against a throwaway Postgres, so the released-state, back-dated decision,
 * allocation cap, future-date and no-target guards are proven, not just reasoned.
 */
import { PrismaClient } from "@prisma/client";
import { amountForBand } from "../src/lib/benefits/config";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
function check(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

type Res = { ok: true } | { ok: false; error: string };

async function record(userId: string, benefitRef: string, amount: number, dateStr: string): Promise<Res> {
  const approvalDate = new Date(dateStr + "T00:00:00");
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  if (approvalDate.getTime() > endOfToday.getTime()) return { ok: false, error: "future date" };
  const planYear = await prisma.planYear.findFirst({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" } });
  if (!planYear) return { ok: false, error: "no plan year" };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, employmentType: true, tenureBand: true, monthlySalary: true } });
  if (!user) return { ok: false, error: "no user" };
  const [kind, id] = benefitRef.split(":");
  let allocation: number | null = null;
  const where: { guaranteedBenefitId?: string; catalogItemId?: string } = {};
  if (kind === "guaranteed") {
    const gb = await prisma.guaranteedBenefit.findUnique({ where: { id } });
    if (!gb) return { ok: false, error: "no gb" };
    if (user.employmentType && gb.employmentType !== user.employmentType) return { ok: false, error: "type mismatch" };
    const salaryDriven = gb.band6mo2y == null && gb.band2to4y == null && gb.band4to7y == null && gb.band7to10y == null;
    allocation = salaryDriven ? (user.monthlySalary ?? 0) : (user.tenureBand ? amountForBand(user.tenureBand, gb) : null);
    where.guaranteedBenefitId = id;
  } else if (kind === "catalog") {
    const line = await prisma.selectionLine.findFirst({ where: { catalogItemId: id, selection: { userId: user.id, planYearId: planYear.id, status: "SUBMITTED" } }, select: { amount: true } });
    if (!line) return { ok: false, error: "no allocation" };
    allocation = line.amount;
    where.catalogItemId = id;
  } else return { ok: false, error: "bad kind" };
  if (allocation == null || allocation <= 0) return { ok: false, error: "no allocation" };
  const existing = await prisma.benefitClaim.findMany({ where: { userId: user.id, planYearId: planYear.id, status: { in: ["PENDING", "RELEASED"] }, ...where }, select: { amount: true } });
  const claimed = existing.reduce((s, c) => s + c.amount, 0);
  if (amount > allocation - claimed) return { ok: false, error: "over allocation" };
  await prisma.benefitClaim.create({ data: { userId: user.id, planYearId: planYear.id, ...where, amount, status: "RELEASED", decidedAt: approvalDate, reviewedById: user.id, note: "back-filled" } });
  return { ok: true };
}

async function main() {
  await prisma.benefitClaim.deleteMany({});
  await prisma.selectionLine.deleteMany({});
  await prisma.benefitSelection.deleteMany({});
  await prisma.guaranteedBenefit.deleteMany({});
  await prisma.benefitCatalogItem.deleteMany({});
  await prisma.planYear.deleteMany({});
  await prisma.user.deleteMany({});

  const py = await prisma.planYear.create({ data: { name: "2026", status: "OPEN" } });
  const u = await prisma.user.create({ data: { name: "Emp", email: "e@x.com", employmentType: "FULL_TIME", tenureBand: "BAND_4_7Y", monthlySalary: 50000 } });
  const gb = await prisma.guaranteedBenefit.create({ data: { name: "Marriage", employmentType: "FULL_TIME", band6mo2y: 18000, band2to4y: 24000, band4to7y: 30000, band7to10y: 36000, order: 0 } });
  const gym = await prisma.benefitCatalogItem.create({ data: { key: "gym", name: "Gym", coverageRate: 80, order: 1 } });
  const sel = await prisma.benefitSelection.create({ data: { userId: u.id, planYearId: py.id, status: "SUBMITTED" } });
  // covered allocation for gym = 8,000
  await prisma.selectionLine.create({ data: { selectionId: sel.id, catalogItemId: gym.id, amount: 8000, cost: 10000 } });

  console.log("Manual release (US5):");
  const r1 = await record(u.id, `guaranteed:${gb.id}`, 30000, "2026-05-14"); // allocation 30,000 (band 4–7y)
  check("records a guaranteed release within allocation", r1.ok === true);
  const claim = await prisma.benefitClaim.findFirst({ where: { guaranteedBenefitId: gb.id } });
  check("stored as RELEASED (not pending)", claim?.status === "RELEASED");
  check("decidedAt = the entered approval date (2026-05-14)", claim?.decidedAt?.toISOString().startsWith("2026-05-14") === true);
  check("reviewer captured", !!claim?.reviewedById);

  console.log("Guards:");
  const r2 = await record(u.id, `guaranteed:${gb.id}`, 5000, "2026-05-20"); // 30,000 alloc, 30,000 used → 0 left
  check("cap: exceeding remaining allocation rejected", r2.ok === false);
  const r3 = await record(u.id, `catalog:${gym.id}`, 9000, "2026-05-14"); // covered alloc 8,000
  check("cap: catalog release over covered allocation (9,000 > 8,000) rejected", r3.ok === false);
  const r4 = await record(u.id, `catalog:${gym.id}`, 8000, "2026-05-14");
  check("catalog release within covered allocation (8,000) accepted", r4.ok === true);
  const future = new Date(); future.setFullYear(future.getFullYear() + 1);
  const r5 = await record(u.id, `guaranteed:${gb.id}`, 1000, future.toISOString().slice(0, 10));
  check("future approval date rejected", r5.ok === false);
  const gym2 = await prisma.benefitCatalogItem.create({ data: { key: "sports", name: "Sports", coverageRate: 80, order: 2 } });
  const r6 = await record(u.id, `catalog:${gym2.id}`, 1000, "2026-05-14"); // no submitted line for sports
  check("no allocation target rejected", r6.ok === false && !r6.ok && r6.error === "no allocation");

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
