/**
 * Throwaway-DB proof of the road an APPROVED benefit claim travels to reach the bank
 * (spec 020 as amended by spec 041): Finance's "Awaiting confirmation" list is built from
 * `payableGroups()`, so this drives that derivation over real rows in a real Postgres and
 * asks the one question the CEO asked — can Finance actually send this claim?
 *
 * Three shapes of the same approved claim, because they look identical on the Payments tab
 * and only one of them can be sent:
 *   1. employee in a unit that has somebody appointed  → sendable
 *   2. employee in a unit with nobody appointed        → shown, refused, with a reason
 *   3. employee with no business unit at all           → grouped apart, refused
 *
 * Every fixture string is namespaced (CTC…) because these scripts share one database.
 *
 * Run:
 *   POSTGRES_URL=$DB DATABASE_URL_UNPOOLED=$DB npx tsx scripts/verify-claim-to-confirmation.mts
 */
import { PrismaClient } from "@prisma/client";
import { availablePayables, payableGroups } from "../src/lib/finance/payables";
import { sameBusinessUnit } from "../src/lib/finance/batches";

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

const DOM = "@ctc-test.example";
const UNIT = "CTC ";
const YEAR = "CTC-TEST-YEAR";
const ITEM = "CTC Gym membership";

async function main() {
  // ── This script's own rows only ───────────────────────────────────────────
  await prisma.benefitClaim.deleteMany({ where: { user: { email: { endsWith: DOM } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOM } } });
  await prisma.businessUnit.deleteMany({ where: { name: { startsWith: UNIT } } });
  await prisma.planYear.deleteMany({ where: { name: YEAR } });
  await prisma.benefitCatalogItem.deleteMany({ where: { key: "ctc-gym" } });

  const staffed = await prisma.businessUnit.create({
    data: { name: `${UNIT}Consulting`, shortName: "CTCC" },
  });
  const unstaffed = await prisma.businessUnit.create({
    data: { name: `${UNIT}Studio`, shortName: "CTCS" },
  });

  const mk = (name: string, unitId: string | null) =>
    prisma.user.create({
      data: {
        email: `${name.toLowerCase().replace(/\s+/g, ".")}${DOM}`,
        name,
        businessUnitId: unitId,
        status: "ACTIVE",
      },
    });

  const inStaffed = await mk("CTC Momen", staffed.id);
  const inUnstaffed = await mk("CTC Hussein", unstaffed.id);
  const unitless = await mk("CTC Nomad", null);
  const confirmer = await mk("CTC Confirmer", staffed.id);

  await prisma.transactionConfirmer.create({
    data: { userId: confirmer.id, businessUnitId: staffed.id },
  });

  const planYear = await prisma.planYear.create({
    data: {
      name: YEAR,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      status: "OPEN",
    },
  });
  const item = await prisma.benefitCatalogItem.create({
    data: { key: "ctc-gym", name: ITEM, category: "Wellness", coverageRate: 100, active: true },
  });

  const claim = (userId: string, amount: number) =>
    prisma.benefitClaim.create({
      data: {
        userId,
        planYearId: planYear.id,
        catalogItemId: item.id,
        amount,
        status: "APPROVED",
        decidedAt: new Date("2026-08-24"),
      },
    });

  const sendable = await claim(inStaffed.id, 90000);
  const blocked = await claim(inUnstaffed.id, 5280);
  const orphan = await claim(unitless.id, 1200);

  // ── 1. Does an approved claim reach Finance's list at all? ────────────────
  console.log("\nAn approved claim becomes a payable");
  const payables = await availablePayables();
  const mine = payables.filter((p) => p.kind === "BENEFIT_CLAIM" && [sendable.id, blocked.id, orphan.id].includes(p.id));
  check("all three approved claims are payables", mine.length === 3, `saw ${mine.length}`);
  const one = mine.find((p) => p.id === sendable.id);
  check("the amount is carried in piastres", one?.amountPiastres === 9_000_000, `got ${one?.amountPiastres}`);
  check("the business unit is derived from the employee", one?.businessUnitId === staffed.id);

  // ── 2. Which of them can actually be sent? ────────────────────────────────
  console.log("\nWhat Finance's screen can send");
  const groups = await payableGroups();
  const gStaffed = groups.find((g) => g.businessUnitId === staffed.id);
  const gUnstaffed = groups.find((g) => g.businessUnitId === unstaffed.id);
  const gNone = groups.find((g) => g.businessUnitId === null);

  check("the staffed unit's claim is sendable", gStaffed?.canSend === true);
  check("…and names who it goes to", gStaffed?.confirmerNames.includes("CTC Confirmer") === true, JSON.stringify(gStaffed?.confirmerNames));
  check("the unstaffed unit is shown but refused", gUnstaffed !== undefined && gUnstaffed.canSend === false);
  check("the unitless person is grouped apart and refused", gNone !== undefined && gNone.canSend === false);

  // ── 3. The server's own re-check, not just the screen's ───────────────────
  console.log("\nThe server re-checks what the form posts");
  const ok = sameBusinessUnit(gStaffed?.payables ?? [], staffed.id);
  check("one unit's list passes", ok.ok === true, ok.ok ? "" : ok.reason);
  const mixed = sameBusinessUnit(
    [...(gStaffed?.payables ?? []), ...(gUnstaffed?.payables ?? [])],
    staffed.id,
  );
  check("two units in one submission are refused", mixed.ok === false);
  const withOrphan = sameBusinessUnit(gNone?.payables ?? [], staffed.id);
  check("a person with no unit is refused", withOrphan.ok === false);

  // ── 4. Once it is in a submission it leaves the waiting list ──────────────
  console.log("\nA claim already at the bank is not offered twice");
  const batch = await prisma.paymentBatch.create({
    data: {
      reference: "CTC-26-01",
      type: "EXPENSES",
      businessUnitId: staffed.id,
      valueDate: new Date("2026-09-01"),
      totalAmount: "90000",
      itemCount: 1,
      submittedById: inStaffed.id,
      items: {
        create: [
          {
            benefitClaimId: sendable.id,
            amountAtSubmission: "90000",
            payeeName: "CTC Momen",
            purpose: `Benefit claim — ${ITEM}`,
          },
        ],
      },
    },
  });
  await prisma.benefitClaim.update({ where: { id: sendable.id }, data: { status: "PAYMENT_SUBMITTED" } });
  const after = await availablePayables();
  check(
    "it is gone from the waiting list",
    !after.some((p) => p.kind === "BENEFIT_CLAIM" && p.id === sendable.id),
  );

  // Returning it to Finance releases it again.
  await prisma.paymentBatchItem.deleteMany({ where: { batchId: batch.id } });
  await prisma.benefitClaim.update({ where: { id: sendable.id }, data: { status: "APPROVED" } });
  const back = await availablePayables();
  check(
    "returning it puts it back",
    back.some((p) => p.kind === "BENEFIT_CLAIM" && p.id === sendable.id),
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
