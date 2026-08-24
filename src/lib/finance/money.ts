/**
 * Two-decimal EGP money for the Finance module (spec 039).
 *
 * THE RULE: money is stored as `Decimal(10,2)` in Postgres (readable to anyone querying
 * the ledger directly, matching `MedicalRateBand.annualPremium`), and every calculation is
 * done in integer **piastres** (1 EGP = 100 piastres). This file is the ONLY boundary
 * between the two — nothing else in the codebase may add, subtract or compare petty cash
 * amounts as floating-point numbers.
 *
 * Why: a reconciliation that is out by 0.01 destroys trust in the whole screen, and
 * `0.1 + 0.2 !== 0.3` in every JavaScript runtime. Integers cannot drift.
 *
 * Benefits money is a different thing (whole EGP `Int`, `formatEGP`) and is untouched.
 */

/** The largest amount a single line or request may carry: 9,999,999.99 → in piastres. */
export const MAX_PIASTRES = 999_999_999;

/**
 * Anything Prisma may hand back for a `Decimal` column — a Decimal instance, a string, a
 * number, or null. Typed structurally so this module never imports the Prisma runtime.
 */
type DecimalLike = { toString(): string } | string | number | null | undefined;

/**
 * Storage → arithmetic. Returns whole piastres, rounding half-up at the third decimal so a
 * value that somehow arrived with more precision than the column allows cannot silently
 * truncate money away. Null/undefined/unparseable → 0.
 */
export function toPiastres(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Arithmetic → storage/display. Returns a number with at most two decimals, safe to hand to
 * Prisma for a `Decimal(10,2)` column and to `formatEGP2` for display.
 *
 * The value stays SIGNED: a negative closing balance means the company owes the custodian,
 * and flooring it to zero would hide exactly the number this feature exists to show.
 */
export function fromPiastres(piastres: number): number {
  return Math.round(piastres) / 100;
}

/** Exact sum in piastres. Use this instead of `arr.reduce((a, b) => a + b)` on EGP numbers. */
export function sumPiastres(values: number[]): number {
  let total = 0;
  for (const v of values) total += Math.round(v);
  return total;
}

export type AmountParse =
  | { ok: true; piastres: number }
  | { ok: false; error: string };

/**
 * Parse an amount typed by a person into piastres, with the refusals stated as sentences the
 * UI can show directly. Deliberately strict — we refuse rather than clamp or round, because a
 * silently-adjusted amount is a receipt that no longer matches its evidence.
 *
 * Accepts an optional leading "EGP", thousands separators, and a leading + sign, because
 * people paste figures out of the very spreadsheet this replaces.
 */
export function parseAmountInput(raw: unknown): AmountParse {
  const text = String(raw ?? "")
    .replace(/egp/gi, "")
    .replace(/[,\s ]/g, "")
    .replace(/^\+/, "")
    .trim();

  if (!text) return { ok: false, error: "Enter an amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    // Distinguish the two failures people actually make, so the message is actionable.
    if (/^\d+(\.\d+)?$/.test(text)) {
      return { ok: false, error: "Amounts can have at most two decimals." };
    }
    if (text.startsWith("-")) {
      return {
        ok: false,
        error: "Amounts are always positive — record a correction as a separate entry.",
      };
    }
    return { ok: false, error: "Enter an amount as a number, for example 1530.00." };
  }

  const piastres = Math.round(Number(text) * 100);
  if (piastres <= 0) return { ok: false, error: "Enter an amount greater than zero." };
  if (piastres > MAX_PIASTRES) {
    return { ok: false, error: "That amount is too large — the limit is 9,999,999.99." };
  }
  return { ok: true, piastres };
}
