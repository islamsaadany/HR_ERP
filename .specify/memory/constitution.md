<!--
SYNC IMPACT REPORT — 2026-08-24 (merge of two same-day amendments)
Version change: 1.2.1 → 1.3.0 → 1.4.0 (MINOR ×2, merged here — the email limit widens twice
in one day, from two workflows to four: Team Communications (spec 039) and the payback
workflow (spec 040). The load-bearing half of the rule is unchanged: no scheduled process may
email an employee at large. Three daily crons are now recorded, and one documented exception to
the appointment pattern (spec 041). Previously 1.2.0 → 1.2.1 (PATCH — accuracy corrections and
one clarification of existing practice; no principle added, removed, or redefined).

NOTE ON NUMBERING: Team Communications and Petty cash & payback were specified in parallel and
both claimed 039. Communications reached `main` first and keeps it; the finance pair was
renumbered on merge to 040 (petty cash & payback) and 041 (bank confirmations & salary runs),
and its migrations to 068/069/070.

Modified sections:
  - Technology & Data Constraints, email — FOUR permitted workflows now: benefit claims (spec 020),
    holidays (spec 037), Team Communications (spec 039) and payback (spec 040). Communications is
    the first BROADCAST workflow and reports per recipient, unlike the transactional three.
    Separately, the two "your money has arrived" messages in the whole application now fire on the
    confirmer's completion, never on Finance recording a transfer — the CEO's correction: before
    that moment the money has not moved, so the email was untrue.
  - Technology & Data Constraints, scheduled work — THREE daily cron jobs now: holidays (spec 037),
    communications drafts (spec 039) and confirmation nudges (spec 041). The audience a scheduled
    job may nudge widens from "HR" to "HR, or an appointed confirmer"; the hard rule — never
    employees at large — is untouched.
  - Technology & Data Constraints, roles — `FINANCE` is recorded (it has existed since spec 020 and
    was missing from this line). Records spec 041's deliberate exception: role-holders do NOT
    implicitly hold the transaction-confirmer capability. Documented rather than applied silently,
    because it reverses the reasoning used for Learning managers. Lock-out is prevented by
    self-appointment instead.

Added sections: none
Removed sections: none

Preserved verbatim (deliberately): every principle; the three permitted email workflows; the
migration clause; sessions never hold the production DATABASE_URL; PII stays out of git.

Templates checked:
  ✅ .specify/templates/{plan,spec,tasks}-template.md — no constitution or stack references.
  ✅ .claude/skills/speckit-*/SKILL.md — no outdated references.

Follow-up TODOs: none. CLAUDE.md carries the same changes in the same commit.
-->

# HR_ERP Constitution

Governing principles for HR_ERP — the internal HR platform for Forefront Consulting.
This document is the authority the spec-kit workflow (`/speckit-specify` → `plan` → `tasks`
→ `implement`) must respect. It restates the house rules from `CLAUDE.md` in enforceable form.

## Core Principles

### I. Align Before Building (NON-NEGOTIABLE)
No feature, fix, or significant change is implemented without explicit user confirmation.
Before any change, explain the intent in plain, non-technical words and wait for approval.
When multiple approaches exist, present them as options with a clear recommendation. Never
redesign, restructure, or "improve" anything that was not explicitly requested. When
uncertain, ask — do not assume. "Let's align first" means stop and discuss.

### II. UI Changes Require Explicit Approval
No visual element — colors, layout, spacing, typography, labels, icons, section order —
changes without explicit approval. The **product design language is navy/gold** (from the
Forefront reference tool). The benefits selector's **layout & interaction model** (guaranteed
panel, basket list, live meter, medical modal) is a preserved asset: port its structure
faithfully, recolored into the navy/gold palette — do not redesign the structure.
Before editing any UI file, snapshot it to `ui-versions/<component>/<date>_<desc>.tsx`.

### III. Benefits Money & Rules Are Server-Authoritative (NON-NEGOTIABLE)
Every benefits rule — pool ceiling by employment type × tenure, the 50%-per-benefit cap
(cumulative claims, full-time and part-time), the benefit-count limit (configurable, **off by
default** — spec 018), medical-insurance handling, and the plan-year window — is validated on the
server at claim/commit time. The client mirrors rules for UX only and is never trusted.
Placeholder figures are never presented as final.

### IV. Spec-Driven & Docs Move With Code
Every feature begins as a spec (`specs/`), not code. The four steering files
(`CLAUDE.md`, `PROJECT_DETAILS.md`, `IMPLEMENTATION_PLAN.md`, `IMPLEMENTATION_PROGRESS.md`)
and the relevant spec are updated in the same commit as the code they describe. A drift
between spec and code is a documentation bug — report it before silently realigning.

### V. Engineered Enough, Explicit Over Clever
Handle edge cases generously (nulls, empty states, unexpected input, boundaries). Flag
repetition aggressively — extract at 3+ uses, flag at 2. Prefer readable, obvious code over
clever compression. Aim for "engineered enough": neither fragile nor over-abstracted. Verify
`npx tsc --noEmit` and `npm run build` pass before handing work over.

There is **no testing regime and none is wanted**: nothing runs on a schedule, nothing gates a
deploy, and no session is obliged to run anything. What protects the money rules is **structural** —
one derivation of the pool ceiling (`src/lib/benefits/pool.ts`), a guard on every write path, and a
per-employee row lock — because those hold without anyone remembering to run them. `npm test` exists
as a tool for one moment: you are changing benefits code and want to know whether the ceiling still
holds. Reach for it then; it is never an obligation.

## Technology & Data Constraints
- Stack: Next.js 15 (App Router) + React 19 + TypeScript; PostgreSQL (Neon) + Prisma;
  Tailwind CSS; Vercel Blob for files; Vercel deploy.
- Sign-in is **NextAuth v5 Credentials — email + password** (scrypt-hashed). The company-domain
  restriction on password login was **lifted on 2026-08-07**: any registered employee may sign in,
  and HR is warned when creating a non-company-domain email. **Google is disabled** (button removed;
  the provider stays env-gated so it can return). Admin-issued passwords are temporary — the
  employee is forced to `/set-password` on next sign-in (`mustChangePassword`). No emails in v1 for
  recovery: a forgotten password is reset by HR, with no self-service path.
- Email: limited to **four** workflows — the benefit-claim workflow (spec 020), the
  holiday/vacation workflow (spec 037: HR verification reminders, team announcements, and the
  "your day was returned" notice), **Team Communications** (spec 039: announcements to a chosen
  audience, and personal congratulations for birthdays and joining anniversaries), and the
  **payback workflow** (spec 040: request submitted → Finance, declined and paid → the requester)
  — via Resend, env-gated (`RESEND_API_KEY`/`EMAIL_FROM`), master-toggleable.
  (Amends "no email in v1", approved 2026-08-10; widened to the holiday workflow, approved
  2026-08-19; widened to Communications and to the payback workflow, both approved 2026-08-24.)
  Still **no** marketing email, no external recipients, no invitations, and no scheduling a send
  for later. Petty cash itself sends none: the custodian and Finance are both looking at a live
  screen, and nobody is waiting on a ledger.
  - The transactional workflows (benefit claims, holidays, payback) are fire-and-forget: one
    person, because of something they did, and a mail failure must never block a state change.
    Communications is **broadcast** and is deliberately the opposite — a send REPORTS, per
    recipient, because somebody pressed send and has to know whether it went. A broadcast cannot
    be recalled.
  - Within the finance workflows, the two messages that tell somebody money has reached them — a
    reimbursed benefit claim and a paid payback — fire **only** when the appointed confirmer marks
    the bank transaction complete, never when Finance records a transfer (the CEO's correction,
    2026-08-24: before that moment the money has not moved).
  - **NON-NEGOTIABLE, and untouched by the widening: no scheduled process may email an EMPLOYEE.**
    Scheduled work prepares drafts and nudges operators. Every message that reaches an employee is
    the result of a person reading it and choosing to send.
- Scheduled work: **three** daily Vercel Cron jobs, all authenticated with `CRON_SECRET` —
  `/api/cron/holidays` (spec 037), `/api/cron/communications` (spec 039) and
  `/api/cron/confirmations` (spec 041, added 2026-08-24), which nudges the appointed transaction
  confirmers about anything still waiting. A scheduled job may nudge **HR, or an appointed
  confirmer**; it may never send anything to employees at large — company-wide messages are
  reviewed and sent by a human. The confirmation nudge logs each send, so a job that runs twice
  cannot email twice.
- Roles: `EMPLOYEE`, `HR_ADMIN`, `FINANCE`, `SUPER_USER` (superset of both). A `manager`
  capability derives from the org chart (an employee with direct reports). `FINANCE` has existed
  since spec 020 and was missing from this line until 2026-08-24 — a spec/code drift found while
  writing the finance specs, corrected here rather than silently. Per-module authority beyond
  these is an **appointment**, never a new `Role` member (Learning managers, spec 038; transaction
  confirmers, spec 041). Role-holders normally hold an appointment's capability implicitly, so
  emptying the table cannot lock anyone out — **spec 041 is the one documented exception**: only
  appointed confirmers may confirm a bank transaction, because the instruction was that
  transactions wait for that person and nobody stands in. Lock-out is prevented there by allowing
  self-appointment.
- **Migrations are Claude's job, not the user's** (settled 2026-08-20). Whenever
  `prisma/schema.prisma` or `prisma/seed.ts` changes, the matching numbered **idempotent**
  `prisma/sql/0NN_*.sql` MUST be written and committed in the **same commit** — it may be retried,
  so it must survive a re-run. The Vercel build applies it: `scripts/apply-sql.mjs` runs every
  not-yet-applied file in order and records it in `_sql_migrations`, so each runs once and a
  redeploy is a no-op. The runner is **deliberately non-fatal** — a failed file still lets the
  deploy succeed — so the build log's `[apply-sql]` lines MUST be checked and the result reported
  to the user in one line. A paste-it-yourself file is handed over **only** if the deploy-time run
  actually failed.
- Sessions do not hold the production `DATABASE_URL`: never run `prisma db push` against the
  user's database from a session, and never ask for the `DATABASE_URL` in chat. Files carrying
  real employee PII are kept out of git.
- Secrets are never committed.

## Development Workflow
- Work on the session's designated branch; merge to `main` only when complete and verified.
- Per feature: `/speckit-specify` → `/speckit-clarify` (if ambiguous) → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, honoring Principle I at each gate.
- `specs/` is the single home for product specifications.
- Update the steering docs before merging to `main`.

## Governance
This constitution supersedes conflicting practices. Amendments require explicit user
approval and must be reflected in `CLAUDE.md` and any dependent spec-kit templates in the
same change. All spec-kit commands and reviews check work against these principles.

**Version**: 1.4.0 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-08-24
(1.1.0 — email allowed for the spec 020 benefit-claim workflow.
1.2.0 — email widened to the spec 037 holiday/vacation workflow, and the first
scheduled job admitted, with the rule that a cron may nudge HR but never email
employees; see Technology & Data Constraints.
1.2.1 — accuracy patch, no principle changed: migrations are applied by the
deploy-time runner rather than pasted into Neon by hand; the stack line corrected
to Next.js 15 and the sign-in method stated as email + password with Google
disabled; Principle V records the settled position that there is no testing
regime and protection is structural.)
