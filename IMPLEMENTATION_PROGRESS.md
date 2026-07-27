# HR_ERP — Implementation Progress (Live Tracker)

> What is built, in progress, and next. Updated every working session.

---

## Status at a glance
| Phase | Status |
|-------|--------|
| 0 — Docs & specs | 🟡 In progress (spec-kit adopted; specs 001–004 done) |
| 1 — Foundation (+ My Documents) | ⬜ Not started |
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

## Next up
1. Continue formalizing modules as specs (Time-Off · Dashboard · Benefits*) — one at a time.
   *Benefits still needs per-benefit limits + medical handling; ceilings already captured.
   Note: personal document upload (My Documents) folded into Foundation spec 001; no standalone HR Documents module.
2. Or begin `/speckit-plan` on Foundation to move toward the build.

## Notes / carry-over
- Planning docs originally drafted in a prior session were staged in another repo (inaccessible from HR_ERP-scoped sessions); they have been recreated here as the canonical copy.
- Benefits figures throughout are placeholders until the real rate card / ceilings / tenure bands arrive.

---

*Last Updated: 2026-07-27.*
