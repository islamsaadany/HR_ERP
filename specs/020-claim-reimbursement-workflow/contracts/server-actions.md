# Contract — Server Actions & Access Control

Feature: Claim Reimbursement Workflow & Email Notifications (spec 020)

All state changes are Next.js **server actions** (or route handlers) that enforce role + state guards server-side. The client mirrors state for UX only. Each action performs its DB write first, then dispatches any email fire-and-forget (§emails.md).

## Access helpers (`src/lib/roles.ts`)

| Helper | Allows |
|--------|--------|
| `isFinance(role)` | `FINANCE` or `SUPER_USER` |
| `requireFinance()` | redirect unless Finance/Super User |
| `isAdmin(role)` (existing) | `HR_ADMIN` or `SUPER_USER` (HR actions) |

## Actions

### 1. `submitClaim` (employee) — existing, adjusted
- **Actor**: the signed-in employee (owner).
- **Guard**: plan year OPEN; server money-rules pass (`evaluateClaim`) counting non-rejected claims.
- **Effect**: create `BenefitClaim` with `status = SUBMITTED`.
- **Email**: → HR inbox, "new claim to review" (T1).
- **Failure modes**: rules violation → reject with the existing error surface, no email.

### 2. `approveClaim(claimId)` (HR) — replaces the old single-step release
- **Actor**: `requireAdmin`.
- **Guard**: claim exists and `status == SUBMITTED`.
- **Effect**: `status = APPROVED`, set `reviewedById`, `decidedAt`.
- **Email**: → Finance inbox, "release payment" (T2).

### 3. `rejectClaim(claimId, reason?)` (HR)
- **Actor**: `requireAdmin`.
- **Guard**: `status == SUBMITTED`.
- **Effect**: `status = REJECTED`, `decisionNote = reason`, set `reviewedById`, `decidedAt`. Claim stops counting toward caps.
- **Email**: → employee, "claim declined" (+ reason if present) (T3).

### 4. `confirmPayment(claimId, amountTransferred, transferDate)` (Finance) — NEW
- **Actor**: `requireFinance`.
- **Guard**: `status == APPROVED`; `amountTransferred > 0`; `transferDate` not in the future.
- **Effect**: `status = REIMBURSED`, set `paidById`, `paidAt = now`, `transferDate`, `amountTransferred`.
- **Email**: → employee, "reimbursed" (T4).

### 5. `recordManualRelease(...)` (HR, spec 016) — adjusted
- **Actor**: `requireAdmin`.
- **Effect**: create `BenefitClaim` directly as `REIMBURSED` (back-fill of a past payment).
- **Email**: **none** (historical event).

### 6. `saveNotificationSettings(...)` (Super User) — NEW
- **Actor**: `requireSuperUser`.
- **Effect**: upsert the `NotificationSettings` singleton (`emailEnabled`, `hrInbox`, `financeInbox`, `fromName`).
- **Email**: none.

## Read surfaces

- **Finance payments queue** (`/finance` or equivalent): `requireFinance`; lists all `status == APPROVED` claims with payee, benefit, covered amount, approval date.
- **Employee claim views**: statuses shown via the four chips.
- **Admin submissions tab**: Approve/Reject controls on `SUBMITTED` claims only.

## Invariants (server-checked, testable)

- No claim reaches `REIMBURSED` without passing through `APPROVED`.
- A plain `HR_ADMIN` calling `confirmPayment` → denied. A plain `FINANCE` calling `approveClaim`/`rejectClaim` → denied.
- Every non-rejected claim counts toward its benefit cap and the pool ceiling; rejected claims do not.
- An email failure/omission never changes the outcome of any action above.
