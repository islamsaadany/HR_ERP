# HR_ERP — Implementation Progress (Live Tracker)

> What is built, in progress, and next. Updated every working session.

---

## Status at a glance
| Phase | Status |
|-------|--------|
| 0 — Docs & specs | 🟡 In progress (spec-kit adopted; specs 001–007 done — all v1 modules specced) |
| 1 — Foundation (+ My Documents) | 🟢 Feature-complete (auth, registry CRUD, roles, profile, My Documents, seed) |
| 2 — Team Directory | 🟢 Complete (V1) |
| 3 — Onboarding | 🟢 Complete |
| 4 — Handbook & Resources | 🟢 Complete |
| 5 — Time-Off / Leave | 🟢 Complete (V1) |
| 6 — Benefits (admin config) | 🟢 Complete |
| 7 — Benefits (employee selector) | 🟢 Complete |
| 8 — Dashboard + polish | 🟢 Complete |
| 9 — Learning Track placeholder + Handoff | ⬜ Not started |

## Phase 0 — Docs & specs
- [x] Repo access to `islamsaadany/HR_ERP` confirmed and cloned.
- [x] Four-file system authored in repo (`CLAUDE.md`, `PROJECT_DETAILS.md`, `IMPLEMENTATION_PLAN.md`, this file).
- [x] **Spec-kit adopted** (`.specify/` + `/speckit-*` commands); `product-specs/` retired in favor of `specs/`.
- [x] **Constitution** authored (`.specify/memory/constitution.md`, v1.0.0) from the house rules.
- [x] Role model settled: Employee / HR Admin / Super User (+ org-chart manager capability).
- [x] Module list settled: Onboarding · Benefits · Team Directory · HR Documents · Dashboard · **Handbook/KB** · **Time-Off/Leave** · Learning Track (placeholder).
- [x] Team registry data cleaned (19 people; PII kept out of git; real emails pending).
- [x] Onboarding fully discovered (timeline stages · Policy/Action types · common core + Consulting track).
- [x] Real Benefit Scheme Policy mined from the Onboarding Kit; **pool ceilings confirmed** (FT 20/30/45/65k · PT 14/21/30/42k EGP).
- [x] **Spec 001 — Foundation (Employee Registry & Roles)** written + clarified. Ready for `/speckit-plan`.
- [x] **Spec 002 — Onboarding (Role-Aware Journey)** written + clarified. Ready for `/speckit-plan`.

### Specs written
| ID | Feature | Status |
|----|---------|--------|
| 001 | Foundation — Employee Registry & Roles | ✅ clarified, plan-ready |
| 002 | Onboarding — Role-Aware New-Joiner Journey | ✅ clarified, plan-ready |
| 003 | Team Directory (V1) | ✅ complete, plan-ready |
| 004 | Handbook & Resources | ✅ clarified, plan-ready |
| 005 | Time-Off / Leave Management (V1) | ✅ complete, plan-ready |
| 006 | Dashboard (Home) | ✅ complete, plan-ready |
| 007 | Benefits — Flexible Benefits Selection | ✅ complete, plan-ready |
| 008 | Knowledge Base — Consulting References & Reads | ✅ implemented (V1) |

## Next up
Autonomous build to the approved specs. Done: ALL 7 v1 modules (Foundation · Directory · Onboarding · Handbook · Time-Off · Benefits · Dashboard).
1. Build complete. Remaining: your setup actions in HANDOFF.md (Neon SQL, env, Google OAuth), then deploy + smoke test; optional polish (benefits visual fidelity, HR config-editing UI).
2. Hand-off items accumulate in `HANDOFF.md` (Neon SQL, env, Google OAuth, team-seed file) — delivered at the end.

## Build log
- **2026-07-27 — Phase 1 Foundation scaffold:** Next.js 15.5 + React 19 + TS + Tailwind v4 +
  Prisma + NextAuth v5 (Google, domain-locked, JWT, no auto-provision). Prisma schema for the
  registry (User/Dependant/PersonalDocument + enums). App shell (navy/gold), /signin, /dashboard,
  /profile (real registry read + derived age/tenure), and coming-soon stubs for every module route.
  `npm run typecheck` and `npm run build` both green. `prisma/sql/000_initial_schema.sql` generated
  for Neon.
- **2026-07-27 — Foundation complete:** HR registry admin CRUD (/admin/employees list/new/edit) with
  zod validation, email-uniqueness + reporting-line self/cycle guards, Super-User-only role grants;
  My Documents (Vercel Blob upload + authorized download route + delete); team seed SQL generated
  (`prisma/sql/seed_data_team.sql`, gitignored — 19 employees + dependants, delivered to user).
  Minor gap deferred: HR view/upload of another employee's personal docs from the admin record
  (FR-026 — download route already authorizes admins; admin upload UI to add later).

- **2026-07-27 — Onboarding complete:** schema (OnboardingActivity/ActivityCompletion + enums);
  employee journey (/onboarding) grouped by stage with live progress % and self-attested toggles;
  track assignment (common core + Consulting by department); HR authoring (/admin/onboarding CRUD);
  seeded 25 activities (`prisma/sql/001_seed_onboarding.sql`, committed) with cross-module deep links.
  Build green.

- **2026-07-27 — Handbook & Resources complete:** schema (HandbookSection, Resource); employee
  /handbook (searchable native sections + downloadable resources) + /handbook/[slug] reader;
  authorized resource download route; HR /admin/handbook (section CRUD + resource upload/delete
  via Vercel Blob); seeded 10 sections from the kit (`prisma/sql/002_seed_handbook.sql`). Build green.

- **2026-07-27 — Time-Off complete (V1):** schema (LeaveRequest + LeaveStatus); employee /time-off
  (request full-day range + note; my-requests list with status; cancel pending); direct-manager
  approval queue (approve/decline + comment); no-manager falls back to a Super User; date validation.
  Single generic type, no balances, full days. Build green.

- **2026-07-27 — Benefits complete:** schema (PlanYear, PoolCeiling, GuaranteedBenefit,
  MedicalRateCard, BenefitCatalogItem, BenefitSelection, SelectionLine + enums). Server-authoritative
  rule engine (`src/lib/benefits/rules.ts`): pool ceiling, FT 50% single-benefit cap, FT max-4 / PT
  max-2, medical rate-card premium (self always + spouse/children by bracket) exempt from 50% but
  ceiling-capped, steps of 1,000. Employee /benefits: guaranteed panel + ported navy/gold selector
  (toggles, steppers, live meter, medical modal) with save-draft/submit-lock; window-gated. HR
  /admin/benefits: plan-year open/close + create, submissions view + reopen. Seeded confirmed config
  (`prisma/sql/003_seed_benefits.sql`). Deferred: HR editing UI for ceilings/guaranteed/rate-card
  (values seeded & authoritative); selector visual polish vs the HTML reference. Build green.

- **2026-07-27 — Dashboard complete + build complete:** Announcement model; composed /dashboard
  (onboarding progress, benefits status, time-off, manager approvals tile, announcements, quick
  links — role-adaptive); HR /admin/announcements. All 7 modules build green (typecheck + next build).

- **2026-07-28 — Auth bridge + CSV employee import:**
  - **Temporary username/password sign-in** (NextAuth Credentials provider) so HR can use
    the app before Google OAuth is configured. Validated against a single bootstrap admin
    (`BOOTSTRAP_ADMIN_*`, defaults `Islam`/`1234`), upserted as an active SUPER_USER on first
    login — no seed/SQL. Google provider is now optional (shown only when `AUTH_GOOGLE_ID`/
    `_SECRET` set); signin page swapped to a username/password form (UI snapshot saved).
  - **Bulk employee import** at `/admin/employees` → **Import CSV**. Dependency-free CSV/TSV
    parser + tolerant date parser (long-form, dotted, `d-Mon-yy`, slash formats; ambiguous
    numeric dates read **day-first** per HR decision; unreadable/annotated dates left blank &
    flagged). Tenure band **derived from hire date**. Upsert by email (never changes an
    existing role); external-domain emails imported (directory-visible, can't sign in yet);
    kids → dependants when a DOB parses. Per-row on-screen review report. Verified against the
    real 19-row sheet. Replaces the gitignored `seed_data_team.sql` handoff. Build green.

- **2026-07-28 — Benefits catalog + shell polish:**
  - **Benefits selector rebuilt to `benefitsselector_3.html`:** catalog grouped into 5 display
    categories (Health & protection · Wellbeing · Life & family · Personal growth · Lifestyle &
    flexibility) with their items; category headers + "Selected" + "Terms & conditions" panels,
    navy/gold. Added `category` to `BenefitCatalogItem`; reseeded (`003`) + migration
    (`004_benefits_categories.sql`). Medical unchanged (Personal = self only; dependants separate
    in the modal). All money rules still server-side. Also fixed the `003` apostrophe bug.
  - **Collapsible sidebar:** chevron collapse → narrow icon rail with reopen; remembered in
    localStorage; **Handbook auto-collapses** it. Shell is now a client component; sign-out moved to
    a server action.
  - **Handbook & Resources → Vercel-style master–detail:** left list of sections + Resources group,
    content opens on the right, active item bold + navy underline, search retained. Removed the old
    card `HandbookBrowser`. Excluded `ui-versions/` snapshots from `tsc`.
  - Build green (typecheck + next build). UI snapshots saved before each edit.

- **2026-07-28 — Knowledge Base module (spec 008):** split the Handbook. The 3 consulting sections
  (Strategy Consulting, AI-Strategy Consulting, Assignment Phases) moved into a new **Knowledge Base**
  of admin-authored "reads." New `KnowledgeArticle` model; `/knowledge` employee master–detail
  (Vercel-style, search) with a Markdown renderer supporting GFM **tables**, `[!KEY/TIP/NOTE/WARNING]`
  **callouts**, and **mermaid** diagrams; `/admin/knowledge` CRUD with a **copyable Claude prompt** +
  paste-to-parse front-matter authoring flow. Nav gains "Knowledge Base" (auto-collapses the sidebar
  like Handbook). Seeded 9 starter articles mined from the Onboarding Kit PDF. DB: table added to
  `000`; 3 sections deactivated in `002`; `005_knowledge_base.sql` migrates existing DBs (table +
  deactivate + seed). Added deps: react-markdown, remark-gfm, mermaid. Build green.

- **2026-07-29 — Migration runner + onboarding v2 + handbook policies:**
  - **Deploy-time migration runner** (`scripts/apply-sql.mjs`, wired into `build`): applies pending
    `prisma/sql/NNN_*.sql` on each deploy, tracked in `_sql_migrations`; baselines the hand-applied
    000–005; no more pasting SQL into Neon. Skips cleanly when no DB URL (local builds).
  - **Onboarding v2:** stage is now **free-text** (group order from `order`) — no more enum
    migrations to add weeks. Redistributed into **Week 1–8 + Check-ins** (front-loaded foundation,
    consulting from Week 1, Real Case Sessions Momen/Omar/Galal/Islam in Weeks 3–6, split 30/60/90).
    New items: buddy, HR/Marketing/3× BU-head sessions, know-the-Time-Off-tool, 4 reading blocks,
    read case studies, own a deliverable. Policy items now deep-link to Handbook sections; actions to
    modules. (`006_onboarding_8week.sql`)
  - **Handbook policies:** added Office & Workplace · Time Off · Expenses · Code of Conduct ·
    Confidentiality · IT/Data-security sections (as points), plus optional **policy→tool buttons**
    (`actionLabel`/`actionHref`) — Time Off → Time-Off tool, People Governance → Benefits, rendered in
    both the reader and the explorer. (`007_handbook_policies.sql`)
  - All verified on a local Postgres (fresh + existing paths); typecheck + build green.

## Notes / carry-over
- Planning docs originally drafted in a prior session were staged in another repo (inaccessible from HR_ERP-scoped sessions); they have been recreated here as the canonical copy.
- Benefits figures are now **confirmed** (pool ceilings, guaranteed amounts by band, medical rate card) — see spec `007` and `PROJECT_DETAILS.md §5`. Claims/reimbursement remains Phase 2.

---

*Last Updated: 2026-07-29.*
