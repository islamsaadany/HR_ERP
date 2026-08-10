# Phase 1 — Data Model

Feature: Claim Reimbursement Workflow & Email Notifications (spec 020)

Only the deltas to the existing schema are listed. Existing fields not mentioned are unchanged.

## Enums

### `Role` (extended)
```
EMPLOYEE | HR_ADMIN | SUPER_USER | FINANCE   ← add FINANCE
```
- `SUPER_USER` remains the governance superset (can act as HR and Finance).
- `FINANCE`: may view the payments queue and confirm payments; may **not** approve/reject claims.

### `ClaimStatus` (renamed/extended)
```
Before:  PENDING | RELEASED | REJECTED
After:   SUBMITTED | APPROVED | REIMBURSED | REJECTED
```
Data migration: `PENDING → SUBMITTED`, `RELEASED → REIMBURSED`, `REJECTED → REJECTED`. `APPROVED` is new.

## State machine (BenefitClaim.status)

```
            (employee submits)
                 │
                 ▼
            SUBMITTED ───(HR reject, optional reason)──▶ REJECTED  [terminal]
                 │
        (HR approve)
                 ▼
            APPROVED ───(Finance confirm payment: amount + date)──▶ REIMBURSED  [terminal]

  HR back-fill (spec 016 manual release): create directly as REIMBURSED (no submit/approve emails)
```

Transition guards (server-enforced):
- `SUBMITTED → APPROVED` and `SUBMITTED → REJECTED`: actor must be HR_ADMIN or SUPER_USER.
- `APPROVED → REIMBURSED`: actor must be FINANCE or SUPER_USER.
- No transition is offered/accepted from a terminal state or out of order (e.g. cannot reimburse a SUBMITTED claim).

## Model changes

### `BenefitClaim` (add columns)
| Field | Type | Notes |
|-------|------|-------|
| `status` | `ClaimStatus` | default `SUBMITTED` (was `PENDING`) |
| `decisionNote` | `String?` | **existing** — reused as the HR rejection reason |
| `reviewedById` / `reviewedBy` | `String?` / User | **existing** — the HR approver/rejecter |
| `decidedAt` | `DateTime?` | **existing** — HR decision timestamp |
| `paidById` | `String?` (rel to User) | NEW — the Finance user who confirmed payment |
| `paidAt` | `DateTime?` | NEW — when Finance confirmed |
| `transferDate` | `DateTime?` | NEW — the actual date money was transferred (Finance-entered) |
| `amountTransferred` | `Int?` | NEW — actual amount transferred (Finance-entered; expected == covered amount) |

- Reuse `reviewedById`/`decidedAt`/`decisionNote` for the HR step; add the four payment fields for the Finance step so each stage has its own actor + timestamp (audit trail, SC — auditability).
- New relation name for `paidBy` (e.g. `"ClaimPayer"`) alongside the existing `"ClaimReviewer"`.

### `NotificationSettings` (new singleton)
| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `id` | `String` | `"singleton"` | one row, like `BrandSettings` |
| `emailEnabled` | `Boolean` | `false` | master toggle; off = no workflow emails |
| `hrInbox` | `String?` | `null` | team address for "new claim to review" |
| `financeInbox` | `String?` | `null` | team address for "release payment" |
| `fromName` | `String?` | `null` | display name on outgoing mail (address itself is `EMAIL_FROM` env) |
| `updatedAt` | `DateTime` | now | |

Secrets **not** stored here: `RESEND_API_KEY`, `EMAIL_FROM` live only in env.

## Validation rules

- **Rejection**: reason (`decisionNote`) optional; if absent, the employee email omits the reason line.
- **Confirm payment**: `amountTransferred` required, > 0; `transferDate` required, not in the future. The claim must be `APPROVED`.
- **Money caps** (`src/lib/benefits/`): the consumed-allowance aggregate per benefit and the pool ceiling count **SUBMITTED + APPROVED + REIMBURSED**; `REJECTED` is excluded. Enforced server-side at submit (and re-checked at any state that could change totals).
- **Scope**: only `BenefitClaim` rows (flexible/guaranteed catalog claims) participate; `MedicalCommitment` is untouched.

## Derived / display

- `CLAIM_STATUS_LABEL` / `CLAIM_STATUS_CLASS` (`src/lib/benefits/claims.ts`) updated to the four statuses with navy/gold chip colors: Submitted (gold), Approved (navy-outline), Reimbursed (navy solid), Rejected (red). Exact chips confirmed in the mockup step.
- `claimTotals` reports pending-equivalent (Submitted + Approved, "in progress") vs. Reimbursed (paid) for the employee summary.

## Key entities (recap from spec)

- **Benefit Claim** — the staged reimbursement request (fields above).
- **Role/Capability** — EMPLOYEE / HR_ADMIN / SUPER_USER / **FINANCE**.
- **Notification Settings** — Super-User-managed, non-secret config.
- **Notification Event** — a transactional email tied to a transition (not persisted; dispatched at transition time).
