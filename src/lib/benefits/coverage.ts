/**
 * Company coverage math (spec 012). Single source of truth used by BOTH the server rules/action
 * and the client selector, so the client mirror can never drift from the server (which remains the
 * enforcing boundary). The employee enters the full COST; the company covers `rate` percent.
 */

/** Clamp a coverage rate to a valid whole percent 0–100. */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 100;
  return Math.min(100, Math.max(0, Math.round(rate)));
}

/**
 * Covered (company) amount = cost × rate / 100 — the part that draws from the pool.
 * Cost is 1,000-stepped and rate is an integer percent, so this is a whole number; we still round
 * defensively. Never re-rounded to a step (a non-1,000 covered like 7,200 is correct — DC-2).
 */
export function coveredAmount(cost: number, rate: number): number {
  const c = Math.max(0, Math.floor(cost));
  return Math.round((c * clampRate(rate)) / 100);
}

/** The employee's out-of-pocket share = cost − covered. */
export function outOfPocket(cost: number, rate: number): number {
  return Math.max(0, Math.floor(cost)) - coveredAmount(cost, rate);
}
