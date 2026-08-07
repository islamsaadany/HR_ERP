"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { normalizeDeptName, sameDeptName } from "@/lib/departments";

export type DeptResult = { ok: true; moved?: number } | { ok: false; error: string };

function revalidate() {
  revalidatePath("/admin/departments");
  revalidatePath("/admin/employees");
  revalidatePath("/directory");
}

/** Add a department. HR Admin + Super User. Trims, rejects empty + case-insensitive duplicates. */
export async function addDepartment(name: string): Promise<DeptResult> {
  await requireAdmin();
  const clean = normalizeDeptName(name);
  if (!clean) return { ok: false, error: "Enter a department name." };

  const existing = await prisma.department.findMany({ select: { name: true } });
  if (existing.some((d) => sameDeptName(d.name, clean))) {
    return { ok: false, error: "That department already exists." };
  }

  const max = await prisma.department.aggregate({ _max: { order: true } });
  await prisma.department.create({
    data: { name: clean, order: (max._max.order ?? 0) + 1 },
  });
  revalidate();
  return { ok: true };
}

/**
 * Rename a department. Cascades to every employee currently on the old name (one transaction).
 * Rejects empty and case-insensitive duplicates of ANOTHER department; a case/whitespace-only
 * change of the same row is allowed.
 */
export async function renameDepartment(id: string, newName: string): Promise<DeptResult> {
  await requireAdmin();
  const clean = normalizeDeptName(newName);
  if (!clean) return { ok: false, error: "Enter a department name." };

  const target = await prisma.department.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Department not found." };

  if (sameDeptName(target.name, clean)) {
    // Only a case/whitespace change — update the label, cascade, no duplicate concern.
  } else {
    const others = await prisma.department.findMany({
      where: { NOT: { id } },
      select: { name: true },
    });
    if (others.some((d) => sameDeptName(d.name, clean))) {
      return { ok: false, error: "Another department already has that name." };
    }
  }

  const oldName = target.name;
  const moved = await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { name: clean } });
    const res = await tx.user.updateMany({
      where: { department: oldName },
      data: { department: clean },
    });
    return res.count;
  });
  revalidate();
  return { ok: true, moved };
}

/** Remove a department — only when no employee is assigned to it. */
export async function removeDepartment(id: string): Promise<DeptResult> {
  await requireAdmin();
  const target = await prisma.department.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "Department not found." };

  const inUse = await prisma.user.count({ where: { department: target.name } });
  if (inUse > 0) {
    return {
      ok: false,
      error: `${inUse} employee${inUse === 1 ? "" : "s"} ${inUse === 1 ? "is" : "are"} still in this department. Move ${inUse === 1 ? "them" : "them"} first.`,
    };
  }

  await prisma.department.delete({ where: { id } });
  revalidate();
  return { ok: true };
}
