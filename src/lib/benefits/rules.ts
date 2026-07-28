import type { EmploymentType } from "@prisma/client";

export const STEP = 1000;
export const MAX_SELECT_FULL_TIME = 4;
export const MAX_SELECT_PART_TIME = 2;

export type MedicalConfig = {
  selected: boolean;
  spouse: boolean;
  childrenUnder18: number;
  children18Plus: number;
};

export type MedicalRate = {
  self: number;
  spouse: number;
  childUnder18: number;
  child18Plus: number;
};

/** Medical premium — self always included; dependants per the rate card. */
export function computeMedicalPremium(
  rate: MedicalRate,
  cfg: MedicalConfig
): number {
  if (!cfg.selected) return 0;
  return (
    rate.self +
    (cfg.spouse ? rate.spouse : 0) +
    rate.childUnder18 * Math.max(0, cfg.childrenUnder18) +
    rate.child18Plus * Math.max(0, cfg.children18Plus)
  );
}

export type BasketInput = {
  employmentType: EmploymentType;
  ceiling: number;
  /** non-medical selected lines */
  lines: { key: string; name: string; amount: number }[];
  medical: MedicalConfig;
  medicalRate: MedicalRate;
};

export type BasketResult = {
  total: number;
  medicalAmount: number;
  medicalRaw: number;
  cap: number; // 50% of ceiling
  remaining: number;
  selectionCount: number;
  maxSelect: number;
  errors: string[];
  warnings: string[];
};

/** Server-authoritative evaluation of a basket against all rules. */
export function evaluateBasket(input: BasketInput): BasketResult {
  const { employmentType, ceiling, lines, medical, medicalRate } = input;
  const isFT = employmentType === "FULL_TIME";
  const cap = Math.floor(ceiling * 0.5);
  const maxSelect = isFT ? MAX_SELECT_FULL_TIME : MAX_SELECT_PART_TIME;

  const errors: string[] = [];
  const warnings: string[] = [];

  const medicalRaw = computeMedicalPremium(medicalRate, medical);
  const medicalAmount = medical.selected ? Math.min(medicalRaw, ceiling) : 0;

  let nonMedicalTotal = 0;
  for (const line of lines) {
    if (line.amount <= 0) continue;
    nonMedicalTotal += line.amount;
    if (line.amount % STEP !== 0) {
      warnings.push(`${line.name}: amounts should be in steps of ${STEP}.`);
    }
    // 50% single-benefit cap — full-time, non-medical only.
    if (isFT && line.amount > cap) {
      errors.push(
        `${line.name} exceeds 50% of your pool (max ${cap.toLocaleString()}).`
      );
    }
  }

  const selectionCount =
    lines.filter((l) => l.amount > 0).length + (medical.selected ? 1 : 0);
  if (selectionCount > maxSelect) {
    errors.push(
      `Too many benefits selected (max ${maxSelect}${isFT ? "" : " for part-time"}).`
    );
  }

  const total = nonMedicalTotal + medicalAmount;
  if (total > ceiling) {
    errors.push(
      `Over your pool by ${(total - ceiling).toLocaleString()} (ceiling ${ceiling.toLocaleString()}).`
    );
  }

  if (medical.selected && medicalRaw > ceiling) {
    warnings.push(
      `Medical premium of ${medicalRaw.toLocaleString()} exceeds your pool — capped at ${ceiling.toLocaleString()}.`
    );
  }

  return {
    total,
    medicalAmount,
    medicalRaw,
    cap,
    remaining: ceiling - total,
    selectionCount,
    maxSelect,
    errors,
    warnings,
  };
}

/** Coerce a raw amount to a non-negative multiple of STEP. */
export function coerceAmount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / STEP) * STEP;
}
