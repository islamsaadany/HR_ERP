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
changes without explicit approval. The benefits selector design (paper/pine palette,
Fraunces + Hanken Grotesk) is a preserved asset: port it faithfully, never modernize it.
Before editing any UI file, snapshot it to `ui-versions/<component>/<date>_<desc>.tsx`.

### III. Benefits Money & Rules Are Server-Authoritative (NON-NEGOTIABLE)
Every benefits rule — pool ceiling by employment type × tenure, the 50% single-benefit cap,
selection-count limits (full-time and part-time), medical-insurance handling, and the
plan-year window — is validated on the server at save/submit time. The client mirrors rules
for UX only and is never trusted. Placeholder figures are never presented as final.

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

## Technology & Data Constraints
- Stack: Next.js 16 (App Router) + React 19 + TypeScript; PostgreSQL (Neon) + Prisma;
  NextAuth v5 Google provider (domain-locked to the company domain); Tailwind CSS;
  Vercel Blob for files; Vercel deploy. No email in v1.
- Roles: `EMPLOYEE`, `HR_ADMIN`, `SUPER_USER` (superset of HR Admin). A `manager`
  capability derives from the org chart (an employee with direct reports).
- Sessions do not hold the production `DATABASE_URL`. Schema/data reach the DB only via
  numbered, hand-runnable `prisma/sql/` files pasted into Neon — never `prisma db push`
  from a session, never ask for the `DATABASE_URL` in chat. Files carrying real employee
  PII are kept out of git.
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

**Version**: 1.0.0 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-07-27
