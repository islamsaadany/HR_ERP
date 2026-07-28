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
| 5 — Time-Off / Leave | 🟡 In progress |
| 6 — Benefits (admin config) | ⬜ Not started |
| 7 — Benefits (employee selector) | ⬜ Not started |
| 8 — Dashboard + polish | ⬜ Not started |
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

## Next up
Autonomous build to the approved specs. Done: Foundation · Team Directory · Onboarding · Handbook & Resources.
1. **Time-Off** (next) → Benefits (the big one) → Dashboard.
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

## Notes / carry-over
- Planning docs originally drafted in a prior session were staged in another repo (inaccessible from HR_ERP-scoped sessions); they have been recreated here as the canonical copy.
- Benefits figures are now **confirmed** (pool ceilings, guaranteed amounts by band, medical rate card) — see spec `007` and `PROJECT_DETAILS.md §5`. Claims/reimbursement remains Phase 2.

---

*Last Updated: 2026-07-27.*
