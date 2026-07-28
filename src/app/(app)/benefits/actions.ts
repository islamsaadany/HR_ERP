"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { getActivePlanYear, getMedicalRate } from "@/lib/benefits/config";
import {
  coerceAmount,
  evaluateBasket,
  type MedicalConfig,
} from "@/lib/benefits/rules";

export type SelectionPayload = {
  items: { key: string; amount: number }[];
  medical: {
    selected: boolean;
    spouse: boolean;
    childrenUnder18: number;
    children18Plus: number;
  };
};

export type SaveResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  status?: "DRAFT" | "SUBMITTED";
};

export async function saveBasket(
  payload: SelectionPayload,
  submit: boolean
): Promise<SaveResult> {
  const me = await requireUser();

  const planYear = await getActivePlanYear();
  if (!planYear)
    return { ok: false, errors: ["Benefits selection isn't open right now."], warnings: [] };

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { employmentType: true, tenureBand: true },
  });
  if (!user?.employmentType || !user?.tenureBand) {
    return {
      ok: false,
      errors: ["Your employment type or tenure isn't set — contact HR."],
      warnings: [],
    };
  }

  const [ceilingRow, catalog, medicalRate] = await Promise.all([
    prisma.poolCeiling.findUnique({
      where: {
        employmentType_tenureBand: {
          employmentType: user.employmentType,
          tenureBand: user.tenureBand,
        },
      },
    }),
    prisma.benefitCatalogItem.findMany({ where: { active: true } }),
    getMedicalRate(),
  ]);

  if (!ceilingRow || !medicalRate) {
    return { ok: false, errors: ["Benefits aren't fully configured yet."], warnings: [] };
  }

  const byKey = new Map(catalog.map((c) => [c.key, c]));
  const medicalItem = catalog.find((c) => c.isMedical);

  // Coerce + map non-medical lines.
  const lines = payload.items
    .filter((i) => {
      const item = byKey.get(i.key);
      return item && !item.isMedical;
    })
    .map((i) => ({
      key: i.key,
      name: byKey.get(i.key)!.name,
      amount: coerceAmount(i.amount),
    }))
    .filter((l) => l.amount > 0);

  const medical: MedicalConfig = {
    selected: payload.medical.selected && !!medicalItem,
    spouse: payload.medical.spouse,
    childrenUnder18: Math.max(0, Math.floor(payload.medical.childrenUnder18)),
    children18Plus: Math.max(0, Math.floor(payload.medical.children18Plus)),
  };

  const result = evaluateBasket({
    employmentType: user.employmentType,
    ceiling: ceilingRow.amount,
    lines,
    medical,
    medicalRate,
  });

  if (submit && result.errors.length > 0) {
    return { ok: false, errors: result.errors, warnings: result.warnings };
  }

  // Locked once submitted (until HR reopens by setting status back to DRAFT).
  const existing = await prisma.benefitSelection.findUnique({
    where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
  });
  if (existing?.status === "SUBMITTED") {
    return {
      ok: false,
      errors: ["Your basket is submitted and locked. Ask HR to reopen it to edit."],
      warnings: [],
    };
  }

  // Build the line set (non-medical + medical premium line).
  const lineData: { catalogItemId: string; amount: number }[] = lines.map((l) => ({
    catalogItemId: byKey.get(l.key)!.id,
    amount: l.amount,
  }));
  if (medical.selected && medicalItem) {
    lineData.push({ catalogItemId: medicalItem.id, amount: result.medicalAmount });
  }

  await prisma.$transaction(async (tx) => {
    const sel = await tx.benefitSelection.upsert({
      where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
      create: {
        userId: me.id,
        planYearId: planYear.id,
        status: submit ? "SUBMITTED" : "DRAFT",
        submittedAt: submit ? new Date() : null,
        medicalSpouse: medical.spouse,
        medicalChildrenUnder18: medical.childrenUnder18,
        medicalChildren18Plus: medical.children18Plus,
      },
      update: {
        status: submit ? "SUBMITTED" : "DRAFT",
        submittedAt: submit ? new Date() : null,
        medicalSpouse: medical.spouse,
        medicalChildrenUnder18: medical.childrenUnder18,
        medicalChildren18Plus: medical.children18Plus,
      },
    });
    await tx.selectionLine.deleteMany({ where: { selectionId: sel.id } });
    if (lineData.length > 0) {
      await tx.selectionLine.createMany({
        data: lineData.map((l) => ({ ...l, selectionId: sel.id })),
      });
    }
  });

  revalidatePath("/benefits");
  revalidatePath("/dashboard");
  return {
    ok: true,
    errors: [],
    warnings: result.warnings,
    status: submit ? "SUBMITTED" : "DRAFT",
  };
}
