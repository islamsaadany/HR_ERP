# HR_ERP — Project Details (Technical Reference)

> Settled technical facts about the product. Read after `CLAUDE.md`.
> For phases and open decisions, see `IMPLEMENTATION_PLAN.md`; for live status, `IMPLEMENTATION_PROGRESS.md`.

---

## 1. Product summary
An internal, English-language HR platform for **Forefront Consulting**. Google SSO (company-domain-locked), two roles (Employee, HR/Admin), and five v1 modules built on a shared employee registry.

## 2. Stack
| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript |
| DB | PostgreSQL (Neon) + Prisma |
| Auth | NextAuth v5, Google provider, domain-locked |
| Styling | Tailwind CSS + ported design tokens (paper/pine, Fraunces + Hanken Grotesk) |
| Files | Vercel Blob |
| Deploy | Vercel |
| Email | none (v1) |

### Why Next.js/Prisma/Postgres over the Firebase reference
The v1 modules that could be reused from the Firebase reference (directory, HR docs, dashboard, onboarding) are simple CRUD that port easily, while the module that was deeply Firebase-coupled (Learning Track) is deferred. The hardest v1 module — Benefits — involves money, admin-configured rules, and role checks, which are cleanest enforced server-side against a relational schema. Choosing the house stack also keeps HR_ERP consistent with Forefront's other products (Frost, Endurance) so future sessions bootstrap from the same conventions.

## 3. Modules → features → data (v1)

### Foundation (cross-cutting)
- Google SSO (domain-locked), app shell + left nav, personal profile view.
- Roles: `EMPLOYEE`, `ADMIN`. Admin bootstrap via `ADMIN_EMAILS`.
- **Data:** `User { id, googleId, email, name, photoUrl, role, employmentType, tenureBand, reportsToId, title, department, startDate }`

### Onboarding
- Employee: work through phases → steps → checklist; progress % persisted.
- Admin: author phases/steps, link to HR docs/resources.
- **Data:** `OnboardingPhase`, `OnboardingStep`, `StepCompletion { userId, stepId, completedAt }`

### Benefits (the money module)
- Employee: employment type + tenure come from their profile (not self-selected); view guaranteed benefits; build a flexible basket (50% single-benefit cap, max 4, rate-card medical modal); save (autosave) and submit for the plan year.
- Admin: configure plan-year window, pool ceilings (type × tenure), guaranteed benefits, benefit catalog, medical rate card, tenure bands; view all submissions.
- **Server-authoritative rules:** pool ceiling, 50% cap, max-4, medical exemption (may exceed 50% but never the pool ceiling).
- **Data:** `PlanYear`, `BenefitCatalogItem`, `PoolCeiling { employmentType, tenureBand, amount }`, `GuaranteedBenefit`, `MedicalRateCard`, `BenefitSelection { userId, planYearId, status }`, `SelectionLine { selectionId, itemId, amount, config }`

### Team Directory
- Employee: browse members, profile cards, org chart via `reportsToId`.
- Admin: edit titles/roles/reporting lines.
- **Data:** reuses `User`.

### HR Documents
- Employee: view company-wide docs; view own personal docs.
- Admin: upload company docs; upload personal docs per employee.
- **Data:** `HrDocument { id, scope: COMPANY|PERSONAL, userId?, title, blobUrl, uploadedById, createdAt }`

### Dashboard
- Employee home: onboarding progress, benefits status, quick links, announcements.
- Admin: post announcements.
- **Data:** `Announcement { id, title, body, authorId, publishedAt }`

## 4. Phase-2 (designed-for, not built in v1)
- **Learning Track** — courses → lessons → quizzes → certificate.
- **Case Studies** — shared knowledge library.
- **Benefits claims/reimbursement** — invoice/receipt submission against selected benefits.

## 5. Benefits domain model (from the reference simulator)
Faithfully ported behavior; figures are placeholders until the real card arrives.
- **Employment type:** Full-time / Part-time.
- **Tenure bands (placeholder):** 6mo–2y, 2–4y, 4–7y, 7–10y.
- **Pool ceiling:** set per (type × tenure); the maximum claimable for the year.
- **Guaranteed benefits:** shown first, separate from the basket, vary by type × tenure (e.g. marriage allowance, summer allowance, professional development, special events, loans).
- **Flexible basket:** max 4 benefits; no single benefit > 50% of the pool; amounts in steps of 1,000.
- **Medical insurance:** rate-card driven (personal/family tiers, dependants); **exempt from the 50% cap** but capped at the pool ceiling.
- **Catalog categories (placeholder):** Health & protection · Wellbeing · Life & family · Personal growth · Lifestyle & flexibility.

## 6. Security & integrity notes
- Domain lock enforced in NextAuth `signIn` callback.
- All admin routes and benefits mutations re-check role and rules server-side.
- Benefits submission validates the entire basket against the server's rule engine; client math is UX-only.
- No secrets in the repo; env vars per `CLAUDE.md`.

---

*Last Updated: 2026-07-27 (Phase 0). Schema names are indicative sketches pending detailed specs in `product-specs/`.*
