# Phase 0 Research — Age-Banded Medical Rate Card (Tier 1)

All four product decisions are confirmed (spec §Resolved Decisions). This file records the
resulting engineering decisions, rationale, and alternatives.

## D1 — Rate-card storage: a band table, not wide columns

**Decision**: Introduce `MedicalRateBand` (one row per age band) with a `tier` column, replacing the
single-row `MedicalRateCard` (self/spouse/childUnder18/child18Plus). Fields: `tier` (Int, default 1),
`minAge` (Int), `maxAge` (Int, nullable = open-ended top), `annualPremium` (Decimal(10,2)), plus an
ordering. Unique on `(tier, minAge)`.

**Rationale**: Pricing is per-person by age; a band table is the natural shape and directly supports
"leave room for more tiers later" (FR-013) by adding rows with a new `tier` value — no column
reshaping. Decimal(10,2) holds the operator's cents faithfully (FR-011).

**Alternatives considered**:
- *12 wide columns on the existing single-row card* — rejected: rigid, no tier growth, awkward lookups.
- *JSON blob of bands* — rejected: not queryable/editable per row; weaker validation.

## D2 — Spouse becomes a `Dependant` with a kind

**Decision**: Add `DependantKind` enum `{ CHILD, SPOUSE }` (default `CHILD`) to `Dependant`; the covered
spouse is a `Dependant` row (`kind = SPOUSE`, name + DOB). At most one SPOUSE per employee (enforced in
the app; a partial unique index is optional). `Dependant.name` stays optional but is encouraged for a
spouse.

**Rationale**: Confirmed decision #4. One uniform "covered person = employee + dependant(s)" model makes
the per-person sum (FR-003) trivial and keeps spouse/child DOBs in one place. Reuses the existing
dependant registry rather than adding a parallel spouse field.

**Alternatives considered**:
- *Spouse DOB on the commitment/employee record* — offered as the lighter option but **not chosen** by
  the user; would keep two code paths (spouse-special vs child-list).

**Migration note**: existing children are `kind = CHILD` by default (safe). No spouse rows exist yet.

## D3 — Which dependants are covered + snapshot at commit

**Decision**: Record the covered people **on the commitment** as a snapshot. Add
`MedicalCoveredPerson` (child of `MedicalCommitment`): `{ id, commitmentId, dependantId? (null = the
employee), label, ageAtCommit (Int), annualPremium (Decimal(10,2)) }`. The employee is always one row
(`dependantId = null`); each covered dependant is one row. `MedicalCommitment.premium` stays the whole-EGP
committed figure (post-proration).

**Rationale**: Age is measured **at commit date** and the commitment is **locked** (FR-004, FR-009). A
snapshot makes the committed premium fully explainable (SC-006) and immune to later DOB/dependant edits.
The `MedicalCommitment.spouse`/`childrenUnder18`/`children18Plus` count columns become **legacy**:
retained (nullable) so historical rows keep their record, no longer written for new commits.

**Alternatives considered**:
- *Recompute from live dependants on read* — rejected: violates "locked at commit"; a later DOB edit or
  added child would silently change a committed, locked premium.
- *Store only the total* — rejected: fails SC-006 (no breakdown to reconcile).

## D4 — Age at commit date; band lookup; over-75

**Decision**: `ageAt(dob, refDate)` = completed years (birthday-aware). `refDate` = the **commit date**
(the `MedicalCommitment.committedAt`, i.e. "now" at commit). `bandFor(age)` returns the band with
`minAge ≤ age ≤ maxAge` (top band has `maxAge = 75`); an age **> 75** maps to the **top band** and sets an
HR-review flag surfaced to the admin (FR-012). Age exactly on a lower bound falls in that band
(FR-004 assumption).

**Rationale**: Confirmed decisions #1 and #2. Commit-date age is simple and deterministic ("age when you
elect, then locked"). Top-band fallback keeps coverage working without a zero/blocked premium.

**Alternatives considered**: plan-year-start or eligibility-date reference — not chosen by the user.

## D5 — Summation, proration, rounding

**Decision**: `sumMedicalPremium(coveredPeople, bands, refDate)` sums each person's `annualPremium`
(Decimal) at full precision. The existing spec-019 medical fraction (`classifyEligibility(startDate, 3,
window).fraction`) prorates the **summed annual**; the **final committed premium is rounded to whole EGP**
(`Math.round`) and then capped at the pool ceiling (unchanged). Rate-card amounts keep two decimals; only
the committed premium is integer.

**Rationale**: Confirmed decision #3 (whole EGP), and it keeps `MedicalCommitment.premium` an `Int` as
today, so the pool math (integer ceiling) is unaffected. Doing the round **once at the end** avoids
per-person rounding drift.

**Decimal handling**: Prisma returns `Decimal` for `annualPremium`; sum using `Decimal`/number carefully
and round only at the final step. `contracts/medical-pricing.md` pins the exact order of operations and
the worked examples from the spec (16,881.11 sum; 1,795 after 3/12 → **1,795** whole EGP).

## D6 — DOB gating

**Decision**: `commitMedical` blocks (server-side) when the employee has no `dateOfBirth`, or when any
**selected** covered dependant has no DOB (dependant DOB is already required by schema, so this mainly
guards the employee and any spouse row being created). Clear, actionable errors (FR-005, FR-007). The
employee-facing modal mirrors the block and points to where the DOB is set (HR for the employee record).

**Rationale**: Pricing is impossible without a DOB; guessing is explicitly disallowed.

## D7 — Cutover & code removal

**Decision**: Remove `computeMedicalPremium`, `MedicalRate`, `MedicalConfig` (self/spouse/child) and the
`getMedicalRate()` single-row read; replace with `getMedicalRateBands()` and the `rates.ts` helpers. The
board's `medicalRate={{self,spouse,childUnder18,child18Plus}}` prop is replaced by the bands + the
employee's covered-people context. `MedicalRateCard` table is dropped after the bands table is seeded
(the migration seeds Tier-1 first, then drops the old card). Test-data commitments may be re-entered by HR
(consistent with prior benefits cutovers); real historical rows (if any) keep their `premium` and legacy
count columns.

**Rationale**: One pricing model in the codebase; no dead relationship-based path. Matches how spec 018/025
cut over cleanly.

## Open risks / to verify in implementation

- **Neon data readiness**: employees/spouses need DOBs before they can commit. The feature *blocks* (not
  guesses); HR fills DOBs. Flagged in the spec Dependencies.
- **Decimal arithmetic**: verify no float drift on the worked examples via `tsx` before wiring UI.
- **UI mockup**: the modal + admin editor must be mocked and approved (Constitution II) before edits.
