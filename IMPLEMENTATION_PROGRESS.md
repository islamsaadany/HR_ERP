# HR_ERP — Implementation Progress (Live Tracker)

> What is built, in progress, and next. Updated every working session.

---

## Status at a glance
| Phase | Status |
|-------|--------|
| 0 — Docs & specs | 🟡 In progress (spec-kit adopted; specs 001–007 done — all v1 modules specced) |
| 1 — Foundation (+ My Documents) | 🟡 In progress (scaffold + auth + registry + shell build green) |
| 2 — Team Directory | ⬜ Not started |
| 3 — Onboarding | ⬜ Not started |
| 4 — Handbook & Resources | ⬜ Not started |
| 5 — Time-Off / Leave | ⬜ Not started |
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
Autonomous build to the approved specs, module by module in phase order (design language = navy/gold; all 7 specs done).
1. Finish Foundation: HR registry admin CRUD + role grants; My Documents upload (Vercel Blob); team-data seed SQL (PII, gitignored).
2. Then Team Directory → Onboarding → Handbook & Resources → Time-Off → Benefits → Dashboard.
3. Hand-off items for the user: run `prisma/sql/*` in Neon; set env vars + Google OAuth in Vercel.

## Build log
- **2026-07-27 — Phase 1 Foundation scaffold:** Next.js 15.5 + React 19 + TS + Tailwind v4 +
  Prisma + NextAuth v5 (Google, domain-locked, JWT, no auto-provision). Prisma schema for the
  registry (User/Dependant/PersonalDocument + enums). App shell (navy/gold), /signin, /dashboard,
  /profile (real registry read + derived age/tenure), and coming-soon stubs for every module route.
  `npm run typecheck` and `npm run build` both green. `prisma/sql/000_initial_schema.sql` generated
  for Neon. Still to do in Foundation: HR registry admin CRUD, role-grant UI, My Documents upload
  (Vercel Blob), and the team-data seed SQL (PII, gitignored).

## Notes / carry-over
- Planning docs originally drafted in a prior session were staged in another repo (inaccessible from HR_ERP-scoped sessions); they have been recreated here as the canonical copy.
- Benefits figures are now **confirmed** (pool ceilings, guaranteed amounts by band, medical rate card) — see spec `007` and `PROJECT_DETAILS.md §5`. Claims/reimbursement remains Phase 2.

---

*Last Updated: 2026-07-27.*
