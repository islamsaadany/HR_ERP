"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSuperUser, canSeeSalary } from "@/lib/roles";
import { employeeSchema } from "@/lib/validation";
import { deriveTenureBand, statusFromEndDate } from "@/lib/tenure";

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

/**
 * Employee ID linking guard (spec 025). A duplicate Employee ID links the two
 * accounts as the same person (for the account switcher) — so if the given id is
 * already used by another ACTIVE record, require an explicit "Link accounts"
 * confirm (the `linkConfirmed` checkbox) before saving. Returns an error message
 * to show, or null when it's safe to proceed. `selfId` excludes the record being
 * edited (null on create).
 */
async function employeeIdLinkGuard(
  employeeId: string | null,
  formData: FormData,
  selfId: string | null
): Promise<string | null> {
  if (!employeeId) return null;
  if (formData.get("linkConfirmed") === "on") return null;
  const other = await prisma.user.findFirst({
    where: {
      employeeId,
      status: "ACTIVE",
      ...(selfId ? { NOT: { id: selfId } } : {}),
    },
    select: { name: true, email: true },
  });
  if (!other) return null;
  return `Employee ID "${employeeId}" is already used by ${other.name} (${other.email}). If they're the same person, tick "Link accounts with this Employee ID" and save again — otherwise change it.`;
}

/**
 * Turn a Zod failure into an operator-friendly message. The common trap is a
 * dependant added without a date of birth (required by the schema) — that would
 * otherwise surface as a bare "Invalid input". Falls back to the first issue's
 * own message, then a generic default.
 */
function friendlyError(error: import("zod").ZodError): string {
  const depDob = error.issues.find(
    (i) => i.path.includes("dependants") && i.path.includes("dateOfBirth")
  );
  if (depDob) return "Each dependant needs a date of birth.";
  const first = error.issues[0];
  return first?.message && first.message !== "Invalid input"
    ? first.message
    : first?.path.length
    ? `Check the "${String(first.path[first.path.length - 1])}" field.`
    : "Invalid input";
}

export async function createEmployee(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = employeeSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: friendlyError(parsed.error) };
  }
  const data = parsed.data;

  // Spec 023: at most one dependant may be the spouse.
  if (data.dependants.filter((d) => d.kind === "SPOUSE").length > 1) {
    return { error: "Only one dependant can be the spouse." };
  }

  // Only a Super User may grant elevated roles.
  const role = actor.role === "SUPER_USER" ? data.role : "EMPLOYEE";

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) return { error: "An employee with that email already exists." };

  // Employee ID (spec 025): a duplicate links the two accounts as the same person —
  // require an explicit confirm so it isn't done accidentally.
  const linkError = await employeeIdLinkGuard(data.employeeId ?? null, formData, null);
  if (linkError) return { error: linkError };

  await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      legalName: data.legalName ?? null,
      phone: data.phone ?? null,
      department: data.department ?? null,
      title: data.title ?? null,
      role,
      employmentType: data.employmentType ?? null,
      // Tenure band and status are derived, never hand-entered: band from the
      // hire date, status from the end date.
      tenureBand: deriveTenureBand(data.startDate ?? null).band,
      startDate: data.startDate ?? null,
      endDate: data.endDate ?? null,
      // Salary is confidential — only a Super User may set it; HR-created records start with none.
      monthlySalary: canSeeSalary(actor.role) ? (data.monthlySalary ?? null) : null,
      status: statusFromEndDate(data.endDate ?? null),
      dateOfBirth: data.dateOfBirth ?? null,
      maritalStatus: data.maritalStatus ?? null,
      emergencyContactName: data.emergencyContactName ?? null,
      emergencyContactRelationship: data.emergencyContactRelationship ?? null,
      emergencyContactPhone: data.emergencyContactPhone ?? null,
      reportsToId: data.reportsToId ?? null,
      businessUnitId: data.businessUnitId ?? null,
      employeeId: data.employeeId ?? null,
      dependants: {
        create: data.dependants.map((d) => ({
          name: d.name ?? null,
          dateOfBirth: d.dateOfBirth,
          kind: d.kind,
        })),
      },
    },
  });

  revalidatePath("/admin/employees");
  redirect("/admin/employees?toast=" + encodeURIComponent("Employee created."));
}

export async function updateEmployee(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await requireAdmin();
  const parsed = employeeSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return { error: friendlyError(parsed.error) };
  }
  const data = parsed.data;

  // Spec 023: at most one dependant may be the spouse.
  if (data.dependants.filter((d) => d.kind === "SPOUSE").length > 1) {
    return { error: "Only one dependant can be the spouse." };
  }

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

  // Employee ID link confirm (spec 025) — excludes this record.
  const linkError = await employeeIdLinkGuard(data.employeeId ?? null, formData, id);
  if (linkError) return { error: linkError };

  await prisma.$transaction([
    prisma.dependant.deleteMany({ where: { userId: id } }),
    prisma.user.update({
      where: { id },
      data: {
        name: data.name,
        email: data.email,
        legalName: data.legalName ?? null,
        phone: data.phone ?? null,
        department: data.department ?? null,
        title: data.title ?? null,
        role,
        employmentType: data.employmentType ?? null,
        // Derived, never hand-entered (band from hire date, status from end date).
        tenureBand: deriveTenureBand(data.startDate ?? null).band,
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        status: statusFromEndDate(data.endDate ?? null),
        dateOfBirth: data.dateOfBirth ?? null,
        maritalStatus: data.maritalStatus ?? null,
        emergencyContactName: data.emergencyContactName ?? null,
        emergencyContactRelationship: data.emergencyContactRelationship ?? null,
        emergencyContactPhone: data.emergencyContactPhone ?? null,
        reportsToId: data.reportsToId ?? null,
        businessUnitId: data.businessUnitId ?? null,
        employeeId: data.employeeId ?? null,
        dependants: {
          create: data.dependants.map((d) => ({
            name: d.name ?? null,
            dateOfBirth: d.dateOfBirth,
            kind: d.kind,
          })),
        },
      },
    }),
  ]);

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  redirect("/admin/employees?toast=" + encodeURIComponent("Employee updated."));
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
  // tenureBand and status are NOT directly editable — they are derived from
  // startDate and endDate respectively (see the derive-on-write below).
  startDate: employeeSchema.shape.startDate,
  endDate: employeeSchema.shape.endDate,
  monthlySalary: employeeSchema.shape.monthlySalary,
  dateOfBirth: employeeSchema.shape.dateOfBirth,
  maritalStatus: employeeSchema.shape.maritalStatus,
  emergencyContactName: employeeSchema.shape.emergencyContactName,
  emergencyContactRelationship: employeeSchema.shape.emergencyContactRelationship,
  emergencyContactPhone: employeeSchema.shape.emergencyContactPhone,
  reportsToId: employeeSchema.shape.reportsToId,
  businessUnitId: employeeSchema.shape.businessUnitId,
  employeeId: employeeSchema.shape.employeeId,
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
  // Guard against locking yourself out via a stray inline edit. An end date on
  // your own record would flip you to LEFT (status is derived from it).
  if (id === actor.id && key === "role") {
    return { ok: false, error: "You can't change your own role here." };
  }
  if (id === actor.id && key === "endDate" && value) {
    return { ok: false, error: "You can't set your own end date here (it would mark you as Left)." };
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

  // Business unit must be a real unit (the FK would otherwise throw a raw error).
  if (key === "businessUnitId") {
    const buId = (next as string | null) ?? null;
    if (buId) {
      const bu = await prisma.businessUnit.findUnique({ where: { id: buId }, select: { id: true } });
      if (!bu) return { ok: false, error: "That business unit no longer exists." };
    }
  }

  // Linking accounts by Employee ID is a deliberate action — do it on the edit
  // form (with the confirm), not via a quick inline grid edit.
  if (key === "employeeId") {
    const eid = (next as string | null) ?? null;
    if (eid) {
      const other = await prisma.user.findFirst({
        where: { employeeId: eid, status: "ACTIVE", NOT: { id } },
        select: { name: true },
      });
      if (other) {
        return {
          ok: false,
          error: `Employee ID "${eid}" is already used by ${other.name}. To link them as the same person, set it on the employee's edit form.`,
        };
      }
    }
  }

  const updateData: Prisma.UserUpdateInput = { [key]: next ?? null };
  // Editing a date recomputes the value it drives: hire date → tenure band,
  // end date → Active/Left status.
  if (key === "startDate") {
    updateData.tenureBand = deriveTenureBand((next as Date | null) ?? null).band;
  }
  if (key === "endDate") {
    updateData.status = statusFromEndDate((next as Date | null) ?? null);
  }

  await prisma.user.update({ where: { id }, data: updateData });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${id}`);
  return { ok: true };
}
