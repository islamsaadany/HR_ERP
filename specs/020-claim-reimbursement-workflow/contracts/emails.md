# Contract — Email Subsystem

Feature: Claim Reimbursement Workflow & Email Notifications (spec 020)

## Environment (secrets — never in DB/UI/logs)

| Var | Purpose |
|-----|---------|
| `RESEND_API_KEY` | Resend API key. **Absent → subsystem inert** (no send attempted). |
| `EMAIL_FROM` | Verified sender address (e.g. `hr@forefront.consulting`). Display name from `NotificationSettings.fromName`. |

Set in Vercel by the user; the session never handles these. The handoff note at build time lists them explicitly.

## `sendEmail(input)` — `src/lib/email/client.ts`

Behavior contract (not signatures):
- If `RESEND_API_KEY` is unset **or** `NotificationSettings.emailEnabled` is false → **no-op**, log `email disabled`, return without error.
- If the target recipient address is empty (e.g. unset team inbox, missing employee email) → **skip that send**, log a soft warning, return without error.
- Otherwise send via Resend. **Fire-and-forget**: any thrown/HTTP error is caught and logged; never rethrown into the calling action.
- Never included in the caller's DB transaction; dispatched after the state change is persisted.

## Templates (`src/lib/email/templates.ts`)

Plain, transactional, English, light navy/gold styling. Placeholder-free copy; amounts formatted as EGP.

| ID | Trigger | To | Contains |
|----|---------|----|----------|
| **T1** | `submitClaim` → SUBMITTED | HR inbox | employee name, benefit, amount claimed, covered amount, link to the submissions tab |
| **T2** | `approveClaim` → APPROVED | Finance inbox | payee name, benefit, **covered amount to transfer**, link to the payments queue |
| **T3** | `rejectClaim` → REJECTED | employee | benefit, "your claim was declined", reason (if given), link to their benefits page |
| **T4** | `confirmPayment` → REIMBURSED | employee | benefit, amount reimbursed, transfer date, link to their benefits page |

## Guarantees (map to Success Criteria)

- **SC-001**: every triggering action completes its state change regardless of email outcome.
- **SC-002**: with email enabled + configured, exactly one correct email per event to the correct recipient.
- Idempotency: emails fire on the **transition**, so re-rendering a page or retrying a read never re-sends. (Actions are the only send points.)
