# HR_ERP — Implementation Plan (Source of Truth)

> Phases, scope, and the decisions log. Read after `PROJECT_DETAILS.md`.
> Live build status lives in `IMPLEMENTATION_PROGRESS.md`.

---

## Scope (v1)
Foundation (auth + roles + registry) · Onboarding · Benefits · Team Directory · HR Documents · Dashboard.
Deferred to Phase 2: Learning Track · Case Studies · Benefits claims/reimbursement.

## Build order & rationale
Team Directory is built before Benefits on purpose: it's the cheapest way to prove out Google identity, roles, the employee registry, and the app shell before the hard money module is layered on top.

| Phase | Deliverable | Notes |
|-------|-------------|-------|
| **0 — Docs & specs** | Four files + spec-kit adopted; per-module specs via `/speckit-specify` | *in progress* |
| **1 — Foundation** | Scaffold Next+Prisma+Tailwind; NextAuth Google (domain-locked); roles; `User`; **My Documents** (personal uploads); app shell; design tokens; seed | spec `001` |
| **2 — Team Directory** | Active-employee directory; name search + department filter; person view (V1, no org chart) | spec `003` |
| **3 — Onboarding** | Role-aware timeline journey (Policy/Action items); admin authoring; cross-module links | spec `002` |
| **4 — Handbook & Resources** | Structured handbook sections + downloadable Resources (company profile, templates, policies) | content from the Onboarding Kit |
| **5 — Time-Off / Leave** | Request → direct-manager approval; balance tracking | new module |
| **6 — Benefits (admin config)** | Plan-year window, pool ceilings, fixed benefits, basket catalog, medical handling | Selector is meaningless without these |
| **7 — Benefits (employee selector)** | Port the HTML selector to React; autosave + submit; **server-side rule enforcement** | The money module |
| **8 — Dashboard + polish** | Onboarding progress, benefits status, quick links, announcements; responsive pass | |
| **9 — Learning Track (placeholder) + Handoff** | Placeholder surface; docs current; deploy | Phase-2 for full Learning Track |

## Decisions log

### Settled
- **2026 — Stack:** Next.js 16 + Prisma + Postgres + Tailwind, NextAuth Google, Vercel Blob, Vercel deploy. Firebase reference reimplemented, not reused.
- **2026 — Repo:** `islamsaadany/HR_ERP` (new repo; now in session scope).
- **2026 — v1 modules:** Onboarding, Benefits, Team Directory, HR Documents, Dashboard.
- **2026 — Auth:** Google SSO restricted to the company domain + an HR/Admin role.
- **2026 — Benefits depth:** persisted selector — save & submit a basket (not just a simulator).
- **2026 — Benefits data:** real rate card / ceilings / tenure bands come later; build an admin config screen + placeholder seed meanwhile (Decision E).
- **2026 — Learning Track:** Phase 2 (Decision F).
- **2026-07-27 — Repo access resolved:** planning set recreated directly in HR_ERP.
- **2026-07-27 — Spec-kit adopted:** `specs/` is the single spec home (`product-specs/` retired); constitution authored from house rules; per-feature flow specify→clarify→plan→tasks→implement.
- **2026-07-27 — Roles:** Employee / HR Admin / Super User (superset). Manager is a capability derived from the org chart, not a role.
- **2026-07-27 — Modules added:** Handbook/Knowledge Base (its own module, built from the 118-page Onboarding Kit) and Time-Off/Leave Management (request → direct-manager approval). Learning Track is a v1 placeholder.
- **2026-07-27 — B/C (type & tenure):** admin-set on the profile, authoritative; tenure is an HR-set enum of four bands (6mo–2y / 2–4y / 4–7y / 7–10y) now, derive-from-start-date later.
- **2026-07-27 — Benefits ceilings confirmed (EGP):** FT 20/30/45/65k · PT 14/21/30/42k across the four bands. Basket has 4 categories (Gym · Mobile · Personal Medical · Schooling); FT 50% single-benefit cap; PT = max 2 picks. Per-benefit limits + medical handling still pending.
- **2026-07-27 — D (admin grant):** `ADMIN_EMAILS` allowlist bootstrap, then in-app promotion by a Super User.
- **2026-07-27 — Employee self-edit:** employees may edit only their own contact field(s) (phone); all else HR-managed.
- **2026-07-27 — Onboarding:** timeline stages (Day 1 / Week 1 / First month / 30-60-90); Policy vs Action item types; common core + role tracks (Consulting first); self-attested completion.
- **2026-07-27 — Login vs directory:** login stays domain-locked to `@forefront.consulting`; people with placeholder external emails appear in the directory but can't sign in until they get a company address.
- **2026-07-27 — Documents reshaped:** no standalone "HR Documents" module. Personal document upload becomes **My Documents** inside the employee Profile (Foundation, spec `001`). Company-wide content (policies, handbook, company profile, templates) lives in a **Handbook & Resources** module (structured handbook + a downloadable Resources area). Onboarding links updated accordingly.

- **2026-07-27 — Benefits figures fully confirmed:** guaranteed amounts by band (FT & PT) = the real figures; medical rate card = single tier (self/spouse 8k, child <18 4.5k, child ≥18 8k), exempt from 50% cap, dependants entered manually for now; no per-category caps/eligibility. All 7 v1 module specs written (`specs/001`–`007`).
- **2026-07-28 — Basket catalog expanded to the reference set (supersedes the earlier "4 categories"):** per the product owner, the flexible-basket catalog now follows `benefitsselector_3.html` faithfully — 5 display categories (Health & protection · Wellbeing · Life & family · Personal growth · Lifestyle & flexibility) with their items (Personal medical insurance, Annual health check-up, Gym, Coaching/therapy, Sports, Schooling, Childcare, Caregiver, Personal learning, Mobile, Home-office). Personal medical insurance = employee only; spouse/children stay separate priced options in the medical modal. Money rules unchanged (pool ceiling, FT 50% cap, FT max-4 / PT max-2, medical exempt — all server-side). Added a `category` field to `BenefitCatalogItem` (`prisma/sql/004_benefits_categories.sql`).

- **2026-07-28 — Handbook split → Knowledge Base (spec 008):** the consulting-craft sections
  (Strategy Consulting, AI-Strategy Consulting, Assignment Phases) move out of the Handbook into a new
  **Knowledge Base** of admin-authored Markdown "reads" (own `KnowledgeArticle` model, free-text
  categories). Authoring is a **shared Claude prompt → paste → parse** flow; bodies render tables,
  callouts, and mermaid diagrams. Handbook keeps the 7 operating sections; enriching those with the
  deck's full content is a later slice.

- **2026-07-29 — Migrations automated + onboarding/handbook restructure:** added a deploy-time SQL
  runner so schema/seed changes apply on deploy (no manual Neon). Onboarding moved to a **free-text
  stage** model (8-week structure, no enum), with policy items linking to Handbook guidance and a
  **policy→tool button** pattern on Handbook sections. New Handbook policy sections added.

- **2026-08-05 — Company coverage rates adopted (spec `012-benefits-coverage`, drafted):** the flexible basket gains a
  per-benefit **company coverage rate** (100% Personal medical / Annual check-up / Coaching · 80% Gym / Sports /
  Schooling / Childcare / Caregiver / Personal learning · 50% Mobile / Home-office). Only the **covered (company)
  share draws from the pool**; the employee pays the remainder. Pool total and the 50% cap run on the **covered
  amount**; claims reimburse the covered portion against proof of full spend. HR edits the rate per catalog item.
  Decided alongside: **full-time selections → 5** (from 4); **part-time stays distinct** (max 2, no 50% cap —
  a deliberate deviation from the concept doc); **medical stays a single item** (no Personal/Family split — also a
  deliberate deviation). Spec `012` layers onto `007`. The approved **concept doc** is imported at
  `specs/012-benefits-coverage/concept.md`, reconciled to those two deviations (11-benefit menu; PT rules called out).
  Three UX questions (cost-vs-pool-draw entry, step granularity, share display) are **deferred to `/speckit-clarify`**.
- **2026-08-07 — Company coverage rates BUILT (spec `012`, migration `023`):** implemented the co-funding model —
  per-benefit `coverageRate`; employee enters full cost; covered share (cost × rate) draws the pool; all money
  rules (pool total, over-pool, FT 50% cap) run on the covered amount; **FT 5 / PT 3** selection limits (PT raised
  to 3 by product decision, 2026-08-07); medical stays single/100%-covered/cap-exempt; claims reimburse the covered
  portion. Math centralized in `src/lib/benefits/coverage.ts`. Supersedes spec `007`'s max-4/max-2 and full-amount
  pool-draw FRs (annotated in 007). **Deferred to spec `016`:** the admin-Benefits tab redesign (Submissions &
  Claims · Catalogue · Amounts), the single Catalogue table with coverage % as a column, view-first config editing,
  HR/Super-User manual/back-dated claim & release entry (with approval date), and per-benefit FT/PT eligibility
  (future). Coverage-% editing lives in the existing Configuration catalog editor until then.
- **2026-08-07 — Orientation tour (planned, spec to follow):** a personalized, first-run, stepped walkthrough on the
  Benefits page (your band → guaranteed basket → flexible categories → the rules: 50%, coverage %, claims), skippable
  and re-openable. Approved to be its **own spec layered on `012`** (kept separate so `012` didn't balloon).
- **2026-08-05 — Backlog: HR bulk benefit release + export (not yet specced).** HR/Admin wants to release a single
  guaranteed benefit (e.g. **summer allowance**) to the **whole team at once** and **download a sheet** of employee
  name + amount-to-release for payroll/Finance. Distinct from the coverage work; to be specced next (own spec).

### Resolved earlier / Open
- **A · Design language** — *resolved 2026-07-27:* **navy/gold** (Forefront reference tool) product-wide. The benefits selector's layout/interaction is preserved but recolored to navy/gold (not paper/pine).
- **E · Real benefit figures** — *resolved:* ceilings, guaranteed amounts, and medical rate card all confirmed (spec `007`).
- **F · Learning Track timing** — *resolved:* stays Phase 2 (placeholder present in v1).

---

*Last Updated: 2026-07-27 (Phase 0).*
