"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSuperUser, canSeeSalary } from "@/lib/roles";
import { employeeSchema } from "@/lib/validation";

function parseForm(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries());
  let dependants: unknown = [];
  const depJson = formData.get("dependants");
  if (typeof depJson === "string" && depJson.trim()) {
    try {
      dependants = JSON.parse(depJson);
    } catch {
      dependants = [];
    }
  }
  return { ...raw, dependants };
}

/** Would setting `managerId` as `employeeId`'s manager create a cycle? */
async function wouldCycle(
  employeeId: string,
  managerId: string
): Promise<boolean> {
  let current: string | null = managerId;
  const seen = new Set<string>();
  while (current) {
    if (current === employeeId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    const mgr: { reportsToId: string | null } | null =
      await prisma.user.findUnique({
        where: { id: current },
        select: { reportsToId: true },
      });
    current = mgr?.reportsToId ?? null;
  }
  return false;
}

export type ActionState = { error?: string } | null;

export async function createEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = employeeSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  // Only a Super User may grant elevated roles.
  const role = actor.role === "SUPER_USER" ? data.role : "EMPLOYEE";

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) return { error: "An employee with that email already exists." };

  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      department: data.department ?? null,
      title: data.title ?? null,
      role,
      employmentType: data.employmentType ?? null,
      tenureBand: data.tenureBand ?? null,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      // Salary is confidential — only a Super User may set it; HR-created records start with none.
      monthlySalary: canSeeSalary(actor.role) ? (data.monthlySalary ?? null) : null,
      status: data.status,
      dateOfBirth: data.dateOfBirth ?? null,
      maritalStatus: data.maritalStatus ?? null,
      emergencyContactName: data.emergencyContactName ?? null,
      emergencyContactRelationship: data.emergencyContactRelationship ?? null,
      emergencyContactPhone: data.emergencyContactPhone ?? null,
      reportsToId: data.reportsToId ?? null,
      dependants: {
        create: data.dependants.map((d) => ({
          name: d.name ?? null,
          dateOfBirth: d.dateOfBirth,
        })),
      },
    },
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees");
}

export async function updateEmployee(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = employeeSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) return { error: "Employee not found." };

  // Reporting-line integrity
  if (data.reportsToId) {
    if (data.reportsToId === id)
      return { error: "An employee cannot report to themselves." };
    if (await wouldCycle(id, data.reportsToId))
      return { error: "That reporting line would create a cycle." };
  }

  // Email uniqueness (if changed)
  if (data.email !== current.email) {
    const clash = await prisma.user.findUnique({ where: { email: data.email } });
    if (clash) return { error: "Another employee already uses that email." };
  }

  // Role is Super-User-only; otherwise keep the existing role.
  const role = actor.role === "SUPER_USER" ? data.role : current.role;

  await prisma.$transaction([
    prisma.dependant.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        department: data.department ?? null,
        title: data.title ?? null,
        role,
        employmentType: data.employmentType ?? null,
        tenureBand: data.tenureBand ?? null,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        status: data.status,
        dateOfBirth: data.dateOfBirth ?? null,
        maritalStatus: data.maritalStatus ?? null,
        emergencyContactName: data.emergencyContactName ?? null,
        emergencyContactRelationship: data.emergencyContactRelationship ?? null,
        emergencyContactPhone: data.emergencyContactPhone ?? null,
        reportsToId: data.reportsToId ?? null,
        dependants: {
          create: data.dependants.map((d) => ({
            name: d.name ?? null,
            dateOfBirth: d.dateOfBirth,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  redirect("/admin/employees");
}

/**
 * Inline single-field update from the editable employees grid.
 * Validates the one field, enforces the same governance as the full form
 * (Super-User-only role, email uniqueness, reporting-line self/cycle guards),
 * and returns a plain result (no redirect) for the grid to apply optimistically.
 */
export type FieldResult = { ok: true } | { ok: false; error: string };

// Fields the grid may edit, each reusing the full-form schema's per-field rules.
const FIELD_SCHEMAS = {
  name: employeeSchema.shape.name,
  email: employeeSchema.shape.email,
  phone: employeeSchema.shape.phone,
  department: employeeSchema.shape.department,
  title: employeeSchema.shape.title,
  role: employeeSchema.shape.role,
  employmentType: employeeSchema.shape.employmentType,
  tenureBand: employeeSchema.shape.tenureBand,
  startDate: employeeSchema.shape.startDate,
  endDate: employeeSchema.shape.endDate,
  monthlySalary: employeeSchema.shape.monthlySalary,
  status: employeeSchema.shape.status,
  dateOfBirth: employeeSchema.shape.dateOfBirth,
  maritalStatus: employeeSchema.shape.maritalStatus,
  emergencyContactName: employeeSchema.shape.emergencyContactName,
  emergencyContactRelationship: employeeSchema.shape.emergencyContactRelationship,
  emergencyContactPhone: employeeSchema.shape.emergencyContactPhone,
  reportsToId: employeeSchema.shape.reportsToId,
} as const;

type EditableField = keyof typeof FIELD_SCHEMAS;

export async function updateEmployeeField(
  id: string,
  field: string,
  value: string | null
): Promise<FieldResult> {
  const actor = await requireAdmin();

  if (!Object.prototype.hasOwnProperty.call(FIELD_SCHEMAS, field)) {
    return { ok: false, error: "That field can't be edited here." };
  }
  const key = field as EditableField;

  // Role is Super-User-only, matching the full form.
  if (key === "role" && !isSuperUser(actor.role)) {
    return { ok: false, error: "Only a Super User can change roles." };
  }
  // Salary is confidential — only a Super User may view or change it.
  if (key === "monthlySalary" && !canSeeSalary(actor.role)) {
    return { ok: false, error: "Only a Super User can view or change salary." };
  }
  // Guard against locking yourself out via a stray inline edit.
  if (id === actor.id && (key === "role" || key === "status")) {
    return { ok: false, error: "You can't change your own role or status here." };
  }

  const parsed = FIELD_SCHEMAS[key].safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid value." };
  }
  const next = parsed.data as unknown;

  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Employee not found." };

  if (key === "email") {
    const email = next as string;
    if (email !== current.email) {
      const clash = await prisma.user.findUnique({ where: { email } });
      if (clash) return { ok: false, error: "Another employee already uses that email." };
    }
  }

  if (key === "reportsToId") {
    const managerId = (next as string | null) ?? null;
    if (managerId) {
      if (managerId === id)
        return { ok: false, error: "An employee cannot report to themselves." };
      if (await wouldCycle(id, managerId))
        return { ok: false, error: "That reporting line would create a cycle." };
    }
  }

  await prisma.user.update({
    where: { id },
    data: { [key]: next ?? null } as Prisma.UserUpdateInput,
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: true };
}
