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

### 2b. CRITICAL: No Unneeded Complications
- **Answer the question that was asked, at the size it was asked.** A small request gets a small
  answer — one script, not four; one file, not a set; one paragraph, not a briefing.
- **Deliver ONE thing.** Never hand over alternatives, variants, or a "quick version and a full
  version" and leave the user to choose. Pick the best one and give that.
- **A check must answer in words**, not leave the user to interpret a blank result.
- **Don't expand scope mid-answer.** Extra options, extra tooling, extra explanation the user
  didn't ask for are noise — flag a genuine concern in one sentence and move on.
- **Prefer the shortest thing that works**, and only add detail when the user asks for it.

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
- **Server pages people MONITOR must keep themselves live** — layouts and server pages never re-render on client-side navigation or while sitting open, so a badge/queue/tracker painted once goes stale (cost us the dead campaign badge AND the tracker showing "Pending" while the fresh Excel said "Complete"). Pattern: a poller (mount + focus + interval) hitting a small API and broadcasting a `hrerp:*` event (`DataRequestLayer`, `TimeOffBadgeSync`), or `AutoRefresh` (router.refresh on focus + 30s) for whole pages. Apply it to any new surface whose data other people change.
- **A money ceiling must be enforced on EVERY write path, in every order** — the benefits pool was
  guarded only on the flexible-claim path, so whether it held depended on which write happened first;
  everything that changed the numbers afterwards (applying a carried medical charge, re-pricing,
  back-filling, reopening a rejected claim, re-banding) wrote freely, and the report floored the
  overdraft to zero so nobody could see it (cost us a 2,093 overrun; found 2026-08-20). Rules: derive
  the limit in **one** place (`src/lib/benefits/pool.ts`) — three copies of one money rule means the
  loosest one pays; keep the remaining figure **signed** so an overdraft is distinguishable from an
  exactly-spent pool; refuse rather than clamp when a thing cannot be part-bought; hold money that no
  longer fits (never drop it, never silently draw it); and lock **per subject** — a Serializable
  transaction aborted unrelated employees' writes (1 of 6), a `SELECT … FOR UPDATE` on the employee's
  own row gives 6/6 while still serialising that one person.
- **A table cannot both freeze its first column and park its header under a pinned title** — freezing
  needs a scrollable box, and a sticky header inside a box sticks to the box, not the page. Wide
  tables stay boxed (`ff-data-scroll`); only a table that genuinely fits gets the page-scrolled
  treatment, and then only at the widths where it fits (`ff-scroll-below-xl` covers the rest).
  Any non-visible overflow makes a box a scroll container — `overflow-x: auto` alone is enough to
  break a page-level sticky header.
- **An all-or-nothing form must put its rejection where the eyes are** — the employee edit form validated the WHOLE record on save and rendered the reason at the top of a four-section form while Save sat at the bottom, so a legacy phone silently killed every unrelated edit and read as a dead button (cost us "part-time won't save"; found 2026-08-20). Two rules: (a) a whole-record validator must never reject over a stored value the operator didn't touch — pass the current values in and exempt unchanged ones; (b) an error banner needs `role="alert"`, `tabIndex={-1}`, and a `scrollIntoView` + `focus` effect, and must report **every** fault at once, not just the first.
- **Never close a menu/modal from a submit button's `onClick`** — React flushes click updates synchronously, so the `<form>` unmounts before the browser dispatches `submit`; the action silently never runs ("Form submission canceled because the form is not connected" is the only clue). Dispatch first, then close — wrap the action: `action={(fd) => { dispatch(fd); setOpen(false); }}`. Cost us a shipped-but-dead bulk password action; found 2026-08-16.
- **Per-module authority is an APPOINTMENT, never a new `Role` member** — "someone who runs
  Learning but is not HR" was built as a `LearningManager` row, not a role. A new role value is
  something every other module's check has to be right about forever; an appointment is inert, the
  person stays an `EMPLOYEE`, and the employee form does not change — so it cannot leak into
  Benefits or salaries because there is nothing new to misread. Rules: **one derivation**
  (`canManageLearning` = role OR appointment) asked by the pages, the actions, the sidebar door and
  the serving routes alike — never `isAdmin` for that module again; the **role-holders are never
  rows** (HR holds it because they hold everything, so emptying the table cannot lock them out, and
  they get no Remove button that would lie about it); and **the appointment cannot appoint** —
  granting stays `requireAdmin()`, or the role hands itself out. A restricted admin home shows the
  ONE section they own, and the other modules' counts are not fetched at all.
- **A count shown beside a choice must be THAT choice's count** — the Learning access panel counted
  everyone matched by ANY audience rule and printed the same total beside every row, so a nine-person
  department and an empty business unit both read 23. The column existed solely to expose a rule
  reaching nobody, and it could not (found + fixed 2026-08-22, `audienceReachByRule`). Two rules:
  compute per subject, and compute it **through the same derivation the real check uses**
  (`audienceWhere`) — a count written separately to "look right" will eventually disagree with who
  actually gets the thing, and then it is worse than no count. Related: **one way to say
  "everyone"** — the same panel offered it as a course setting AND as an audience rule, so a course
  could read RESTRICTED while reaching the whole company.
- **A visibility rule needs ONE source and must be re-decided at the door** — the Learning
  materials tab labels three document slots and the employee page only ever selects one, but
  neither is a control: a URL is a URL, and somebody who has seen a slides link can guess an
  outline one. `EMPLOYEE_VISIBLE_SLOTS` (`src/lib/learning/materials.ts`) is the single source, and
  `/api/learning/documents/[id]` asks it again on every request — answering **404, not 403**, since
  "forbidden" confirms the file exists. Same shape as the pool ceiling: derive once, enforce on
  every path.
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

**v1 modules:** Foundation (auth + roles + employee registry + **My Documents** personal uploads) · Onboarding · Benefits · Team Directory · **Handbook & Resources** (shared policies/handbook + downloadable company files) · Time-Off / Leave Management · Dashboard · Learning Track · **Reviews & 1:1s** (spec 040).
**Phase-2 (designed-for, built later):** full Learning Track, Case Studies, benefits claims/reimbursement.

The **Benefits** module is the heart of v1 — it is the only module involving money and admin-configured rules (pool ceilings by employment type × tenure, a 50% single-benefit cap, and rate-card-driven medical insurance that is exempt from the 50% cap). As of **spec 018** it is a **claim-based living allowance**: no basket to submit — employees claim flexible benefits as they spend across the open plan year, medical is a one-time commitment, and the benefit-count limit is retired (dormant flag). All rule enforcement lives server-side.

### Technology Stack (decided)
- **Framework:** Next.js 15 (App Router) + React 19
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
- **Medical is age-banded per-person (spec 023)** — the medical rate card is a **`MedicalRateBand`** table priced by each covered person's **age** (Tier 1 today; `annualPremium` two-decimal). An employee's premium = the sum of each covered person's age-band figure (employee + covered dependants), **cents dropped (truncated, not rounded)**, prorated ÷12 for mid-cycle joiners, capped at the pool ceiling; age is fixed **at the commit date** and snapshotted in `MedicalCoveredPerson`. Pricing is pure in `src/lib/benefits/rates.ts`, enforced server-side at commit. The **spouse is a `Dependant` (kind SPOUSE)** entered in the employee form like kids (one max); the medical modal only selects who to cover; **DOB is required** (commit blocked without it). Employees see whole EGP; the admin **Amounts** tab keeps the operator's exact figures.
- **Placeholder benefits data** — real pool ceilings and tenure bands arrive later; until then an admin config screen + seeded placeholders drive the module. Placeholder figures must never be presented as final. (The medical rate card is now the confirmed operator Tier-1 figures — spec 023.)
- **Identity data standards (spec 029/033, 2026-08-17)** — dates DISPLAY as **dd/mm/yyyy** everywhere (screens and CSVs; `formatDate` is the one formatter; ISO only in storage and `<input type="date">` plumbing). Phones are ONE sequence `+<dial><digits>` validated per country (`src/lib/phone.ts`); national ID is exactly 14 digits — strict server-side everywhere including the importer, with ONE exemption (2026-08-20): on the **admin employee edit form**, a value re-submitted **identical to what is already stored** passes, because migration 053 deliberately left un-parseable legacy phones in place and `PhoneInput` re-sends a stored value verbatim — so enforcing it there made the whole record unsavable over a field nobody had touched. Anything the operator actually changes is still strict (`employeeFormSchema(stored)` in `lib/validation.ts`). Employee-answerable fields live in ONE registry (`campaign-fields.ts` composing `requestable.ts`); **data request campaigns** (Admin → Data Requests, HR/Finance) collect them via a per-field-saving popup + live sidebar badge, writing directly to `User`. Colour semantics: navy = action, green = done-state only.
- **Time-Off counts WORKING days, never limits (spec 035, 2026-08-18)** — weekend is **Friday + Saturday**, the HR-managed public-holidays list also never counts (`src/lib/workdays.ts` is the ONE counting engine, shared server + client preview); there is **no entitlement/limit — only a per-calendar-year taken count** visible to employee/manager/HR; no leave types. Approvals resolve against the **current** org chart (`pendingApprovalWhere`/`canDecideLeave`), never the stored approver snapshot.
- **A guaranteed benefit is paid at most once per cycle (2026-08-18)** — claims and bulk releases are mutually aware in every payment path (employee claim, HR Record entry, Release sheet); employee cards show the true state (gold in-review / green received) instead of a dead button. **Eligibility exceptions are per-person GRANTS (spec 036)**: a Super User grants one person one benefit for the open cycle at a typed amount (Exceptional releases tab); the person then uses the completely normal request→approve→pay flow — never widen a benefit's general eligibility for one person, and never pay around the flow via sheet overrides (one was shipped and reverted same-day).
- **Official holidays are a lifecycle, not a date list (spec 037, 2026-08-19)** — a holiday is ONE entry covering a **date range** (Eid included) with an **announced** range and an **actual/observed** range; all working-day counting reads the actual one, so moving a holiday re-counts every request live. Status is `TENTATIVE | VERIFIED | MOVED`; HR fetches a year from Nager.Date as **suggestions only** (nothing stored without confirmation) and actual ranges may never overlap (enforced in the server actions — Prisma can't express it). A **daily Vercel Cron** (`/api/cron/holidays`, `CRON_SECRET`) nudges HR to verify a tentative date within a configurable lead (default 14 days) — it can **never** email employees. Team announcements are **drafted deterministically** (English then Arabic, warm, with bridge/long-weekend callouts) and **only ever sent by a human**; each send snapshots the dates it went out with, which is what flags "announced with an outdated date" and makes the next draft a correction. A **bridge is exactly ONE working day** between off-days. Moving a holiday onto someone's booked leave emails them the day was returned.
- **A privacy promise must survive "view as" (spec 040, 2026-08-24)** — `requireUser()` deliberately
  returns the **impersonation target**, which is right for every module except one: a Super User
  viewing as an employee would have read that person's private review journal. Reviews & 1:1s
  resolve the **real** session user (`requireRealUser`, `src/lib/reviews/access.ts`) and the module
  **refuses to run at all** while impersonating. Rule: before promising that something is private,
  check what "the current user" means on that path — and prefer refusing to silently
  un-impersonating, because the second one shows somebody their own data under another identity.
  Related: **whose records these are is stored, not derived** — a review and a 1:1 keep their
  `employeeId`/`managerId` and are authorised against those, the deliberate **opposite** of the
  Time-Off rule (approvals resolve against the *current* chart). A leave request must reach whoever
  can approve it today; a review belongs to the two people who had it, so a new manager never
  inherits the previous one's conversations. Both departures are recorded in spec 040's
  Complexity Tracking so a later session does not "fix" them back.
- **Sealing means the data is not sent, not that it is hidden (spec 040)** — a review sheet's two
  halves stay sealed until both parties submit **and both** confirm they met (one confirming alone
  would be a way to read the other's half by declaring a meeting that never happened). What makes
  it true is that `visibleItemsWhere` scopes the **query**: the counterpart's rows are never
  fetched, so no preview, word count, or per-question completion state exists in the payload to be
  uncovered. A quarter that ends with no meeting **opens nothing and carries nothing forward** —
  an unheld review must not leave a record that it happened.
- **Email is limited to TWO workflows (specs 020 + 037)** — the original "no emails, ever (v1)" rule was reversed for the benefit-claim workflow (approved 2026-08-10) and widened to the holiday/vacation workflow (approved 2026-08-19). Transactional claim notifications (submit→HR, approve→Finance, reject/reimburse→employee) send via **Resend**, **env-gated** (`RESEND_API_KEY`/`EMAIL_FROM`) and **fire-and-forget** (never block a state change), configurable + master-toggleable at **Admin → Notifications**. Still **no** invitations, marketing, or other notifications outside these two workflows.

---

## Configuration

### Database operations (Neon)
**Migrations are Claude's job, not the user's.** The user should never be asked to paste SQL into
Neon as the normal path. Whenever `prisma/schema.prisma` or `prisma/seed.ts` changes:

1. Write the matching `prisma/sql/0NN_*.sql` and commit it **in the same commit**. Keep it
   **idempotent** — it may be retried.
2. The Vercel build applies it: `scripts/apply-sql.mjs` runs every not-yet-applied file in order
   and records it in `_sql_migrations`, so each runs once and a redeploy is a no-op. It is
   deliberately non-fatal, so a failed file lets the deploy succeed — check the build log's
   `[apply-sql]` lines.
3. Verify it landed, and tell the user the result in one line. Hand over a paste-it-yourself file
   only if the deploy-time run actually failed.

**Never** run `prisma db push` against the user's DB from a session, and **never** ask the user to
paste their `DATABASE_URL` into chat.

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
| `CRON_SECRET` | Authenticates the daily holidays cron route (`/api/cron/holidays`, spec 037) |

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

### `npm test` — a tool, not a routine
There is **no testing regime here and none is wanted**: nothing runs on a schedule, nothing gates a
deploy, and no session is obliged to run anything. What protects the money rules is structural —
ONE derivation of the pool ceiling (`src/lib/benefits/pool.ts`), the guards on each write path, and
the per-employee lock. Those hold without anybody remembering anything, which is the point.

`npm test` exists for the one moment it earns its keep: you are changing benefits code and want to
know whether the ceiling still holds. Reach for it then; ignore it otherwise. The database-backed
half skips unless `TEST_DATABASE_URL` points at a disposable database whose name contains `test`
(it TRUNCATEs, and `tests/setup.ts` refuses Neon outright):

```bash
createdb hrerp_test
TEST_DATABASE_URL="postgresql://…/hrerp_test" npx prisma db push
TEST_DATABASE_URL="postgresql://…/hrerp_test" npm test
```

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

*Last Updated: 2026-08-24 (Added: spec 040 — Reviews & 1:1s. A privacy promise must survive "view as"; whose records these are is stored, not derived (the deliberate opposite of the Time-Off rule); sealing means the data is not sent, not that it is hidden. Previously: 2026-08-22 (Added: a count shown beside a choice must be that choice's count, computed through the same derivation the real check uses; one way to say "everyone". Plus: per-module authority is an appointment, never a new Role member — one derivation, role-holders are never rows, the appointment cannot appoint. Plus: a visibility rule needs one source and must be re-decided at the serving route, 404 not 403. Previously: 2026-08-20 (Added: `npm test` is a tool, not a routine — no regime, no deploy gate, no standing obligation; protection is structural. Plus: the pool ceiling is enforced on every write path in every order — one derivation, signed remaining, refuse-don't-clamp, per-employee row lock; the freeze-vs-parked-header table rule; unchanged legacy identity values no longer block an unrelated employee-form save, and rejected saves are now scrolled to / announced / listed in full. Previously: official-holiday lifecycle + announcements (spec 037) and the first scheduled job; email widened to that workflow; HR may reopen a rejected claim with a reason. migrations now run through Claude via the deploy, not by hand; added the no-unneeded-complications rule.))*
