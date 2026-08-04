"use server";

import { revalidatePath } from "next/cache";
import type { EmploymentType, TenureBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

const TYPES: EmploymentType[] = ["FULL_TIME", "PART_TIME"];
const BANDS: TenureBand[] = ["BAND_6MO_2Y", "BAND_2_4Y", "BAND_4_7Y", "BAND_7_10Y"];

/**
 * Save the pool-ceiling grid (employment type × tenure band → annual EGP). One form
 * submits all 8 cells; blanks/invalid values are skipped, negatives clamped to 0.
 * These feed the server-authoritative rule engine (pool = type × tenure).
 */
export async function updatePoolCeilings(formData: FormData): Promise<void> {
  await requireAdmin();
  for (const employmentType of TYPES) {
    for (const tenureBand of BANDS) {
      const raw = formData.get(`ceil_${employmentType}_${tenureBand}`);
      if (raw == null || String(raw).trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const amount = Math.max(0, Math.round(n));
      await prisma.poolCeiling.upsert({
        where: { employmentType_tenureBand: { employmentType, tenureBand } },
        update: { amount },
        create: { employmentType, tenureBand, amount },
      });
    }
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}
