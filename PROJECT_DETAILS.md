# HR_ERP — Project Details (Technical Reference)

> Settled technical facts about the product. Read after `CLAUDE.md`.
> For phases and open decisions, see `IMPLEMENTATION_PLAN.md`; for live status, `IMPLEMENTATION_PROGRESS.md`.

---

## 1. Product summary
An internal, English-language HR platform for **Forefront Consulting**. Google SSO (company-domain-locked), two roles (Employee, HR/Admin), and five v1 modules built on a shared employee registry.

## 2. Stack
| Layer | Choice |
|-------|--------|
| Framework | Next.js 15.5 (App Router) + React 19 · Tailwind v4 |
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

### Foundation (cross-cutting) — spec `001`
- Google SSO (domain-locked), app shell + left nav, My Profile, and **My Documents** (personal uploads).
- **Auth bridge (temporary):** while Google OAuth is being set up, sign-in is username/password (NextAuth Credentials) against a single bootstrap admin (`BOOTSTRAP_ADMIN_*`, defaults `Islam`/`1234`), upserted as an active Super User on first login. Google is shown only when `AUTH_GOOGLE_ID`/`_SECRET` are configured.
- **Bulk employee import:** Admin → Employees → **Import CSV** uploads the HR spreadsheet (upsert by email; tolerant date parsing with day-first for ambiguous dates; tenure band derived from hire date; per-row review report). Replaces a hand-written PII SQL seed.
- Roles: `EMPLOYEE`, `HR_ADMIN`, `SUPER_USER` (superset). Manager is a capability derived from the org chart. Bootstrap via `ADMIN_EMAILS`; Super User promotes in-app.
- Registry fields (public: name, email, department, title, phone) + HR-private (employment type, tenure band, start/end date, status Active/Left, DOB, marital status, dependants {name, dob}, reportsTo). Age / years-of-service / dependant ages are **derived, not stored**. Employees self-edit contact only.
- **My Documents:** each employee uploads/views their own files (ID, certificate, contract, HR letters); visible to owner + HR/Super User only. (Company-wide files live in Handbook & Resources, not here.)

### Onboarding — spec `002`
- Timeline stages (Day 1 / Week 1 / First month / 30-60-90); each activity typed **Policy** (acknowledge) or **Action** (complete); **common core + role tracks** (Consulting first), assigned from the registry. Progress % persisted; completion is self-attested. Links into Registry, My Documents, Benefits, Directory, Handbook & Resources, Time-Off.
- Admin: author stages/activities, types, links, track membership; view completion overview.

### Benefits (the money module)
- Employee: employment type + tenure come from their profile (not self-selected); view fixed/guaranteed benefits; build the flexible basket (server-enforced rules), save (autosave) and submit for the plan year.
- Admin: configure plan-year window, pool ceilings (type × tenure), fixed benefits, basket catalog, medical handling; view submissions.
- **Server-authoritative rules:** pool ceiling, 50% single-benefit cap, selection-count limit (FT practical 2–4 / PT max 2), medical handling. See §5 for the confirmed figures.

### Team Directory — spec `003`
- Employee: browse **active** employees (cards: photo, name, title, department, email, phone); **name search + department filter**; person view with public fields + contact actions. View-only. **No org chart in V1.**
- **Data:** read model over `User` (public projection).

### Handbook & Resources
- The structured handbook content (sections from the 118-page Onboarding Kit: strategic foundation, structure & roles, brand, meetings, tools, documentation, people governance, consulting, AI consulting, assignment phases) **plus a Resources area** for downloadable company files (company profile, templates, policies).
- Employee: browse/read sections; download resources. Admin: author sections + upload resources.

### Time-Off / Leave Management
- Employee: request time off. **Direct manager** (from the org chart) approves/declines. Balance tracking.
- **Data (sketch):** `LeaveRequest { userId, type, startDate, endDate, status, approverId }`.

### Dashboard
- Employee home: onboarding progress, benefits status, quick links, announcements.
- Admin: post announcements.
- **Data:** `Announcement { id, title, body, authorId, publishedAt }`

## 4. Phase-2 (designed-for, not built in v1)
- **Learning Track** — courses → lessons → quizzes → certificate.
- **Case Studies** — shared knowledge library.
- **Benefits claims/reimbursement** — invoice/receipt submission against selected benefits.

## 5. Benefits domain model (real policy from the Onboarding Kit; interaction ported from the HTML simulator)
- **Employment type:** Full-time / Part-time.
- **Tenure bands (confirmed):** 6mo–2y · 2–4y · 4–7y · 7–10y.
- **Pool ceiling (confirmed, EGP):** FT 20,000 / 30,000 / 45,000 / 65,000 · PT 14,000 / 21,000 / 30,000 / 42,000. (Note: real PT is ~65–70% of FT, not the policy's "50%" wording.)
- **Fixed / guaranteed benefits:** Marriage allowance · Loans (after 1yr, 1-month salary) · Summer allowance · Professional development · Special events. Shown first, separate from the basket.
- **Flexible basket:** 4 categories — **Gym · Mobile device · Personal medical insurance · Schooling**. FT: no single benefit > 50% of the pool (⇒ practically 2–4 picks). PT: **max 2** picks within the (smaller) budget. Amounts in steps of 1,000. No separate per-category caps or extra eligibility.
- **Guaranteed amounts (confirmed, EGP by band):** FT — Marriage 18/24/30/36k · Summer 2.5/3.5/5/6k · Prof-Dev 5/9.5/18/21.5k · Special events 6/8.5/12/18k · Loans = 1-month salary from yr 1. PT — Marriage 9/12/15/18k · Prof-Dev 5/7/9/11k · Special events 6/8.5/12/18k (no summer/loans).
- **Medical insurance (confirmed):** single tier — self 8,000 (always included), spouse 8,000, child <18 4,500, child ≥18 8,000; **exempt from the 50% cap**, capped at the pool ceiling; dependants entered manually for now.
- **Claims/reimbursement:** Phase 2 (v1 ends at a submitted, locked selection).

## 6. Security & integrity notes
- Domain lock enforced in NextAuth `signIn` callback.
- All admin routes and benefits mutations re-check role and rules server-side.
- Benefits submission validates the entire basket against the server's rule engine; client math is UX-only.
- No secrets in the repo; env vars per `CLAUDE.md`.

---

*Last Updated: 2026-07-27 (Phase 0). Schema names are indicative sketches pending detailed specs in `product-specs/`.*
