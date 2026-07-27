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

### Open (defaults assumed; confirm to finalize before writing detailed specs)
- **A · Design language** — *default:* the benefits selector palette (paper/pine, Fraunces + Hanken Grotesk) product-wide. Alternative: the reference tool's navy/gold.
- **B · Employment type & tenure source** — *default:* admin-set on the employee profile (authoritative), since it sets real benefit money. Alternative: self-selected.
- **C · Tenure band derivation** — *default:* admin-set enum now; derive-from-`startDate` later. Alternative: derive immediately from start date.
- **D · Admin grant mechanism** — *default:* `ADMIN_EMAILS` allowlist to bootstrap, then in-app promotion by an existing admin. Alternative: manual DB/SQL only.
- **E · Real benefit figures** — *resolved:* user will share later; build admin config + placeholder seed meanwhile.
- **F · Learning Track timing** — *resolved:* stays Phase 2.

---

*Last Updated: 2026-07-27 (Phase 0).*
