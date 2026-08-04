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

const GB_BANDS = ["band6mo2y", "band2to4y", "band4to7y", "band7to10y"] as const;

/**
 * Save guaranteed-benefit amounts per tenure band. One form per employment type; the
 * action iterates every guaranteed benefit and updates only the band fields present in
 * this submission (so the FT form never touches PT rows, and vice-versa). Blank fields
 * are left unchanged — that's how salary-driven rows (Loans, all-null bands) stay null.
 */
export async function updateGuaranteedAmounts(formData: FormData): Promise<void> {
  await requireAdmin();
  const items = await prisma.guaranteedBenefit.findMany({ select: { id: true } });
  for (const { id } of items) {
    const data: Record<string, number> = {};
    for (const key of GB_BANDS) {
      const raw = formData.get(`gb_${id}_${key}`);
      if (raw == null || String(raw).trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      data[key] = Math.max(0, Math.round(n));
    }
    if (Object.keys(data).length) {
      await prisma.guaranteedBenefit.update({ where: { id }, data });
    }
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "item"
  );
}

/** Edit a basket item's name / category / description / order (not its key or medical flag). */
export async function updateCatalogItem(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  const category = String(formData.get("category") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const orderRaw = formData.get("order");
  const orderN = Number(orderRaw);
  const order = orderRaw != null && String(orderRaw).trim() !== "" && Number.isFinite(orderN)
    ? Math.max(0, Math.round(orderN))
    : undefined;
  await prisma.benefitCatalogItem.update({
    where: { id },
    data: { name, category, description, ...(order !== undefined ? { order } : {}) },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/** Show/hide a basket item. We deactivate rather than delete so existing baskets never break. */
export async function toggleCatalogItem(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const active = formData.get("active") === "true";
  await prisma.benefitCatalogItem.update({ where: { id }, data: { active } });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/** Add a new basket item. Its unique key is derived from the name (deduped). */
export async function createCatalogItem(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const category = String(formData.get("category") ?? "").trim() || null;
  const base = slugify(name);
  let key = base;
  let n = 1;
  // Ensure the derived key is unique.
  while (await prisma.benefitCatalogItem.findUnique({ where: { key } })) {
    key = `${base}-${++n}`;
  }
  const max = await prisma.benefitCatalogItem.aggregate({ _max: { order: true } });
  await prisma.benefitCatalogItem.create({
    data: { key, name, category, order: (max._max.order ?? 0) + 1, active: true },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/** Save the flat medical rate card (self · spouse · child<18 · child18+). Single row. */
export async function updateMedicalRateCard(formData: FormData): Promise<void> {
  await requireAdmin();
  const fields = ["self", "spouse", "childUnder18", "child18Plus"] as const;
  const data: Record<string, number> = {};
  for (const f of fields) {
    const raw = formData.get(f);
    if (raw == null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    data[f] = Math.max(0, Math.round(n));
  }
  const existing = await prisma.medicalRateCard.findFirst();
  if (existing) {
    if (Object.keys(data).length) {
      await prisma.medicalRateCard.update({ where: { id: existing.id }, data });
    }
  } else {
    await prisma.medicalRateCard.create({
      data: {
        self: data.self ?? 0,
        spouse: data.spouse ?? 0,
        childUnder18: data.childUnder18 ?? 0,
        child18Plus: data.child18Plus ?? 0,
      },
    });
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}
