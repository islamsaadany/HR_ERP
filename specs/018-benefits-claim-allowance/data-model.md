# Phase 1 Data Model: Benefits Claim-Based Living Allowance

Scope: benefits module only. Unchanged entities are listed for context; **changes are marked**.

## Removed entities

- **`BenefitSelection`** — REMOVED. The one-shot basket no longer exists.
- **`SelectionLine`** — REMOVED. No per-benefit allocation is stored anymore.
- **`SelectionStatus` enum** — REMOVED if no other reference remains after the above.

## New entity: `MedicalCommitment`

One row per employee per plan year, representing the single committed medical election.

| Field | Type | Notes |
|-------|------|-------|
| `id` | String (cuid) | PK |
| `userId` | String | FK → `User.id`, `onDelete: Cascade` |
| `planYearId` | String | FK → `PlanYear.id`, `onDelete: Cascade` |
| `spouse` | Boolean (default false) | dependant flag |
| `childrenUnder18` | Int (default 0) | ≥ 0 |
| `children18Plus` | Int (default 0) | ≥ 0 |
| `premium` | Int | computed covered premium (rate card); = pool draw; capped at ceiling |
| `committedAt` | DateTime (default now) | when committed |
| `committedById` | String? | FK → `User.id` `onDelete: SetNull`; set when HR commits/edits on the employee's behalf, null for self-commit |
| `createdAt` / `updatedAt` | DateTime | standard |

Constraints:
- `@@unique([userId, planYearId])` — one commitment per employee per year.
- Existence of the row = "medical committed." Employee cannot edit/delete after creation; only HR (admin action) may edit or delete it.

Relations added:
- `User.medicalCommitments MedicalCommitment[]` (replaces `benefitSelections`).
- `PlanYear.medicalCommitments MedicalCommitment[]` (replaces `selections`).

## Changed entity: `BenefitCatalogItem`

| Field | Change |
|-------|--------|
| `lines SelectionLine[]` | **REMOVED** (SelectionLine gone). |
| `claims BenefitClaim[]` | unchanged. |
| `coverageRate Int` | unchanged; **admin validation** now enforces 1–100 (reject 0). |
| `isMedical Boolean` | unchanged; medical item still exists but is claimed-through-commitment, never via `BenefitClaim`. |

## Unchanged entities (context)

- **`PlanYear`** — open/closed window gates claims + medical commits. (`selections` relation replaced by `medicalCommitments`.)
- **`PoolCeiling`** — `amount` by employmentType × tenureBand = the pool. Basis for the 50% cap and the total ceiling.
- **`GuaranteedBenefit`** — unchanged; automatic/separate.
- **`MedicalRateCard`** — unchanged; drives premium.
- **`BenefitClaim`** — unchanged shape. Links to `catalogItemId` OR `guaranteedBenefitId` directly. `amount` = the **covered** amount recorded at claim time. `status`: PENDING / RELEASED (reimbursed) / REJECTED. Now claimable without a prior submitted basket.
- **`BenefitRelease`** — unchanged (bulk release / manual entry, spec 013/016).

## Derived / computed values (not stored)

- **Per-benefit allocation** = `floor(ceiling × 0.5)` (the 50% cap). No stored allocation.
- **Per-benefit remaining** = `50%cap − Σ covered(pending+released) for that benefit`.
- **Pool used** = `medicalCommitment.premium (if any) + Σ covered(pending+released) across flexible claims`.
- **Pool remaining** = `ceiling − pool used`.

## Validation rules (server-authoritative)

1. Plan year must be OPEN to commit medical or file a claim (FR-001, edge: closed window).
2. Coverage % on a catalog item ∈ [1,100] (FR-018).
3. Claim covered amount ≤ per-benefit remaining (50% cap), FT **and** PT (FR-005, FR-007).
4. Pool used + new claim covered ≤ ceiling, else reject "contact HR" (FR-006).
5. Medical premium capped at ceiling; if premium > ceiling → "contact HR" message (FR-013); exempt from 50% cap.
6. Medical is not claimable via `BenefitClaim` (FR-012); automatic benefits (claimType NONE / medical) not employee-removable (FR-014); HR override edits/deletes `MedicalCommitment` (FR-015).
7. Count limit disabled by default; when the `COUNT_LIMIT_ENABLED` flag is on, enforce max-N distinct claimed benefits server-side (FR-016/FR-017).

## State transitions

- **MedicalCommitment**: (none) → committed (employee, window open) → [HR edit/remove]. No employee edit after commit.
- **BenefitClaim**: PENDING → RELEASED (HR reimburses) | REJECTED (HR rejects; frees reserved pool room, FR-008).
