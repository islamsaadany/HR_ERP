import { prisma } from "@/lib/prisma";

/**
 * Managed business units (spec 024 — multi-brand). A business unit is a group
 * company carrying its own brand (name, short name, logo, primary/accent colors).
 * The app theme follows the viewing user's business unit (see `getBrand` in
 * `lib/brand.ts`); this module is the single source for the unit list, the admin
 * usage counts, and name normalization. Theming only — no data isolation.
 */

export type BusinessUnitBrand = {
  id: string;
  name: string;
  platformName: string | null;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

/** Trim a typed business-unit name. */
export function normalizeBuName(raw: string): string {
  return raw.trim();
}

/** Case-insensitive equality for duplicate detection. */
export function sameBuName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** All business units, ordered for display (order, then name). Empty on an un-migrated DB. */
export async function getBusinessUnits(): Promise<BusinessUnitBrand[]> {
  try {
    const rows = await prisma.businessUnit.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        platformName: true,
        shortName: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
      },
    });
    return rows;
  } catch {
    // Table not migrated yet → no units (app falls back to the default brand).
    return [];
  }
}

/** Business units with live member counts, for the admin screen. */
export async function getBusinessUnitsWithUsage(): Promise<
  (BusinessUnitBrand & { inUse: number })[]
> {
  const units = await getBusinessUnits();
  if (units.length === 0) return [];
  // One grouped count keeps this to a single extra query regardless of list size.
  const counts = await prisma.user.groupBy({
    by: ["businessUnitId"],
    _count: { _all: true },
  });
  const byId = new Map<string, number>();
  for (const c of counts) {
    if (c.businessUnitId) byId.set(c.businessUnitId, c._count._all);
  }
  return units.map((u) => ({ ...u, inUse: byId.get(u.id) ?? 0 }));
}

/** A single business unit's brand by id, or null (missing / un-migrated). */
export async function getBusinessUnitBrand(id: string): Promise<BusinessUnitBrand | null> {
  if (!id) return null;
  try {
    return await prisma.businessUnit.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        platformName: true,
        shortName: true,
        logoUrl: true,
        primaryColor: true,
        accentColor: true,
      },
    });
  } catch {
    return null;
  }
}
