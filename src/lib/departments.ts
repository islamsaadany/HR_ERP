import { prisma } from "@/lib/prisma";

/**
 * Managed department list (spec 014). The employee's `department` stays a text label;
 * this module is the single source for department *choices* (form dropdown, grid/directory
 * filters, import known-set). Display-only surfaces read the stored label directly.
 */

/** Trim a typed department name; collapse an empty/whitespace-only value to "". */
export function normalizeDeptName(raw: string): string {
  return raw.trim();
}

/** Case-insensitive equality for duplicate detection. */
export function sameDeptName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The managed department names, ordered for display (order, then name). */
export async function getDepartments(): Promise<string[]> {
  const rows = await prisma.department.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { name: true },
  });
  return rows.map((r) => r.name);
}

/** Managed departments with ids + live in-use counts (for the admin screen). */
export async function getDepartmentsWithUsage(): Promise<
  { id: string; name: string; order: number; inUse: number }[]
> {
  const rows = await prisma.department.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: { id: true, name: true, order: true },
  });
  // One grouped count keeps this to a single extra query regardless of list size.
  const counts = await prisma.user.groupBy({
    by: ["department"],
    _count: { _all: true },
  });
  const byName = new Map<string, number>();
  for (const c of counts) {
    if (c.department) byName.set(c.department, c._count._all);
  }
  return rows.map((r) => ({ ...r, inUse: byName.get(r.name) ?? 0 }));
}

/**
 * Union the managed list with department values already present on records, so legacy/stray
 * labels stay selectable in filters. Sorted, de-duplicated (case-sensitive on the stored value).
 */
export function unionDepartments(managed: string[], present: (string | null)[]): string[] {
  const set = new Set<string>(managed);
  for (const p of present) if (p) set.add(p);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
