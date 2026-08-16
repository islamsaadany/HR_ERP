# Phase 0 Research: Medical Policy Year

Seven decisions the design rests on. Each records what was chosen, why, and what was rejected.

---

## D1 — Where the policy window lives

**Decision**: A new `MedicalPolicyYear` record with its own `name`, `startDate`, `endDate`, and `status`.

**Rationale**: The policy term must be able to start and end independently of any benefits cycle, and a single term must be able to span two of them. That is a thing with its own lifecycle, so it gets its own record.

**Alternatives considered**:
- *`medicalStartDate` / `medicalEndDate` columns on `PlanYear`* — rejected. It ties the policy to a cycle it is defined as independent of, and gives no home for a commitment that outlives the cycle it was made in. It also reintroduces the exact coupling this feature exists to break.
- *App settings key/value* — rejected. No succession of terms, no history, and the platform-settings surface is not where money-bearing dates belong.

---

## D2 — What a commitment belongs to

**Decision**: `MedicalCommitment` is keyed to the **policy year**, not the plan year. Its uniqueness becomes `(userId, policyYearId)`.

**Rationale**: This is the change that makes the feature coherent rather than bolted on. "Commit once per plan year" is precisely what makes a mid-cycle policy renewal invisible to the system — there is no event at renewal, and no record of what an employee is committed to when the benefits cycle turns over beneath them. Keying the commitment to the term it actually buys fixes both.

**Migration**: existing commitments have a `planYearId`. On migration, a `MedicalPolicyYear` is created from the current open plan year's dates and every existing commitment is attached to it, with a single cycle charge equal to its current premium against its original plan year. Nothing is recomputed, so no employee's committed figure moves.

**Alternatives considered**:
- *Keep the plan-year key and add a policy-year reference* — rejected. Two competing notions of "which period is this commitment for" is exactly the ambiguity that produced the bug.

---

## D3 — How a premium is split across cycles

**Decision**: A pure function over whole-month overlap:

```
policyMonths          = whole months in [policy.start, policy.end]
overlap(cycle)        = whole months in the intersection of the policy term and that cycle
charge(cycle)         = floor(premium × overlap(cycle) ÷ policyMonths)
final cycle's charge  = premium − (sum of every other cycle's charge)
```

**Rationale**: Whole-month attribution matches the convention the codebase already uses for mid-year starters (`remainingWholeMonths`), so the two systems agree rather than disagreeing by a day. Floor-plus-remainder makes the exact-sum invariant (FR-006) true by construction instead of by luck — the reconciling remainder lands in the final cycle rather than being distributed and rounded away.

**Worked example** — the live figures: policy 1 Jun 2026 → 30 Jun 2027 (13 months), premium 26,000; cycle A 1 Jun–31 Dec 2026 (7 months of overlap), cycle B 1 Jan–31 Dec 2027 (6 months of overlap):

| | Overlap | Charge |
|---|---|---|
| Cycle A | 7 / 13 | floor(26,000 × 7 ÷ 13) = 14,000 |
| Cycle B | 6 / 13 | 26,000 − 14,000 = 12,000 |
| **Sum** | 13 / 13 | **26,000** ✓ |

**Alternatives considered**:
- *Day-based proration* — rejected. More precise, but it disagrees with every other proration in the product and buys nothing: insurance is billed monthly.
- *Round-half-up per cycle* — rejected. Independent rounding lets the charges miss the premium by a unit or two, breaking FR-006.

---

## D4 — Month counting beyond twelve

**Decision**: Add an **uncapped** `wholeMonthsBetween(from, to)` for policy terms. Leave `remainingWholeMonths` capped at 12, and clamp `poolCycleFraction` to a maximum of 1 **explicitly**.

**Rationale**: This is the trap in the existing code. `remainingWholeMonths` stops counting at 12 because of its loop bound (`while (count < 12)`), and `cycleWholeMonths` → `poolCycleFraction` silently depends on that cap to avoid ever returning a fraction above 1. Uncapping the shared helper — the obvious fix for the 13-month problem — would make a 13-month benefits cycle yield `13/12`, handing every employee **108% of their pool ceiling**. A money bug introduced while fixing an arithmetic one.

So the cap is kept where the pool relies on it, made explicit rather than incidental (a reader should not have to infer a business rule from a loop bound), and policy terms get their own uncapped helper.

**Alternatives considered**:
- *Uncap `remainingWholeMonths` and fix callers* — rejected as the riskier shape: it makes every current caller unsafe by default and correct only if each remembers to clamp.
- *Cap policy terms at 12 months* — rejected. It is the actual bug: the 13th month of a real policy would stay unaccounted for.

---

## D5 — What the pool ceiling caps

**Decision**: The pool ceiling caps the **per-cycle charge**, against that cycle's (already cycle-scaled) ceiling.

**Rationale**: The ceiling is itself scaled to cycle length, so comparing a full-term premium against one cycle's ceiling compares quantities measured over different periods — and would recreate the exact failure this feature exists to remove (a full-year premium exhausting a half-year pool). Capping like against like is the only reading consistent with the rest of the money model.

**Status**: Carried as an open item on the plan. It is the assumption with the largest effect on what an employee actually owes, so it deserves one explicit confirmation before the commit path is written, even though the reasoning is one-sided.

---

## D6 — Behaviour when no policy year is configured

**Decision**: Fall back to the active plan year's window and produce a single charge against that plan year — byte-identical to today's behaviour.

**Rationale**: FR-002 and SC-005 require the change to be invisible until HR opts in. It also means the migration cannot break an installation that has not configured a policy term yet, and it makes the fallback the *same code path* rather than a parallel one: a policy term equal to the plan year overlaps it entirely, so the split produces exactly one charge for the whole premium. No special-casing, no second branch to keep correct.

---

## D7 — Carried charges for a departed employee

**Decision**: When a cycle opens, a carried charge for an employee whose status is not `ACTIVE` is **not applied**; it is recorded as outstanding and surfaced to HR.

**Rationale**: The company is still liable to the insurer for the term, so the amount cannot be dropped — but applying it to the pool of someone who has left is meaningless, and would quietly distort the totals HR reconciles against. Making it visible and unapplied keeps the money honest in both directions.

**Open**: where HR sees it. That is a UI decision and falls under the mockup gate, so it is carried into implementation rather than settled here.
