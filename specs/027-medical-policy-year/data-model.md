# Phase 1 Data Model: Medical Policy Year

## New entities

### `MedicalPolicyYear`

The insurance contract's own term. Independent of `PlanYear`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | e.g. "2026–27 policy" |
| `startDate` | date | Required — unlike `PlanYear`, a policy term without dates is meaningless |
| `endDate` | date | Required |
| `status` | enum | `OPEN` / `CLOSED`, mirroring `PlanYear` |
| `createdAt` | datetime | |

**Invariants**
- `endDate` > `startDate`.
- At most one `OPEN` policy year at a time (spec Assumptions: no overlapping terms).
- The term may be **any** length, including more than 12 months. Nothing may cap its month count.

---

### `MedicalCycleCharge`

The portion of one commitment's premium attributed to one benefits cycle. This is what draws against that cycle's pool.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `commitmentId` | FK → `MedicalCommitment` | Cascade delete with the commitment |
| `planYearId` | FK → `PlanYear` | The benefits cycle this charge lands in |
| `amount` | int | Whole EGP, already capped at that cycle's ceiling |
| `overlapMonths` | int | Whole months of the term inside this cycle — stored so a charge is explainable years later without recomputing |
| `appliedAt` | datetime? | Null while the charge is calculated but not yet drawing against a pool (a future cycle) |
| `outstanding` | boolean | True when the charge was due but withheld — currently only for a non-`ACTIVE` employee (research D7) |

**Invariants**
- Unique on `(commitmentId, planYearId)` — one charge per commitment per cycle.
- **The sum of a commitment's charges equals its `premium` exactly.** This is the feature's central invariant (FR-006) and the thing `quickstart.md` proves first.
- A charge is never recomputed once `appliedAt` is set against a closed cycle; re-splitting affects open cycles only.

---

## Changed entities

### `MedicalCommitment`

| Change | Detail |
|---|---|
| `policyYearId` | **New** FK → `MedicalPolicyYear`. The term this commitment buys. |
| Uniqueness | `(userId, planYearId)` → **`(userId, policyYearId)`** — commit once per policy term, not per benefits cycle (research D2) |
| `planYearId` | **Retained** as the cycle the commitment was *made in*, for history and for the migration. No longer the key. |
| `premium` | Unchanged in meaning: the **full** premium for the whole term. What changes is that it is no longer what a single pool absorbs. |

`coveredPeople` (`MedicalCoveredPerson`) is untouched — age is still snapshotted at commit, so a later date-of-birth correction cannot reprice a commitment.

---

## What reads a charge instead of a premium

The behavioural core of the change: every place that today treats `commitment.premium` as "what medical costs this employee's pool" must read **this cycle's charge** instead.

| Location | Today | After |
|---|---|---|
| `benefits/page.tsx` — pool used | `medicalCommitment?.premium ?? 0` | the charge for the **current** plan year |
| `claim-actions.ts` — `AllowanceContext.medicalPremium` | same | same charge |
| `rules.ts` — `poolUsed()` | unchanged code; it consumes whatever the caller passes | — |
| Admin commitment list | premium only | full premium **and** per-cycle charges |
| Employee medical card | premium | the amount charged to the cycle being viewed (FR-013) |

`rules.ts` needs no change: it already takes `medicalPremium` as an input rather than fetching it, so pointing the two callers at the cycle charge is the whole edit. That is a consequence of the existing server-authoritative split, and worth not disturbing.

---

## State transitions

**Commitment created** (employee commits)
1. Resolve the active policy year, falling back to the active plan year's window (research D6).
2. Price the premium as today (age bands, covered people, mid-term proration against the **policy term**, FR-008).
3. Split across every plan year the term overlaps (research D3).
4. Cap each charge at that cycle's ceiling (research D5).
5. Write the commitment and its charges. Charges for the current cycle get `appliedAt`; future cycles stay null.

**Cycle opens** (HR opens a new plan year)
1. Find charges for that plan year with `appliedAt` null.
2. For an `ACTIVE` employee, set `appliedAt` — the charge now draws against the new pool.
3. For a non-`ACTIVE` employee, mark `outstanding` and leave it unapplied (research D7).

**Commitment edited** (HR changes a premium)
1. Re-split the new premium across the term's cycles.
2. Update charges for **open** cycles; leave charges already applied to closed cycles untouched.
3. The exact-sum invariant must still hold across the whole set afterwards (FR-014).

**Policy window changed after commitments exist**
- Existing commitments are **not** re-split (FR-015). They are flagged as predating the change so HR can see which ones were split under the old term.
