# Implementation Plan: Claim Reimbursement Workflow & Email Notifications

**Branch**: `020-claim-reimbursement-workflow` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/020-claim-reimbursement-workflow/spec.md`

## Summary

Replace the single-step HR release of a flexible benefit claim (`PENDING → RELEASED`) with a staged **Employee → HR → Finance → Employee** workflow (`SUBMITTED → APPROVED → REIMBURSED`, plus `REJECTED`), and send a transactional email at each hand-off via **Resend**. A new **FINANCE** role gets an "awaiting payment" queue; a Super-User settings screen manages the HR/Finance team inboxes and a master on/off toggle. The email subsystem is **env-gated and fire-and-forget** — with no API key, claims still work and no email is attempted; a send failure never blocks or rolls back a state change. Scope is **flexible benefit claims only** (guaranteed-benefit bulk release and medical commitments are unchanged). Server-authoritative money rules are preserved: caps count every **non-rejected** claim.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router) + React 19

**Primary Dependencies**: Prisma (PostgreSQL/Neon), NextAuth v5, Tailwind CSS, **`resend`** (new dependency — server-side email SDK)

**Storage**: PostgreSQL (Neon). New/changed: `Role` enum (+FINANCE), `ClaimStatus` enum (renamed/extended), `BenefitClaim` (new decision/payment columns), new `NotificationSettings` singleton. Delivered as a numbered `prisma/sql/0NN_*.sql` file (session cannot reach the DB directly).

**Testing**: `npx tsc --noEmit` + `npm run build` (project convention — no unit-test harness in repo). Server rule changes validated by tracing the code path; DB/seed changes validated against a throwaway local Postgres per CLAUDE.md §3a.

**Target Platform**: Vercel (serverless). Emails sent from server actions / route handlers only.

**Project Type**: Web application (single Next.js app; `src/` App Router + `src/lib/` server logic + Prisma).

**Performance Goals**: N/A (low volume — claims are human-paced). Email latency must not gate the user: sends are fire-and-forget (not awaited inside the state-change transaction).

**Constraints**: Secrets (`RESEND_API_KEY`, `EMAIL_FROM`) only in env, never DB/UI/logs. Email off cleanly when unconfigured. Fire-and-forget delivery. Money rules server-authoritative.

**Scale/Scope**: ~20–200 employees; a handful of claims per plan year. New role, one settings screen, one Finance queue, ~4 email templates, one claim state machine.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Align Before Building (NON-NEGOTIABLE)** — PASS. The four shaping decisions (new Finance role · single HR/Finance team inboxes · rejection emails on · Resend env-gated) were confirmed before the spec; the plan proceeds only after the spec is agreed. Each new UI surface still requires a mockup + sign-off during implement (Principle II).
- **II. UI Changes Require Explicit Approval** — PASS WITH ACTION. New/changed UI (Finance payments queue, admin submissions actions renamed HR *Approve* / Finance *Confirm payment*, employee status chips Submitted/Approved/Reimbursed/Rejected, notification settings screen) MUST be delivered mockup-first (navy/gold, saved under `design-mockups/`, signed off) before touching components, and each edited component snapshotted to `ui-versions/`.
- **III. Benefits Money & Rules Server-Authoritative (NON-NEGOTIABLE)** — PASS. The 50%-per-benefit cap and pool ceiling stay in `src/lib/benefits/`; the only change is that the aggregate of consumed allowance counts **SUBMITTED + APPROVED + REIMBURSED** (all non-rejected) instead of PENDING + RELEASED. Enforced at claim/commit time; client mirrors for UX only.
- **IV. Spec-Driven & Docs Move With Code** — PASS. This spec is the source; `CLAUDE.md`, `PROJECT_DETAILS.md`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PROGRESS.md` update in the same commit(s) as the code.
- **V. Engineered Enough, Explicit Over Clever** — PASS. One email helper (DRY across 4 templates), explicit state machine with guarded transitions, generous edge handling (no key, send failure, missing inbox, missing employee email).

**Amendment required (tracked below):** the constitution's Technology constraint **"No email in v1"** and CLAUDE.md's "No emails, ever (v1)" are **reversed for this workflow**, per explicit user approval. The amendment is made in the same change that ships the feature (Governance clause).

## Project Structure

### Documentation (this feature)

```text
specs/020-claim-reimbursement-workflow/
├── plan.md              # This file
├── spec.md              # Feature spec (already written)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — entities, enums, state machine
├── quickstart.md        # Phase 1 — how to validate end-to-end
├── contracts/           # Phase 1 — server-action & email contracts
│   ├── server-actions.md
│   └── emails.md
└── checklists/
    └── requirements.md  # from /speckit-specify
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                         # Role +FINANCE; ClaimStatus rename/extend; BenefitClaim +columns; NotificationSettings model
└── sql/0NN_claim_reimbursement_workflow.sql   # hand-runnable Neon migration (enum values + column adds + data backfill)

src/
├── lib/
│   ├── email/
│   │   ├── client.ts                     # env-gated Resend wrapper (no key → inert); sendEmail() fire-and-forget
│   │   └── templates.ts                  # 4 transactional templates (submitted→HR, approved→Finance, rejected→employee, reimbursed→employee)
│   ├── notifications/settings.ts         # read/write NotificationSettings (cached), like lib/brand.ts
│   ├── roles.ts                          # add isFinance() / requireFinance(); SUPER_USER superset
│   └── benefits/
│       ├── claims.ts                     # CLAIM_STATUS_LABEL/CLASS + claimTotals → new statuses; non-rejected counts toward caps
│       └── rules.ts                      # unchanged math; callers pass non-rejected sums
├── app/(app)/
│   ├── benefits/                         # employee claim views → new status chips
│   ├── admin/benefits/                   # submissions tab: HR Approve/Reject (renamed from release)
│   ├── admin/settings/ (or existing)     # NotificationSettings screen (Super User)
│   └── finance/                          # NEW: Finance "awaiting payment" queue + confirm-payment action
└── components/
    ├── benefits/ …                       # status chips, claim rows
    ├── admin/ …                          # approve/reject controls, settings form
    └── finance/PaymentsQueue.tsx         # NEW
```

**Structure Decision**: Single Next.js app (existing layout). New server-only concerns isolated under `src/lib/email/` and `src/lib/notifications/`; a new route group/section for the Finance queue; claim-status logic stays centralized in `src/lib/benefits/claims.ts` so the money engine (`rules.ts`) is untouched.

## Complexity Tracking

| Item | Why Needed | Simpler Alternative Rejected Because |
|------|-----------|--------------------------------------|
| Reverse "No email in v1" constitution constraint | The feature's core value is notifying the three parties by email | Keeping email off would not deliver the requested feature; user explicitly approved the reversal |
| New FINANCE role | Separation of duties — Finance confirms payment, not HR | Letting HR also confirm payment (option offered) was declined by the user in favor of a distinct role |
| New `resend` dependency | Chosen delivery provider (matches the user's other project) | No in-house SMTP; a hosted transactional-email API is the standard, low-maintenance choice |
