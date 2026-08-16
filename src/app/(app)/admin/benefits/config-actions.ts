"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EmploymentType, TenureBand } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

/** Parse a coverage-rate field. Returns a whole percent 1–100, or `undefined` if not provided.
 *  Rejects 0 / out-of-range (spec 018, FR-018) by redirecting with an error message. */
function parseCoverageRate(raw: FormDataEntryValue | null): number | undefined {
  if (raw == null || String(raw).trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || Math.round(n) < 1 || Math.round(n) > 100) {
    redirect("/admin/benefits?error=" + encodeURIComponent("Coverage must be between 1% and 100%."));
  }
  return Math.round(n);
}

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

// All eight per-employment-type × band amount columns on a guaranteed benefit (spec 021).
const GB_AMOUNT_COLS = [
  "ftBand6mo2y", "ftBand2to4y", "ftBand4to7y", "ftBand7to10y",
  "ptBand6mo2y", "ptBand2to4y", "ptBand4to7y", "ptBand7to10y",
] as const;

/**
 * Save guaranteed-benefit amounts (spec 021). One numbers-only form per employment type on the
 * Amounts tab submits its four band cells per benefit (fields `gb_<id>_<column>`). The action
 * iterates every benefit and updates only the columns present in this submission, so the FT form
 * never touches PT columns and vice-versa. Blank fields are left unchanged — that's how
 * salary-driven rows (Loans, all-null bands) stay null.
 */
export async function updateGuaranteedAmounts(formData: FormData): Promise<void> {
  await requireAdmin();
  const items = await prisma.guaranteedBenefit.findMany({ select: { id: true } });
  for (const { id } of items) {
    const data: Record<string, number> = {};
    for (const key of GB_AMOUNT_COLS) {
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

/** The four per-tenure-band amount columns on a fixed-allowance catalogue item (spec 028). */
const FLEX_ALLOWANCE_COLS = ["band6mo2y", "band2to4y", "band4to7y", "band7to10y"] as const;

/**
 * Save the fixed per-band amounts on flexible allowance benefits (spec 028 — travel allowance).
 *
 * Mirrors `updateGuaranteedAmounts`, with one difference that is the point of the feature: there is
 * a SINGLE set of four amounts, applied to full- and part-timers alike. Their pool ceilings already
 * differ by employment type, so a second set of figures would add no expressiveness and one more
 * way for the two to fall out of step.
 *
 * Only items that already carry a band amount are updated — setting amounts is how an item BECOMES
 * an allowance, and that shouldn't happen by accident from a form that lists every benefit.
 */
export async function updateFlexAllowanceAmounts(formData: FormData): Promise<void> {
  await requireAdmin();
  const items = await prisma.benefitCatalogItem.findMany({
    where: { OR: FLEX_ALLOWANCE_COLS.map((c) => ({ [c]: { not: null } })) },
    select: { id: true },
  });
  for (const { id } of items) {
    const data: Record<string, number> = {};
    for (const key of FLEX_ALLOWANCE_COLS) {
      const raw = formData.get(`fa_${id}_${key}`);
      if (raw == null || String(raw).trim() === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      data[key] = Math.max(0, Math.round(n));
    }
    if (Object.keys(data).length) {
      await prisma.benefitCatalogItem.update({ where: { id }, data });
    }
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

/**
 * Set who a benefit is available to (spec 021) — the FT / PT eligibility checkboxes in the unified
 * Benefits Catalogue. Works for both guaranteed benefits and flexible/medical catalog items. A
 * checkbox that is unticked sends nothing, so absence = not eligible.
 */
export async function setEligibility(formData: FormData): Promise<void> {
  await requireAdmin();
  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const eligibleFullTime = formData.get("eligibleFullTime") != null;
  const eligiblePartTime = formData.get("eligiblePartTime") != null;
  if (kind === "guaranteed") {
    await prisma.guaranteedBenefit.update({ where: { id }, data: { eligibleFullTime, eligiblePartTime } });
  } else {
    await prisma.benefitCatalogItem.update({ where: { id }, data: { eligibleFullTime, eligiblePartTime } });
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

export type CellResult = { ok: true } | { ok: false; error: string };

/**
 * Inline-edit a single cell in the unified Benefits Catalogue grid (spec 021). Routes by field and
 * kind; server-authoritative (validates coverage 1–100, blocks coverage on medical, guards kinds).
 * Mirrors the employee registry's per-cell save (`updateEmployeeField`).
 */
export async function updateCatalogueCell(
  kind: "guaranteed" | "catalog",
  id: string,
  key: string,
  value: string
): Promise<CellResult> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Missing benefit id." };

  try {
    if (key === "name") {
      const name = value.trim();
      if (!name) return { ok: false, error: "Name can't be empty." };
      if (kind === "guaranteed") await prisma.guaranteedBenefit.update({ where: { id }, data: { name } });
      else await prisma.benefitCatalogItem.update({ where: { id }, data: { name } });
    } else if (key === "category") {
      const category = value.trim() || null;
      if (kind === "guaranteed") await prisma.guaranteedBenefit.update({ where: { id }, data: { category } });
      else await prisma.benefitCatalogItem.update({ where: { id }, data: { category } });
    } else if (key === "claimType") {
      if (!["NONE", "NOTE", "PROOF"].includes(value)) return { ok: false, error: "Invalid claim requirement." };
      const claimType = value as "NONE" | "NOTE" | "PROOF";
      if (kind === "guaranteed") await prisma.guaranteedBenefit.update({ where: { id }, data: { claimType } });
      else await prisma.benefitCatalogItem.update({ where: { id }, data: { claimType } });
    } else if (key === "eligibleFullTime" || key === "eligiblePartTime") {
      const v = value === "true";
      const data = key === "eligibleFullTime" ? { eligibleFullTime: v } : { eligiblePartTime: v };
      if (kind === "guaranteed") await prisma.guaranteedBenefit.update({ where: { id }, data });
      else await prisma.benefitCatalogItem.update({ where: { id }, data });
    } else if (key === "coverageRate") {
      if (kind !== "catalog") return { ok: false, error: "Coverage applies to flexible benefits only." };
      const item = await prisma.benefitCatalogItem.findUnique({ where: { id }, select: { isMedical: true } });
      if (!item) return { ok: false, error: "Benefit not found." };
      if (item.isMedical) return { ok: false, error: "Medical is always 100% covered." };
      const n = Math.round(Number(value));
      if (!Number.isFinite(n) || n < 1 || n > 100) return { ok: false, error: "Coverage must be 1–100%." };
      await prisma.benefitCatalogItem.update({ where: { id }, data: { coverageRate: n } });
    } else if (key === "active") {
      if (kind !== "catalog") return { ok: false, error: "Only flexible/medical items can be hidden." };
      await prisma.benefitCatalogItem.update({ where: { id }, data: { active: value === "true" } });
    } else {
      return { ok: false, error: "Unknown field." };
    }
  } catch {
    return { ok: false, error: "Save failed — try again." };
  }
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
  return { ok: true };
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

/** Edit a basket item's name / category / description / order / coverage rate (not its key or medical flag). */
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
  // Coverage rate (spec 012/018): whole percent 1–100 (0 rejected). Server-authoritative.
  const coverageRate = parseCoverageRate(formData.get("coverageRate"));
  await prisma.benefitCatalogItem.update({
    where: { id },
    data: {
      name,
      category,
      description,
      ...(order !== undefined ? { order } : {}),
      ...(coverageRate !== undefined ? { coverageRate } : {}),
    },
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
  // Coverage rate (spec 018): whole percent 1–100 (0 rejected); default 100 when not provided.
  const coverageRate = parseCoverageRate(formData.get("coverageRate")) ?? 100;
  const base = slugify(name);
  let key = base;
  let n = 1;
  // Ensure the derived key is unique.
  while (await prisma.benefitCatalogItem.findUnique({ where: { key } })) {
    key = `${base}-${++n}`;
  }
  const max = await prisma.benefitCatalogItem.aggregate({ _max: { order: true } });
  await prisma.benefitCatalogItem.create({
    data: { key, name, category, coverageRate, order: (max._max.order ?? 0) + 1, active: true },
  });
  revalidatePath("/admin/benefits");
  revalidatePath("/benefits");
}

// The medical rate card is now age-banded (spec 023) — edited band-by-band via
// `updateMedicalRateBand` in ./actions.ts. The old flat self/spouse/child updater was removed.
