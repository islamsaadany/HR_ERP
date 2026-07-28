"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
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
      status: data.status,
      dateOfBirth: data.dateOfBirth ?? null,
      maritalStatus: data.maritalStatus ?? null,
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
