import type { EmploymentType } from "@prisma/client";
import { coveredAmount } from "@/lib/benefits/coverage";

export const STEP = 1000;
// Selection limits (spec 012): full-time 5 (raised from 4), part-time 3 (raised from 2).
export const MAX_SELECT_FULL_TIME = 5;
export const MAX_SELECT_PART_TIME = 3;

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
  /**
   * Non-medical selected lines. The employee enters `cost`; the covered (company) share
   * = cost × coverageRate/100 is what draws from the pool (spec 012).
   */
  lines: { key: string; name: string; cost: number; coverageRate: number }[];
  medical: MedicalConfig;
  medicalRate: MedicalRate;
};

export type BasketResult = {
  total: number; // covered (company) total drawn from the pool
  medicalAmount: number;
  medicalRaw: number;
  cap: number; // 50% of ceiling (applied to a line's covered share)
  remaining: number;
  selectionCount: number;
  maxSelect: number;
  errors: string[];
  warnings: string[];
};

/** Server-authoritative evaluation of a basket against all rules — on the COVERED amount. */
export function evaluateBasket(input: BasketInput): BasketResult {
  const { employmentType, ceiling, lines, medical, medicalRate } = input;
  const isFT = employmentType === "FULL_TIME";
  const cap = Math.floor(ceiling * 0.5);
  const maxSelect = isFT ? MAX_SELECT_FULL_TIME : MAX_SELECT_PART_TIME;

  const errors: string[] = [];
  const warnings: string[] = [];

  const medicalRaw = computeMedicalPremium(medicalRate, medical);
  const medicalAmount = medical.selected ? Math.min(medicalRaw, ceiling) : 0;

  let nonMedicalCovered = 0;
  for (const line of lines) {
    if (line.cost <= 0) continue;
    const covered = coveredAmount(line.cost, line.coverageRate);
    nonMedicalCovered += covered;
    if (line.cost % STEP !== 0) {
      warnings.push(`${line.name}: costs should be in steps of ${STEP}.`);
    }
    // 50% single-benefit cap — full-time, non-medical only, on the COVERED share.
    if (isFT && covered > cap) {
      errors.push(
        `${line.name}: the company share exceeds 50% of your pool (max ${cap.toLocaleString()}).`
      );
    }
  }

  const selectionCount =
    lines.filter((l) => l.cost > 0).length + (medical.selected ? 1 : 0);
  if (selectionCount > maxSelect) {
    errors.push(
      `Too many benefits selected (max ${maxSelect}${isFT ? "" : " for part-time"}).`
    );
  }

  const total = nonMedicalCovered + medicalAmount;
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

/** Coerce a raw amount to a non-negative multiple of STEP (used for the entered cost). */
export function coerceAmount(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n / STEP) * STEP;
}
