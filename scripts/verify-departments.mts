/**
 * Throwaway-DB proof for spec 014 (HR-managed departments). Mirrors the server-action logic
 * (add/rename/remove + guards) against a real Postgres so the cascade and remove-guard are proven,
 * not just reasoned. Run with POSTGRES_URL pointed at a throwaway DB.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeDeptName, sameDeptName } from "../src/lib/departments";

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`);
  }
}

// --- action logic replicated (same as src/app/(app)/admin/departments/actions.ts, minus requireAdmin) ---
async function addDepartment(name: string) {
  const clean = normalizeDeptName(name);
  if (!clean) return { ok: false, error: "Enter a department name." } as const;
  const existing = await prisma.department.findMany({ select: { name: true } });
  if (existing.some((d) => sameDeptName(d.name, clean)))
    return { ok: false, error: "That department already exists." } as const;
  const max = await prisma.department.aggregate({ _max: { order: true } });
  await prisma.department.create({ data: { name: clean, order: (max._max.order ?? 0) + 1 } });
  return { ok: true } as const;
}
async function renameDepartment(id: string, newName: string) {
  const clean = normalizeDeptName(newName);
  if (!clean) return { ok: false, error: "Enter a department name." } as const;
  const target = await prisma.department.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Department not found." } as const;
  if (!sameDeptName(target.name, clean)) {
    const others = await prisma.department.findMany({ where: { NOT: { id } }, select: { name: true } });
    if (others.some((d) => sameDeptName(d.name, clean)))
      return { ok: false, error: "Another department already has that name." } as const;
  }
  const oldName = target.name;
  const moved = await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { name: clean } });
    const res = await tx.user.updateMany({ where: { department: oldName }, data: { department: clean } });
    return res.count;
  });
  return { ok: true, moved } as const;
}
async function removeDepartment(id: string) {
  const target = await prisma.department.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Department not found." } as const;
  const inUse = await prisma.user.count({ where: { department: target.name } });
  if (inUse > 0) return { ok: false, error: `${inUse} in use` } as const;
  await prisma.department.delete({ where: { id } });
  return { ok: true } as const;
}

async function main() {
  // Seed two employees in real departments.
  await prisma.user.deleteMany({});
  await prisma.user.create({ data: { name: "A", email: "a@x.com", department: "Data Management Unit" } });
  await prisma.user.create({ data: { name: "B", email: "b@x.com", department: "Data Management Unit" } });
  await prisma.user.create({ data: { name: "C", email: "c@x.com", department: "Top Management" } });

  console.log("Add:");
  const a1 = await addDepartment("People & Culture");
  check("adds a new department", a1.ok === true);
  const a2 = await addDepartment("people & culture");
  check("rejects case-insensitive duplicate", a2.ok === false);
  const a3 = await addDepartment("   ");
  check("rejects empty/whitespace", a3.ok === false);
  const a4 = await addDepartment("  Finance  ");
  const fin = await prisma.department.findFirst({ where: { name: "Finance" } });
  check("trims before saving ('  Finance  ' -> 'Finance')", a4.ok === true && !!fin);

  console.log("Rename cascade (SC-002):");
  const dmu = await prisma.department.findFirstOrThrow({ where: { name: "Data Management Unit" } });
  const r1 = await renameDepartment(dmu.id, "Data & Analytics");
  const movedOk = r1.ok && r1.moved === 2;
  const stale = await prisma.user.count({ where: { department: "Data Management Unit" } });
  const moved = await prisma.user.count({ where: { department: "Data & Analytics" } });
  check("rename cascades to all employees (moved=2)", movedOk);
  check("zero employees left on the old name", stale === 0);
  check("both employees now on the new name", moved === 2);
  const deptRow = await prisma.department.findUnique({ where: { id: dmu.id } });
  check("department row renamed", deptRow?.name === "Data & Analytics");

  console.log("Rename guards:");
  const topm = await prisma.department.findFirstOrThrow({ where: { name: "Top Management" } });
  const r2 = await renameDepartment(topm.id, "Data & Analytics");
  check("rejects rename to another existing name", r2.ok === false);
  const r3 = await renameDepartment(topm.id, "top management");
  const topmAfter = await prisma.department.findUnique({ where: { id: topm.id } });
  const cUser = await prisma.user.findFirstOrThrow({ where: { email: "c@x.com" } });
  check("case-only self-rename allowed", r3.ok === true && topmAfter?.name === "top management");
  check("case-only rename cascades to employee", cUser.department === "top management");

  console.log("Remove guard (SC-003):");
  const daRow = await prisma.department.findFirstOrThrow({ where: { name: "Data & Analytics" } });
  const rm1 = await removeDepartment(daRow.id);
  check("blocks remove while employees assigned", rm1.ok === false);
  const finRow = await prisma.department.findFirstOrThrow({ where: { name: "Finance" } });
  const rm2 = await removeDepartment(finRow.id);
  const finGone = await prisma.department.findFirst({ where: { name: "Finance" } });
  check("removes an empty department", rm2.ok === true && finGone === null);

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
