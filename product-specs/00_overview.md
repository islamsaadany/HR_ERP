# 00 — Product Overview & Spec Index

> The entry point to the written product specification. Each module has its own
> spec file. Code must match these specs; a drift is a documentation bug.

---

## What HR_ERP is
An internal HR platform for **Forefront Consulting**. Employees sign in with Google (company domain only), and a small HR/Admin group manages content and configuration. English-language. v1 covers onboarding, benefits selection, a team directory, HR documents, and a home dashboard, all built on a shared employee registry.

## Who uses it
- **Employee** — the default role. Sees their onboarding, builds their benefits basket, browses the directory, reads their documents and announcements.
- **HR / Admin** — authors onboarding content, configures the benefits cycle and rules, manages the registry and reporting lines, uploads documents, and posts announcements.

## Modules (v1)
| # | Spec file | Module | One-liner |
|---|-----------|--------|-----------|
| 01 | `01_foundation_auth_roles.md` | Foundation | Google SSO (domain-locked), roles, employee registry, app shell |
| 02 | `02_onboarding.md` | Onboarding | Phases → steps → checklist with saved progress; admin authoring |
| 03 | `03_benefits.md` | Benefits | Guaranteed benefits + flexible basket with server-enforced rules; admin config |
| 04 | `04_team_directory.md` | Team Directory | Member cards + org chart from reporting lines |
| 05 | `05_hr_documents.md` | HR Documents | Company-wide + personal documents via Vercel Blob |
| 06 | `06_dashboard.md` | Dashboard | Home surfaces: onboarding, benefits status, links, announcements |
| 07 | `07_design_system.md` | Design system | Ported paper/pine tokens, typography, shared components |
| 08 | `08_learning_track.md` | Learning Track | **Phase 2** — courses, lessons, quizzes, certificate |

## Product principles
1. **Benefits money and rules are server-authoritative.** The client never decides what is allowed.
2. **The employee registry is the backbone.** Directory, onboarding, benefits, and dashboard all read from it.
3. **The benefits selector design is a preserved asset.** It is ported faithfully from `benefitsselector_3.html`.
4. **Placeholder ≠ final.** Benefits figures are placeholders until the real card arrives and are never presented as final numbers.
5. **Align before building.** Specs are agreed before code; UI changes need explicit approval.

## Status
Phase 0 — Documentation. Detailed module specs (`01`–`08`) are written after the open decisions (A–D in `IMPLEMENTATION_PLAN.md`) are confirmed.

---

*Last Updated: 2026-07-27.*
