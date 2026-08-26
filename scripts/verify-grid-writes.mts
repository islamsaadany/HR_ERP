/**
 * Throwaway-DB verification for the editable employees grid's write path.
 * Replicates updateEmployeeField's validation (the same per-field schemas from
 * employeeSchema) + the exact Prisma computed-key update, and asserts real rows.
 * Not shipped — a local audit harness.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { employeeSchema } from "../src/lib/validation";

const prisma = new PrismaClient();

const FIELD_SCHEMAS = {
  name: employeeSchema.shape.name,
  email: employeeSchema.shape.email,
  title: employeeSchema.shape.title,
  employmentType: employeeSchema.shape.employmentType,
  startDate: employeeSchema.shape.startDate,
  status: employeeSchema.shape.status,
  reportsToId: employeeSchema.shape.reportsToId,
} as const;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
}

async function wouldCycle(employeeId: string, managerId: string): Promise<boolean> {
  let current: string | null = managerId;
  const seen = new Set<string>();
  while (current) {
    if (current === employeeId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    const mgr: { reportsToId: string | null } | null = await prisma.user.findUnique({
      where: { id: current },
      select: { reportsToId: true },
    });
    current = mgr?.reportsToId ?? null;
  }
  return false;
}

// Mirror of updateEmployeeField's core (minus the auth/session guards).
async function updateField(id: string, field: keyof typeof FIELD_SCHEMAS, value: string) {
  const parsed = FIELD_SCHEMAS[field].safeParse(value);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "invalid" };
  const next = parsed.data as unknown;
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) return { ok: false as const, error: "not found" };
  if (field === "email" && next !== current.email) {
    const clash = await prisma.user.findUnique({ where: { email: next as string } });
    if (clash) return { ok: false as const, error: "email in use" };
  }
  if (field === "reportsToId") {
    const managerId = (next as string | null) ?? null;
    if (managerId) {
      if (managerId === id) return { ok: false as const, error: "self" };
      if (await wouldCycle(id, managerId)) return { ok: false as const, error: "cycle" };
    }
  }
  await prisma.user.update({ where: { id }, data: { [field]: next ?? null } as Prisma.UserUpdateInput });
  return { ok: true as const };
}

async function main() {
  // Clean slate for this harness.
  await prisma.user.deleteMany({ where: { email: { endsWith: "@grid.test" } } });

  const boss = await prisma.user.create({
    data: { name: "Boss", email: "boss@grid.test", role: "SUPER_USER", employmentType: "FULL_TIME", status: "ACTIVE" },
  });
  const emp = await prisma.user.create({
    data: { name: "Emp One", email: "emp1@grid.test", role: "EMPLOYEE", employmentType: "FULL_TIME", status: "ACTIVE" },
  });
  const other = await prisma.user.create({
    data: { name: "Emp Two", email: "emp2@grid.test", role: "EMPLOYEE", status: "ACTIVE" },
  });

  console.log("Text field (title):");
  await updateField(emp.id, "title", "Senior Consultant");
  check("title persisted", (await get(emp.id)).title === "Senior Consultant");

  console.log("Enum → null (employmentType cleared with ''):");
  const r1 = await updateField(emp.id, "employmentType", "");
  check("clear returned ok", r1.ok);
  check("employmentType is null", (await get(emp.id)).employmentType === null);

  console.log("Enum set (employmentType PART_TIME):");
  await updateField(emp.id, "employmentType", "PART_TIME");
  check("employmentType = PART_TIME", (await get(emp.id)).employmentType === "PART_TIME");

  console.log("Date coercion (startDate):");
  await updateField(emp.id, "startDate", "2025-01-15");
  check("startDate stored as Jan 15 2025", (await get(emp.id)).startDate?.toISOString().slice(0, 10) === "2025-01-15");
  const r2 = await updateField(emp.id, "startDate", "");
  check("startDate cleared to null", r2.ok && (await get(emp.id)).startDate === null);

  console.log("Status enum:");
  await updateField(emp.id, "status", "LEFT");
  check("status = LEFT", (await get(emp.id)).status === "LEFT");
  await updateField(emp.id, "status", "ACTIVE");

  console.log("Validation rejects bad input:");
  check("empty name rejected", !(await updateField(emp.id, "name", "")).ok);
  check("bad email rejected", !(await updateField(emp.id, "email", "not-an-email")).ok);

  console.log("Email uniqueness:");
  const r3 = await updateField(emp.id, "email", "emp2@grid.test");
  check("duplicate email rejected", !r3.ok, JSON.stringify(r3));
  check("email unchanged after clash", (await get(emp.id)).email === "emp1@grid.test");
  const r4 = await updateField(emp.id, "email", "emp1-new@grid.test");
  check("unique email accepted", r4.ok && (await get(emp.id)).email === "emp1-new@grid.test");

  console.log("Reporting line:");
  const r5 = await updateField(emp.id, "reportsToId", emp.id);
  check("self-manager rejected", !r5.ok);
  await updateField(emp.id, "reportsToId", boss.id);
  check("manager set to boss", (await get(emp.id)).reportsToId === boss.id);
  // Now make boss report to emp → cycle.
  const r6 = await updateField(boss.id, "reportsToId", emp.id);
  check("cycle rejected", !r6.ok, JSON.stringify(r6));
  const r7 = await updateField(emp.id, "reportsToId", "");
  check("manager cleared to null", r7.ok && (await get(emp.id)).reportsToId === null);

  // cleanup
  await prisma.user.deleteMany({ where: { email: { endsWith: "@grid.test" } } });
  await prisma.user.deleteMany({ where: { id: other.id } });

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

async function get(id: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id } }));
}

main().finally(() => prisma.$disconnect());
