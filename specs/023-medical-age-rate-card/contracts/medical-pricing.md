# Contract — Medical Pricing & Commit (Tier 1, age-banded)

Server-authoritative. The client mirrors this for the live preview only (Constitution III).

## Pure helpers (`src/lib/benefits/rates.ts`)

```
ageAt(dob: Date, refDate: Date): number
  → completed years from dob to refDate (birthday-aware). refDate = commit date.

bandFor(age: number, bands: Band[]): { band: Band; overTop: boolean }
  → the band with minAge ≤ age ≤ maxAge.
  → age > top maxAge → { band: topBand, overTop: true }  (FR-012)
  → age below the lowest minAge (shouldn't occur; minAge 0) → lowest band.

annualPremiumForPerson(dob: Date, refDate: Date, bands: Band[]): { amount: Decimal; overTop: boolean }
  → bandFor(ageAt(dob, refDate)).band.annualPremium  (the rate-card decimal figure)

sumMedicalPremium(people: {dob: Date}[], bands: Band[], refDate: Date):
  { annualEGP: number; lines: {ageAtCommit, premiumEGP, overTop}[]; anyOverTop: boolean }
  → per person: premiumEGP = Math.round(annualPremiumForPerson.amount)  ← whole EGP, no cents
  → annualEGP = Σ premiumEGP  (so the breakdown sums exactly to the total)
```

`Band = { tier, minAge, maxAge, annualPremium }`.

## Commit computation (`commitMedical` in `benefits/actions.ts`)

Inputs: the employee (with `dateOfBirth`, `startDate`, `employmentType`), the selected covered
dependant IDs (spouse + children), the active plan year (window), the pool ceiling, the Tier-1 bands.

```
1. Gate eligibility (unchanged): medical unlocks at 3 months; NOT_YET → reject.
2. Gate DOB: employee.dateOfBirth present → else reject "A date of birth is required for medical…". (FR-005)
   Each selected dependant resolvable with a DOB and belongs to this employee → else reject. (FR-007)
   Personal/Family scope (spec 021) unchanged: a Personal-only employee covers only themselves.
3. refDate = now (the commit date). (FR-004, decision #1)
4. people = [employee] + selected dependants (each {dob}).
   For each person: perPersonEGP = Math.round(annualPremiumForPerson(dob, refDate, bands)).  ← whole EGP, no cents
   annualEGP = Σ perPersonEGP.  (lines carry the whole-EGP figure; anyOverTop flagged)
5. Prorate: fraction = classifyEligibility(employee.startDate, 3, planYearWindow(planYear)).fraction  (spec 019)
   premium = Math.round(annualEGP × fraction)  → whole EGP.   (FR-011; whole-EGP refinement 2026-08-11)
   (Per-person rounding first means the displayed breakdown sums exactly to annualEGP / the committed premium.)
7. Cap at pool ceiling: committed = min(premium, ceiling); if premium > ceiling → warn "…capped, contact HR".
8. Persist: MedicalCommitment { premium: committed, committedAt: refDate, … } +
   one MedicalCoveredPerson per line (dependantId null for the employee), storing ageAtCommit & annualPremium.
   If anyOverTop → attach an HR-review flag/notice (surfaced on the admin submissions view). (FR-012)
9. Locked after commit (unchanged): employee cannot edit; HR edit/remove via admin. (FR-009)
```

## Worked examples (whole-EGP, per-person round-then-sum; must match in `tsx` verification)

Bands: 25–29 = 5,708.69 · 30–34 = 7,181.70 · 0–17 = 3,990.72 · 18–24 = 5,173.57. Per-person rounds to
whole EGP first: 7,181.70→**7,182**, 5,708.69→**5,709**, 3,990.72→**3,991**.

- **Personal, employee age 32**: perPerson 7,182 → annual 7,182. Full-year → premium **7,182**.
- **Family, emp 32 + spouse 29 + child 10**: 7,182 + 5,709 + 3,991 = annual **16,882**. Full-year → premium **16,882**.
- **Mid-cycle joiner, annual 16,882, 4 whole months left**: premium = round(16,882 × 4/12) = round(5,627.33) = **5,627**.
- **Remove the child**: annual drops by exactly 3,991 → **12,891**.

## Admin rate-card contract (`admin/benefits/actions.ts`)

```
getMedicalRateBands(tier = 1): Band[]  (ordered)
updateMedicalRateBand(id, annualPremium: Decimal)  — HR/Admin only; two-decimal; ≥ 0.
```

No add/delete of bands in the Tier-1 scope (the 12 bands are fixed by the operator); editing amounts only.
Multi-tier management is out of scope until more tiers exist.

## Non-goals (unchanged behavior)

- Pool ceiling, 50%-per-benefit cap, flexible-claim path — unchanged apart from the medical premium source.
- Sub-6-month medical-only view + entry-tier ceiling fallback (spec 019) — unchanged; now sums age-band
  figures for the covered people instead of the self/spouse/child card.
