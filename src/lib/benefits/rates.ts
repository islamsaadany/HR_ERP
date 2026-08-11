// Age-banded per-person medical pricing (spec 023). Pure, deterministic, no I/O.
//
// A covered person's annual premium is read from the Tier-1 age table by their age AT THE COMMIT DATE.
// The employee's premium is the SUM over the employee + covered dependants. Every employee-facing and
// committed figure is WHOLE EGP with the cents DROPPED (truncated, not rounded) — 7,181.70 → 7,181.
//
// Server-authoritative: the commit path computes the premium here; the client mirrors it for preview.

/** One age band of a medical rate card. `maxAge` null = open-ended top band. */
export type Band = {
  tier: number;
  minAge: number;
  maxAge: number | null;
  annualPremium: number; // two-decimal money from the rate card (cents dropped at pricing time)
};

/** A person to price — only their date of birth matters. */
export type PricedPerson = { dob: Date };

/** One line of a premium breakdown. */
export type PremiumLine = { ageAtCommit: number; premiumEGP: number; overTop: boolean };

/** Completed years from `dob` to `refDate` (birthday-aware). Never negative. */
export function ageAt(dob: Date, refDate: Date): number {
  let age = refDate.getFullYear() - dob.getFullYear();
  const m = refDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && refDate.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

/**
 * The band an age falls in. Bands are inclusive by completed years. An age above the top band's
 * maxAge maps to the **top band** with `overTop = true` (spec 023 — priced at the top band, flagged
 * for HR). An age below the lowest band maps to the lowest band.
 */
export function bandFor(age: number, bands: Band[]): { band: Band; overTop: boolean } {
  const sorted = [...bands].sort((a, b) => a.minAge - b.minAge);
  const top = sorted[sorted.length - 1];
  for (const band of sorted) {
    const withinTop = band.maxAge == null || age <= band.maxAge;
    if (age >= band.minAge && withinTop) return { band, overTop: false };
  }
  // Above the top band's maxAge → top band, flagged. (Below the lowest → lowest band.)
  if (top && age > (top.maxAge ?? Infinity)) return { band: top, overTop: true };
  return { band: sorted[0], overTop: false };
}

/** The rate-card annual premium (raw, with cents) for one person at the reference date. */
export function annualPremiumForPerson(
  dob: Date,
  refDate: Date,
  bands: Band[]
): { amount: number; ageAtCommit: number; overTop: boolean } {
  const age = ageAt(dob, refDate);
  const { band, overTop } = bandFor(age, bands);
  return { amount: band.annualPremium, ageAtCommit: age, overTop };
}

/**
 * Sum the age-band premiums over the employee + covered dependants. Each person's premium is
 * TRUNCATED to whole EGP (cents dropped) BEFORE summing, so the breakdown lines always add up exactly
 * to `annualEGP`. Returns per-person lines and whether anyone landed over the top band.
 */
export function sumMedicalPremium(
  people: PricedPerson[],
  bands: Band[],
  refDate: Date
): { annualEGP: number; lines: PremiumLine[]; anyOverTop: boolean } {
  const lines: PremiumLine[] = people.map((p) => {
    const { amount, ageAtCommit, overTop } = annualPremiumForPerson(p.dob, refDate, bands);
    return { ageAtCommit, premiumEGP: Math.trunc(amount), overTop };
  });
  const annualEGP = lines.reduce((sum, l) => sum + l.premiumEGP, 0);
  const anyOverTop = lines.some((l) => l.overTop);
  return { annualEGP, lines, anyOverTop };
}

/** Prorate a whole-EGP annual premium by the medical fraction (spec 019), dropping cents. */
export function proratedPremiumEGP(annualEGP: number, fraction: number): number {
  if (annualEGP <= 0 || fraction <= 0) return 0;
  return Math.trunc(annualEGP * fraction);
}
