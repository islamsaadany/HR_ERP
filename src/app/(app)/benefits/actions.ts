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
import { coveredAmount } from "@/lib/benefits/coverage";

export type SelectionPayload = {
  // The employee enters the full cost; the covered (company) share draws from the pool (spec 012).
  items: { key: string; cost: number }[];
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

  // Coerce + map non-medical lines. The employee enters the COST; the covered (company) share
  // = cost × coverageRate/100 is what draws from the pool (spec 012).
  const lines = payload.items
    .filter((i) => {
      const item = byKey.get(i.key);
      return item && !item.isMedical;
    })
    .map((i) => ({
      key: i.key,
      name: byKey.get(i.key)!.name,
      cost: coerceAmount(i.cost),
      coverageRate: byKey.get(i.key)!.coverageRate,
    }))
    .filter((l) => l.cost > 0);

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

  // Build the line set (non-medical + medical premium line). `amount` = covered pool draw;
  // `cost` = the full price entered (spec 012). Medical: cost = amount = premium (100% covered).
  const lineData: { catalogItemId: string; amount: number; cost: number }[] = lines.map((l) => ({
    catalogItemId: byKey.get(l.key)!.id,
    amount: coveredAmount(l.cost, l.coverageRate),
    cost: l.cost,
  }));
  if (medical.selected && medicalItem) {
    lineData.push({
      catalogItemId: medicalItem.id,
      amount: result.medicalAmount,
      cost: result.medicalAmount,
    });
  }

  // Claimed-benefit lock (server-authoritative): a basket item with an active claim (pending
  // review or reimbursed) can't be removed or reduced below what's already been claimed for it.
  // The client dims these too, but the server is the boundary that actually enforces it.
  const activeClaims = await prisma.benefitClaim.findMany({
    where: {
      userId: me.id,
      planYearId: planYear.id,
      status: { in: ["PENDING", "RELEASED"] },
      catalogItemId: { not: null },
    },
    select: { catalogItemId: true, amount: true },
  });
  if (activeClaims.length > 0) {
    const claimedById = new Map<string, number>();
    for (const c of activeClaims) {
      if (c.catalogItemId) {
        claimedById.set(c.catalogItemId, (claimedById.get(c.catalogItemId) ?? 0) + c.amount);
      }
    }
    const incomingById = new Map<string, number>();
    for (const l of lineData) {
      incomingById.set(l.catalogItemId, (incomingById.get(l.catalogItemId) ?? 0) + l.amount);
    }
    const lockErrors: string[] = [];
    for (const [itemId, claimedSum] of claimedById) {
      if ((incomingById.get(itemId) ?? 0) < claimedSum) {
        const name = catalog.find((c) => c.id === itemId)?.name ?? "A claimed benefit";
        lockErrors.push(
          `${name} can't be removed or reduced below the ${claimedSum.toLocaleString()} already claimed.`
        );
      }
    }
    if (lockErrors.length > 0) return { ok: false, errors: lockErrors, warnings: [] };
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

export type ReopenResult = { ok: boolean; error?: string; status?: "DRAFT" };

/**
 * Self-service reopen: an employee unlocks their OWN submitted basket back to DRAFT so they can
 * allocate the rest of their pool and re-submit — no HR involvement. Guarded so it stays safe:
 *  - only while the plan-year window is open (else they'd reopen and be unable to re-submit);
 *  - only their own selection, and only if it's currently SUBMITTED.
 * Already-filed claims are untouched; the claimed-benefit locks in saveBasket prevent a claimed
 * benefit from being removed or reduced below what's been claimed when they save/submit again.
 */
export async function reopenOwnSelection(): Promise<ReopenResult> {
  const me = await requireUser();

  const planYear = await getActivePlanYear();
  if (!planYear) return { ok: false, error: "Benefits selection isn't open right now." };

  const existing = await prisma.benefitSelection.findUnique({
    where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "You don't have a submitted basket to update yet." };
  // Already editable — nothing to do, but report success so the UI just shows the draft view.
  if (existing.status !== "SUBMITTED") return { ok: true, status: "DRAFT" };

  await prisma.benefitSelection.update({
    where: { id: existing.id },
    data: { status: "DRAFT", submittedAt: null },
  });

  revalidatePath("/benefits");
  revalidatePath("/dashboard");
  return { ok: true, status: "DRAFT" };
}
