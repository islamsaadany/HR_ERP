# Phase 0 — Research & Decisions

Feature: Claim Reimbursement Workflow & Email Notifications (spec 020)

All "NEEDS CLARIFICATION" were resolved with the product owner before drafting the spec; this file records the decisions and their rationale so implementation has no open unknowns.

## D1 — Claim status vocabulary & migration

- **Decision**: Extend the existing `ClaimStatus` enum to `SUBMITTED`, `APPROVED`, `REIMBURSED`, `REJECTED`. Migrate existing rows: `PENDING → SUBMITTED`, `RELEASED → REIMBURSED`, `REJECTED → REJECTED`. `APPROVED` is new (no historical rows).
- **Rationale**: The names read clearly across the three-party flow and match the UI verbs (HR *Approve*, Finance *Confirm payment / Reimbursed*). Reusing the same enum column keeps one status field and one index.
- **Migration approach**: PostgreSQL enums can gain values with `ALTER TYPE ... ADD VALUE`, but cannot rename/drop values transactionally in a way Prisma tracks cleanly. Plan: add the three new values, `UPDATE` rows to the new values, and leave the legacy `PENDING`/`RELEASED` values present-but-unused (Prisma enum will list only the four canonical names; the dead values are harmless) **or** perform a create-new-enum-and-swap in the hand-run SQL. Final SQL chosen at task time; both are pure-SQL and Neon-pasteable. The old back-fill/manual-release path (spec 016) writes `REIMBURSED` directly.
- **Alternatives considered**: A separate `stage` column alongside the old status — rejected (two sources of truth for the same concept).

## D2 — Where the money-cap status filter lives

- **Decision**: Keep `evaluateClaim` (in `rules.ts`) untouched — it already consumes a caller-built `claimedByBenefit` map. Update the **callers** and `claimTotals` (in `claims.ts`) so the consumed-allowance aggregate includes **all non-rejected** claims (`SUBMITTED + APPROVED + REIMBURSED`).
- **Rationale**: Preserves Principle III (server-authoritative math in one place) with the smallest change; the status set that "consumes allowance" is a query/aggregation concern, not a math concern.
- **Alternatives considered**: Passing status into `evaluateClaim` — rejected (leaks workflow state into the pure rule engine).

## D3 — Finance as a role vs. a capability

- **Decision**: Add `FINANCE` to the `Role` enum. `SUPER_USER` remains a superset (can act on the Finance queue). Gate the payments queue + confirm-payment action with `isFinance()/requireFinance()` (Finance or Super User).
- **Rationale**: The user chose a distinct role for separation of duties. Mirrors the existing `isSuperUser`/`requireAdmin` helper pattern in `lib/roles.ts`.
- **Note**: A person may be granted Finance in addition to another role; the *money-confirmation* step is what's gated, not the person. HR-only users cannot confirm payment; Finance-only users cannot approve claims (FR-009).

## D4 — Email provider & env-gating

- **Decision**: Use the **Resend** SDK server-side. Credentials in env only: `RESEND_API_KEY`, `EMAIL_FROM` (verified sender). A thin `src/lib/email/client.ts` returns inert when `RESEND_API_KEY` is unset (mirrors the parked Google-provider pattern) — `sendEmail()` becomes a no-op that logs "email disabled".
- **Rationale**: No secrets in DB/UI; dev/local works with zero config; production turns on by setting env vars in Vercel. The session cannot set Vercel secrets — the user does that; the handoff note lists the exact vars.
- **Alternatives considered**: Nodemailer/SMTP (more infra, credentials management); storing the key in `NotificationSettings` (violates "secrets never in DB").

## D5 — Fire-and-forget delivery

- **Decision**: State changes commit first; emails are dispatched **after** the DB write, not awaited inside its transaction. Any send error is caught and logged; it never rolls back or surfaces to the user. (In serverless, the send is awaited at the end of the request handler so the function doesn't terminate early, but its failure is swallowed.)
- **Rationale**: FR-015 / SC-001 — the workflow must keep working even if Resend is down. Data integrity of the claim state is independent of notification success.

## D6 — Settings storage

- **Decision**: New singleton `NotificationSettings` model (`id = "singleton"`, like `BrandSettings`): `emailEnabled: Boolean`, `hrInbox: String?`, `financeInbox: String?`, `fromName: String?`. Read via a cached accessor `src/lib/notifications/settings.ts` (like `lib/brand.ts`). Managed on a Super-User settings screen.
- **Rationale**: Matches the established singleton-settings pattern; keeps non-secret config in the DB and secrets in env.
- **Alternatives considered**: Reusing `ModuleFlag` key/value — rejected (that's boolean module toggles, not typed multi-field config).

## D7 — Recipients & content

- **Decision**: Single configurable **HR inbox** and **Finance inbox** (team addresses), plus the employee's own address for the two employee-facing mails. Four templates: (1) submitted → HR (employee, benefit, amount claimed, covered amount); (2) approved → Finance (payee, covered amount to transfer); (3) rejected → employee (reason if given); (4) reimbursed → employee. Plain, transactional, English, navy/gold-lite.
- **Rationale**: Matches the user's "HR team email / finance team email" and the loop-closing rejection + reimbursement mails.
- **Edge**: If a required inbox is blank while notifications are on → skip that one email and surface a soft admin warning; state change still proceeds (FR-020). If the employee has no/invalid email → skip + log.

## D8 — Scope guard

- **Decision**: Only **flexible benefit claims** (`BenefitClaim` against catalog/guaranteed items) run the new workflow + emails. **Medical commitments** and the **guaranteed-benefit bulk "Release" sheet** (`ReleaseManager`) keep today's behavior and send no emails.
- **Rationale**: Explicit product scope; avoids entangling the one-time medical commitment and the batch release tool.

## Open items for the tasks phase (not blockers)

- Final form of the enum migration SQL (add-values-and-update vs. swap-enum) — pick the cleaner Neon-pasteable option and verify on a throwaway local Postgres.
- Exact placement of the Finance queue in nav (new `/finance` section vs. under admin) and the notification-settings screen (new admin settings page vs. existing) — resolved via the mockup step.
