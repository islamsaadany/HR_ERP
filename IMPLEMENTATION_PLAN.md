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
| **0 — Docs & specs** | The four files + `product-specs/` (overview now; 8 module specs after decisions A–F) | *in progress* |
| **1 — Foundation** | Scaffold Next+Prisma+Tailwind; NextAuth Google (domain-locked); roles; `User`; app shell; design tokens; seed | |
| **2 — Team Directory** | Simplest module; validates identity + registry + shell; member cards + org chart | |
| **3 — Onboarding** | Employee wizard + progress; admin content authoring | |
| **4 — Benefits (admin config)** | Plan-year window, pool ceilings, rate card, guaranteed benefits, catalog, tenure bands | Selector is meaningless without these |
| **5 — Benefits (employee selector)** | Port the HTML selector to React; autosave + submit; **server-side rule enforcement** | The money module |
| **6 — HR Documents** | Company + personal docs; Vercel Blob upload/download | |
| **7 — Dashboard + polish** | Onboarding progress, benefits status, quick links, announcements; responsive/print pass | |
| **8 — Learning Track** | Phase-2 product | |
| **9 — Handoff** | Docs current; deploy | |

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

### Resolved earlier / Open
- **A · Design language** — *default (unconfirmed):* benefits paper/pine palette product-wide. Alternative: reference navy/gold. **Still to confirm.**
- **E · Real benefit figures** — ceilings now confirmed; per-benefit monetary limits + medical-insurance handling still pending.
- **F · Learning Track timing** — *resolved:* stays Phase 2 (placeholder present in v1).

---

*Last Updated: 2026-07-27 (Phase 0).*
