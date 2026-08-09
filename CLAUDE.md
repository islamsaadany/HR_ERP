# Claude Code Instructions for HR_ERP

> This file is automatically read by Claude Code at the start of each session.
> It contains project-specific instructions, guidelines, and configuration.

---

## The Four-File System (read these first, every session)

This project is steered by four living documents plus a spec folder. Read them
in this order at the start of every session:

1. **`CLAUDE.md`** (this file) — how to work, conventions, house rules.
2. **`PROJECT_DETAILS.md`** — technical reference: stack, schema, modules, decisions that are settled.
3. **`IMPLEMENTATION_PLAN.md`** — the source of truth for phases, scope, and the decisions log (including open decisions).
4. **`IMPLEMENTATION_PROGRESS.md`** — the live tracker of what is built, in progress, and next.
5. **`specs/`** — the spec-kit home for per-feature specifications (one folder per feature, authored via `/speckit-specify`). This is the written product-spec set; code must match it.

**When any of the above changes materially, update it in the same commit as the code.** A drift between `specs/` and code is a documentation bug — report it before silently realigning.

### Spec-Driven Development (spec-kit)
This project uses **spec-kit** for feature work. The governing document is
`.specify/memory/constitution.md` (our house rules in enforceable form). Per feature, follow:
`/speckit-specify` → `/speckit-clarify` (if ambiguous) → `/speckit-plan` → `/speckit-tasks`
→ `/speckit-implement`, honoring "Align Before Building" at every gate. Specs live in `specs/`;
the four steering files above track scope, decisions, and progress across features.

#### Spec-kit skills — use them, don't freehand
The `/speckit-*` steps are **installed skills**; invoke them via the Skill tool (or the
matching `/speckit-…` slash command) rather than improvising the equivalent by hand. Use
the right one for the moment:

| Skill | When to use it |
|-------|----------------|
| `speckit-specify` | Start or rewrite a feature's `spec.md` from a plain-language description. |
| `speckit-clarify` | The spec is ambiguous — ask up to 5 targeted questions and fold answers back in. |
| `speckit-plan` | Turn an agreed spec into design artifacts (the implementation plan). |
| `speckit-tasks` | Generate the dependency-ordered `tasks.md` from the plan. |
| `speckit-analyze` | Non-destructive consistency check across spec ↔ plan ↔ tasks after tasks exist. |
| `speckit-checklist` | Produce a focused review checklist for a feature. |
| `speckit-implement` | Execute `tasks.md` in order. |
| `speckit-converge` | Assess built code vs. the spec/plan/tasks and append any unbuilt work as tasks. |
| `speckit-constitution` | Create/update `.specify/memory/constitution.md` and keep templates in sync. |
| `speckit-taskstoissues` | Convert tasks into GitHub issues (only when we've decided to track on GitHub). |

**Rules of use:** always **align before running** a step that writes artifacts (specify/plan/
tasks/implement) — the constitution's "Align Before Building" applies to spec-kit itself. When
touching an existing v1 module, prefer **`speckit-converge`/`speckit-analyze`** to surface gaps
before adding tasks. Whatever a skill writes into `specs/` must stay in sync with the code and the
four steering files (same commit).

---

## Working Guidelines

### 1. CRITICAL: Never Act Without Alignment
- **NEVER implement features or make significant changes without explicit user confirmation.**
- **When the user says "let's align first" — STOP and discuss before any implementation.**
- **Always present the plan/structure and wait for confirmation before coding.**
- **If uncertain about requirements, ASK — do not assume.**
- **This rule is NON-NEGOTIABLE.**

### 1b. CRITICAL: Align Before Every Fix or Change
- **Before implementing ANY fix or change, explain what you plan to do in simple, non-technical words.**
- **Wait for the user to confirm before writing any code.**
- **If there are multiple approaches, present them as options with a clear recommendation.**
- **Never redesign, restyle, or restructure anything that wasn't explicitly asked for.**
- **Stick to exactly what was requested — no extra "improvements" or visual changes.**
- **If a fix requires touching something the user didn't mention, flag it and ask first.**

### 1c. CRITICAL: UI Changes Require Explicit Approval
- **NEVER change any UI design, layout, styling, or visual element without explicit user approval.**
- **This includes: colors, borders, spacing, card designs, labels, icons, section order, font sizes — EVERYTHING visual.**
- **Product design language is navy/gold (from the Forefront reference tool).** The benefits selector's **layout & interaction model** is a preserved asset — port its structure faithfully, recolored to navy/gold; do not redesign it.
- **When restoring a design, match the original EXACTLY.**
- **MOCKUP-FIRST (NON-NEGOTIABLE): never adjust a design — layout, structure, section order, styling, or any visual element — without first showing the user a static HTML mockup of the proposed look and getting explicit sign-off on that HTML view.** Build the mockup (self-contained HTML, navy/gold palette, saved under `design-mockups/<feature>/<YYYY-MM-DD>_<desc>.html` and published as an Artifact for review), wait for approval, and only then touch the real components. No "I'll just build it and you review at the end" for visual/structural changes.
- **After ANY UI change, save a snapshot of the changed file to `ui-versions/` (see UI Version Tracking below).**

### 2. Think Before Acting
- **Don't follow commands blindly** — analyze requests and challenge if something seems incorrect or risky.
- **Align before action** — if there's ambiguity or risk, discuss first.
- **Consider implications** — think through downstream effects before implementing.

### 3. Quality Assurance
- **Always verify the build** — run `npx tsc --noEmit` and `npm run build` before handing anything over.
- **Fix type errors across the outcome** — don't leave TypeScript errors unresolved.
- **Test implications of changes** — ensure changes don't break existing functionality.

### 3a. CRITICAL: Audit Fixes Before Asking the User to Test
- **Never hand over a fix and ask the user to test it without auditing it yourself first.** The user's time is not a substitute for verification.
- **Prove the fix works with the tools available**, not by reasoning alone:
  - Always run `npx tsc --noEmit` and `npm run build`.
  - For **DB/schema/seed changes**, apply the SQL to a **throwaway local Postgres** and query the exact rows/columns the pages read, confirming the real outcome (a local Postgres 16 is available: `initdb`/`pg_ctl` under `/usr/lib/postgresql/*/bin`, run as the `postgres` user, socket under `/tmp`). Do **not** assume seed SQL applied cleanly or produced the right data.
  - For behavior changes, trace the actual code path end-to-end.
- **State what you verified and how** when handing over. If something is genuinely un-testable from here (e.g. the user's live Neon DB), say so explicitly and explain the residual risk — don't present unverified work as done.
- **When a symptom persists, re-audit from first principles** instead of repeating the same instruction. Find the proof (e.g. "the Handbook still lists section X, which only migration 005 removes") before concluding.

### 3b. Engineering Preferences (Overrides Defaults)
- **DRY: flag repetition aggressively** — extract at 3+ repeats; flag at 2.
- **Edge cases: handle more, not fewer** — nulls, empty states, unexpected input, boundaries.
- **Aim for "engineered enough"** — not fragile, not over-abstracted. When in doubt, ask.
- **Explicit over clever** — readable, obvious code over compact/clever solutions.
- **Benefits money & rules are server-authoritative** — every pool ceiling, 50%-per-benefit cap, and medical rule is enforced on the server at claim/commit time, never trusted from the client. (The benefit-count limit is retained but off by default — spec 018.)

### 4. Git Workflow
- **Development branch:** the session-coded branch you start on (e.g. `claude/hr-system-planning-2oc2mu`). All work is committed here.
- **`main`** — production/stable. Merge to main only when work is complete and verified.
- **Commit with descriptive messages** — explain what and why.
- **Push:** `git push -u origin <branch-name>`; retry on network errors with exponential backoff.

### 5. Communication
- **Be proactive about issues** — flag concerns early.
- **Explain reasoning** — give the rationale behind suggestions.
- **Ask clarifying questions** — better to ask than assume.

---

## Project Context

### What This App Is
**HR_ERP** is an internal HR platform for **Forefront Consulting**. Employees sign in with Google (restricted to the company domain); a small **HR/Admin** group manages content and configuration. The product is in English.

**v1 modules:** Foundation (auth + roles + employee registry + **My Documents** personal uploads) · Onboarding · Benefits · Team Directory · **Handbook & Resources** (shared policies/handbook + downloadable company files) · Time-Off / Leave Management · Dashboard · Learning Track (placeholder in v1).
**Phase-2 (designed-for, built later):** full Learning Track, Case Studies, benefits claims/reimbursement.

The **Benefits** module is the heart of v1 — it is the only module involving money and admin-configured rules (pool ceilings by employment type × tenure, a 50% single-benefit cap, and rate-card-driven medical insurance that is exempt from the 50% cap). As of **spec 018** it is a **claim-based living allowance**: no basket to submit — employees claim flexible benefits as they spend across the open plan year, medical is a one-time commitment, and the benefit-count limit is retired (dormant flag). All rule enforcement lives server-side.

### Technology Stack (decided)
- **Framework:** Next.js 16 (App Router) + React 19
- **Language:** TypeScript
- **Database:** PostgreSQL (Neon, serverless) + Prisma
- **Auth:** NextAuth.js v5, Google provider, restricted to the company domain. HR/Admin role gating on server routes.
- **Styling:** Tailwind CSS. Product design language is **navy/gold** (from the Forefront reference tool). The benefits selector's layout/interaction is ported faithfully in that palette.
- **File storage:** Vercel Blob (HR documents, personal docs).
- **Deployment:** Vercel.
- **Email:** none in v1 (no invitations/reminders).

### Reference Materials (context, not to be copied verbatim)
- **Forefront Consultant Wizard V2** — a React 19 + Vite + Firebase reference tool that already implements onboarding, a learning track, team directory, HR documents, case studies, and a dashboard. Its *concepts* inform HR_ERP; its Firebase/Vite implementation is **not** reused — we reimplement in the Next.js/Prisma/Postgres house stack.
- **benefitsselector_3.html** — a self-contained flexible-benefits simulator. Its **design and interaction model are the source of truth** for the Benefits employee experience and are ported faithfully to React. Its rate card and figures are placeholders pending the real data.

### Repository
- **GitHub:** `islamsaadany/HR_ERP`
- **Production URL:** Vercel-hosted (set in the Vercel dashboard).

### Target Directory Layout
```
HR_ERP/
  CLAUDE.md
  PROJECT_DETAILS.md
  IMPLEMENTATION_PLAN.md
  IMPLEMENTATION_PROGRESS.md
  .specify/                        # spec-kit: templates, workflow, memory/constitution.md
  specs/                           # spec-kit feature specifications (one folder per feature)
  src/
    app/
      layout.tsx  globals.css  page.tsx
      (dashboard)/                 # employee shell + home
      onboarding/
      benefits/
      directory/
      documents/
      admin/                       # HR/admin surfaces
      api/                         # route handlers (server-authoritative)
    lib/
      prisma.ts   auth.ts   roles.ts
      benefits/                    # pool/cap/rate-card rule engine (server)
    data/
      constants.ts  types.ts
  prisma/
    schema.prisma  seed.ts
    sql/                           # hand-runnable SQL for Neon (see Configuration)
  ui-versions/                     # UI snapshots before edits (rollback log)
```

**Authoring status:** Feature-complete through Phase 8 (Foundation → Benefits → Dashboard). `src/`, `prisma/`, and `package.json` all exist and build; the layout above reflects the live structure. Remaining: Phase 9 (Learning Track placeholder + handoff) and the spec 018 Neon migration + UI review. See `IMPLEMENTATION_PROGRESS.md` for the live status.

### Important Patterns (project-specific)
- **Email + password sign-in (Google parked)** — sign-in is NextAuth Credentials (email + scrypt-hashed password); the company-domain restriction on password login was **lifted** (2026-08-07) — any registered employee may sign in, and HR is warned when creating a non-company-domain email. Google is disabled for now (button removed; provider still env-gated so it can return). Admin-issued passwords are temporary: the employee is forced to `/set-password` on next sign-in (`mustChangePassword`) and must choose one meeting the policy (≥ 8 chars, uppercase + number + special). No emails in v1 → a forgotten password is reset by HR (no self-service recovery).
- **Roles** — `EMPLOYEE`, `HR_ADMIN`, and `SUPER_USER` (superset of HR Admin; adds governance: role grants + app-wide settings). A `manager` capability derives from the org chart (an employee with direct reports) — e.g. approving their team's time-off. Admin surfaces and API routes check role server-side. Bootstrap admins via `ADMIN_EMAILS`; later, promotion in-app.
- **Employee registry is the backbone** — `User` (Google identity + employmentType + tenureBand + reportsTo + role) is read by Directory, Onboarding, Benefits, and Dashboard. It is built and validated first (Phase 2) before the money module is built on top.
- **Benefits rules are server-side (spec 018)** — pool ceiling (type × tenure), the 50%-per-benefit cap (on cumulative claims, full- **and** part-time), and medical handling are validated at claim/commit time in `src/lib/benefits/` (`evaluateClaim`). The client mirrors them for UX only. The benefit-count limit is retained behind `COUNT_LIMIT_ENABLED` (default off).
- **Plan-year window** — an admin opens/closes a benefits cycle; employees can only claim / commit medical while it is open. **Medical is committed once** (a `MedicalCommitment` row) and then locked — only HR can change/remove it. **Flexible benefits are claimed as-you-go** (`BenefitClaim` linked directly to the catalog item); there is no basket to submit and no per-benefit allocation. (Superseded the old basket/`BenefitSelection` model.)
- **Placeholder benefits data** — real rate card, pool ceilings, and tenure bands arrive later; until then an admin config screen + seeded placeholders drive the module. Placeholder figures must never be presented as final.
- **No emails, ever (v1)** — no invitations, reminders, or notifications.

---

## Configuration

### Database operations (Neon)
Claude Code sessions **do not** have production `DATABASE_URL` and **cannot** push schema changes to the user's DB directly. Two handoff surfaces:

- **`npm run db:*` scripts** — if a local terminal is available.
- **`prisma/sql/` numbered files** — hand-runnable SQL to paste into Neon's SQL editor, in order. Whenever `prisma/schema.prisma` or `prisma/seed.ts` changes, regenerate the corresponding `prisma/sql/00N_*.sql` file and commit it **in the same commit**. Tell the user exactly which file(s) to paste and in what order.

**Never** run `prisma db push` against the user's DB from a session, and **never** ask the user to paste their `DATABASE_URL` into chat.

### Required env vars (target)
| Variable | Purpose |
|----------|---------|
| `POSTGRES_URL` | Neon pooled connection string (runtime) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (migrations) |
| `NEXTAUTH_SECRET` | NextAuth session signing secret |
| `NEXTAUTH_URL` | Public app URL (local only; Vercel auto-detects) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `ALLOWED_EMAIL_DOMAIN` | Domain allowed to sign in (e.g. `forefront.consulting`) |
| `ADMIN_EMAILS` | Comma-separated bootstrap admin allowlist |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for document storage |

### Build Commands
```bash
npm run dev          # Dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx tsc --noEmit     # Type check only (no DB needed)
```

---

## Common Tasks

### UI Version Tracking (MANDATORY)
Before editing any UI component file, copy it to
`ui-versions/<component-name>/<YYYY-MM-DD>_<short-description>.tsx`. The snapshot
is the rollback point; the live file is the new version. This exists because
prior sessions have accidentally reverted agreed-upon designs.

### Before Committing
1. `npx tsc --noEmit` — no TypeScript errors.
2. Review all changed files.
3. No secrets committed (`.env.local`, tokens, keys).
4. If a UI file changed, confirm the `ui-versions/` snapshot was saved.
5. If schema/seed changed, confirm the matching `prisma/sql/` file was regenerated.

### Keeping Docs Current (MANDATORY before merging to main)
1. Update **`PROJECT_DETAILS.md`** for new features, endpoints, schema, or behavior.
2. Update **`IMPLEMENTATION_PROGRESS.md`** to reflect what's built.
3. Update the relevant **`specs/`** feature spec if product behavior changed.
4. Update **`IMPLEMENTATION_PLAN.md`** decisions log for any resolved decision.
5. Update this **`CLAUDE.md`** if a new pattern/rule/workflow was established.

---

*Last Updated: 2026-08-09 (Reconciled the authoring-status line with the live repo — feature-complete through Phase 8; `src/`, `prisma/`, and `package.json` exist and build.)*
