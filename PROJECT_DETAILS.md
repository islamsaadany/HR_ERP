# HR_ERP — Project Details (Technical Reference)

> Settled technical facts about the product. Read after `CLAUDE.md`.
> For phases and open decisions, see `IMPLEMENTATION_PLAN.md`; for live status, `IMPLEMENTATION_PROGRESS.md`.

---

## 1. Product summary
An internal, English-language HR platform for **Forefront Consulting**. Email + password sign-in (Google parked), two roles (Employee, HR/Admin), and five v1 modules built on a shared employee registry.

## 2. Stack
| Layer | Choice |
|-------|--------|
| Framework | Next.js 15.5 (App Router) + React 19 · Tailwind v4 |
| Language | TypeScript |
| DB | PostgreSQL (Neon) + Prisma |
| Auth | NextAuth v5, email + password (Credentials); Google parked (env-gated) |
| Styling | Tailwind v4, **navy/gold** tokens on subtly warm neutrals; **Fraunces** (display) + **Hanken Grotesk** (body) self-hosted via `next/font`; soft card elevation + staggered reveals; gold keyboard focus rings |
| Files | Vercel Blob |
| Deploy | Vercel |
| Email | none (v1) |

### Why Next.js/Prisma/Postgres over the Firebase reference
The v1 modules that could be reused from the Firebase reference (directory, HR docs, dashboard, onboarding) are simple CRUD that port easily, while the module that was deeply Firebase-coupled (Learning Track) is deferred. The hardest v1 module — Benefits — involves money, admin-configured rules, and role checks, which are cleanest enforced server-side against a relational schema. Choosing the house stack also keeps HR_ERP consistent with Forefront's other products (Frost, Endurance) so future sessions bootstrap from the same conventions.

## 3. Modules → features → data (v1)

### Foundation (cross-cutting) — spec `001`
- Email + password sign-in (Google parked), app shell + left nav, My Profile, and **My Documents** (personal uploads).
- **Auth:** sign-in is email/password (NextAuth Credentials); any registered employee may sign in (domain lock lifted, HR warned on non-company emails). A bootstrap admin bridge (`BOOTSTRAP_ADMIN_*`) is retained as a fallback. Forced temp-password change on first login (see §3 Authentication).
- **Bulk employee import:** Admin → Employees → **Import CSV** uploads the HR spreadsheet (upsert by email; tolerant date parsing with day-first for ambiguous dates; tenure band derived from hire date; per-row review report). Replaces a hand-written PII SQL seed.
- **Export → edit → re-import round-trip:** Admin → Employees → **Export CSV** (`/api/admin/employees/export`) downloads all employees pre-filled in the exact import format (Name, Email, Department, Title, Contract Type, Date of Hiring, Phone, DOB, Marital Status, Manager Email, Number of Kids, Kid N DOB). HR fixes blanks/mistakes and re-uploads to update everyone by email. Round-trip verified (parses back with no errors). Role, status, and salary are intentionally NOT in the CSV (set in-app; import never overwrites them).
- Roles: `EMPLOYEE`, `HR_ADMIN`, `SUPER_USER` (superset). Manager is a capability derived from the org chart. Bootstrap via `ADMIN_EMAILS`; Super User promotes in-app.
- Registry fields (public: name, email, department, title, phone) + HR-private (employment type, tenure band, start/end date, status Active/Left, DOB, marital status, dependants {name, dob}, reportsTo). **Monthly salary is confidential — Super-User-only** (HR Admin cannot see or edit it): the employee grid column, the create/edit form field, and inline edits are all gated to Super User (`canSeeSalary` in `lib/roles.ts`), and the salary is never sent to the client for HR Admin. The salary-driven **incentive** module is already Super-User-only, and CSV export/import exclude salary. Age / years-of-service / dependant ages are **derived, not stored**. Employees self-edit contact only. Monthly salary drives the Loans benefit ceiling (each employee sees their own).
- **My Documents:** each employee uploads/views their own files (ID, certificate, contract, HR letters); visible to owner + HR/Super User only. (Company-wide files live in Handbook & Resources, not here.)
- **Benefits orientation tour (spec `017`, migration `024`):** a personalized, first-run, skippable, re-openable **stepped-cards** walkthrough (`BenefitsOrientation`) on the employee Benefits page. Four steps in the employee's own numbers: **(1)** type · band · pool ceiling · **(2)** their guaranteed benefits with band amounts (Loans salary-driven) · **(3)** how the flexible basket works (categories, up to 5 FT / 3 PT, enter cost → company covers a % that draws from the pool, you pay the rest) · **(4)** the rules (coverage 100/80/50; no single benefit's company share over half the pool, **medical exempt**; claims = request or proof of full spend → reimbursed the covered portion) with a link to `/benefits/policy`. It **auto-opens** only when the selector is available and the employee **hasn't submitted and hasn't seen it**; the **"How it works"** button re-opens it any time. A per-user `benefitsOrientationSeenAt` flag (set once via `markOrientationSeen`) stops the auto-open. Read-only explainer over existing page data — **no selector or money-rule change**; graceful when figures are missing.
- **Admin Benefits redesign (spec `016`):** `/admin/benefits` is now **three tabs** — **Submissions & Claims** (default, most-used) · **Benefits Catalogue** · **Amounts** (the old *Configuration* and *Claim requirements* tabs are dissolved into these). **Benefits Catalogue** is one table (Name · Category · Order · Claim requirement · Coverage %) with hide/show + add; it absorbs the per-catalog-item claim-requirement editing and the coverage-% control (spec 012). **Amounts** groups pool ceilings, guaranteed amounts, guaranteed claim-requirements, and the medical rate card. Every config table is **view-first** — read-only with an **Edit** toggle (shared `EditableSection`); tables toggle independently. **Manual claim/release entry:** HR/Super User can **back-fill a claim that already happened** (`recordManualRelease`, `ManualReleaseForm` in Submissions & Claims) — pick employee + benefit, enter the **covered amount** and the **approval date**; it's stored as a **RELEASED** `BenefitClaim` (decided date = the entered date, reviewer = the actor), **not** queued, counting against the benefit's allocation. Server-guarded: future dates rejected, a real allocation required (guaranteed band-derived / salary-driven, or a submitted basket line), amount ≤ what's left to claim. No schema change; no employee-facing or money-rule change. *(Future: an everyone × benefits filterable master view.)*
- **Admin back navigation (spec `015`):** every admin page (except the Admin home) shows a shared
  `BackLink` (`components/admin/BackLink.tsx`) at the top that steps **up one structural level** to an
  explicit parent path — a section page → Admin home, a nested create/edit/import/release page → its
  section list — **not** browser history, so the destination is the same however the user arrived. It
  reuses the existing muted "←" style and replaces the earlier scattered ad-hoc back links (Modules,
  CSV Import, Release a benefit, Knowledge new/edit, Departments) with one component.
- **Managed departments (spec `014`, migration `022`):** the department is still a **text label** on `User`, but the **list of valid departments** is a managed lookup (`Department` model) HR maintains at **Admin → Departments** (HR Admin + Super User). Add, **rename** (cascades to every employee currently in it, one transaction), or **remove** (blocked while anyone is assigned). Names are trimmed; duplicates are rejected case-insensitively. Every department **choice/filter** reads the managed list via `getDepartments()` (`lib/departments.ts`) — the employee create/edit form, the grid filter, the directory filter, and the CSV-import "unknown department" flag (import stays tolerant); **display-only** surfaces (directory cells, benefits-release column) read the stored label, which the rename cascade keeps correct. Seeded with the original five. Not a foreign key (department heads/budgets remain a future upgrade).

### Onboarding — spec `002`
- Timeline stages (Day 1 / Week 1 / First month / 30-60-90); each activity typed **Policy** (acknowledge) or **Action** (complete); **common core + role tracks** (Consulting first), assigned from the registry. Progress % persisted; completion is self-attested. Links into Registry, My Documents, Benefits, Directory, Handbook & Resources, Time-Off.
- Admin: author stages/activities, types, links, track membership; view completion overview.

### Benefits (the money module)
- Employee: employment type + tenure come from their profile (not self-selected); view fixed/guaranteed benefits (**one line each**); build the flexible basket (server-enforced rules), save (autosave) and submit for the plan year. The live summary stays visible while scrolling — **sticky panel on desktop, pinned floating bar on mobile**.
- Admin: `/admin/benefits` is a **3-tab layout** — **Configuration · Submissions & claims · Claim requirements** — with **plan-year management in a top-right popup** (`PlanYearDialog`: list + open/close + create). The **Configuration** tab is fully HR-editable and server-authoritative: **pool ceilings** (type × band), **guaranteed amounts** (per band, FT/PT; Loans salary-driven), **basket catalog** (edit name/category/order, **hide-not-delete**, add item), and the **flat medical rate card** (self · spouse · child<18 · child18+, from the insurer's figures). Actions in `config-actions.ts`; edits apply to unsubmitted baskets. Submissions still **export to CSV for Finance** (`/api/admin/benefits/export`).
- **Benefits guide** (`/benefits/policy`): an employee-facing **"How the benefits basket works"** guide — the rules in plain words, what's received automatically (**names only**), how to build a basket, and how to **claim / get reimbursed** — with **Print / Save-as-PDF**. It shows **no confidential figures**: pool-ceiling amounts (across all bands), guaranteed amounts, and the medical rate card are compensation config and live **only on the admin Benefits page**. Employees still see their **own** pool and price their **own** medical cover on the Benefits page itself. (Earlier this page dumped the full live-config matrix to every employee — corrected 2026-08-04.)
- **Server-authoritative rules:** pool ceiling, 50% single-benefit cap, selection-count limit (FT practical 2–4 / PT max 2), medical handling. See §5 for the confirmed figures.
- **Selection UX guards (spec `007` FR-035/036):** the selector **prevents over-selection** — at the max (4 FT / 2 PT) every unselected benefit dims and is unclickable until one is deselected (no "you chose 5" error). On reopen, any basket benefit with an **active claim** (`PENDING`/`RELEASED`) is **locked** — dimmed, not deselectable, and its amount can't drop below the total already claimed (can still be raised). Both mirrored on the client and **enforced in `saveBasket`** (claimed sum per catalog item vs. incoming lines).
- **Self-service reopen (spec `007` FR-038):** a submitted basket is no longer HR-gated — the employee reopens their **own** basket back to `DRAFT` from the submitted view (**"Update my basket"** → `reopenOwnSelection`) to allocate the rest of their pool and re-submit, **no HR needed**. Guarded to their own selection, only while the **plan-year window is open**, only when currently `SUBMITTED`. Already-claimed benefits stay locked by the FR-036 rules on the re-save, so nothing already reimbursed can be dropped. (HR's admin Reopen still exists for the window-closed / override case.)
- **Claims & reimbursement** (migration `018`): each benefit has an HR-set **claim policy** — `NONE` (auto), `NOTE` (optional note), `PROOF` (mandatory proof upload). After submitting, the employee files claims (`BenefitClaim`) on the "Your benefits & claims" section: **multiple partial claims** up to the allocation, proof to Vercel Blob for PROOF items. Each claim is `PENDING` → HR **Release** (reimbursed) or **Reject** (reason). Per-benefit tracker (allocated / reimbursed / pending / left). The claims tab renders as a **table** (# · benefit · allocated · reimbursed · pending · left · status pill), one row per benefit, each expanding to its claim history + file-a-claim form; the two-tab bar stays **pinned beneath the sticky header** while scrolling. **Default policy (migration `019`):** Medical = Automatic; guaranteed = Request (note only, full amount) except Professional development = Proof; basket = Proof. **Loans** ceiling = the employee's monthly salary. Admin → Benefits gains a **Claims to review** queue, a **Claim requirements** editor, and **Reset** (blocked if claims exist) alongside Reopen. The submit banner (F1), floating meter (F2), sticky header (F3), and aligned guaranteed cards (F4) round out the page.

- **Bulk-release a guaranteed benefit (spec `013`, migration `020`):** Admin → Benefits → **"Release a benefit"** (`/admin/benefits/release`, `ReleaseManager`). HR picks one **fixed-allowance** benefit (salary-based **Loans excluded**) and sees every **active, applicable** employee (by employment type) with their **band-derived amount**; employees with no tenure band are **flagged, not dropped**. Release is **per person** — mark individuals or a **Select-all/none** bulk selection as **Released** (`setReleased`, stores a `BenefitRelease` row per employee × benefit × plan year, snapshotting the amount + date + actor); the **Status** column shows each person's state. A **self-serve report** downloads as **CSV** with a default preset (`# · Employee · Tenure · Allowance value · Status`) plus a **column picker** over non-confidential fields (email, department, title, type, start date, phone, manager) — **salary is never offered**. Read-only over the registry; no money moves.

### Team Directory — spec `003`
- Employee: browse **active** employees in a **read-only list/table** (name, title, department, email, phone) — the sole view (the card view + card/list toggle were retired 2026-08-03); **name search + department filter**; **click the Title or Department header to sort A→Z / Z→A** (blanks last); person view with public fields + contact actions. View-only. **No org chart in V1.**
- **Data:** read model over `User` (public projection).
- **Admin editable registry grid** (spec `001` FR-020): `/admin/employees` is an inline-editable power-grid — cells typed to the field (text/email, date pickers, enum + reporting-line dropdowns), column show/hide + drag-reorder (client preference), and filters (search + department/type/status/role). Per-field saves via `updateEmployeeField`, enforcing the same governance as the full form (Super-User-only role, email uniqueness, self/cycle guards, no self role/status change). Editing stays HR-only; the employee `/directory` is unchanged.

### Handbook & Resources
- The **operating** handbook content (7 sections from the Onboarding Kit: strategic foundation, structure & roles, brand, meetings, tools, documentation, people governance) **plus a Resources area** for downloadable company files (company profile, templates, policies). Presented as a Vercel-style master–detail (left list, right reader).
- Employee: browse/read sections; download resources. Admin: author sections + upload resources.
- The consulting-craft sections moved to the **Knowledge Base** (below) per spec 008.

### Knowledge Base (spec 008)
- Admin-authored **"reads"** for the consulting craft (Strategy Consulting, AI-Strategy Consulting, Assignment Phases, and new topics like Change Management & Influence). Free-text `category`; small standalone articles ("bites").
- **Authoring workflow:** the admin (`/admin/knowledge`) shows a **copyable Claude prompt**; the author runs it in Claude with a topic + source, pastes the Markdown result, the app parses front-matter (`title/category/summary/reading_minutes`) into fields, and it renders on save. Faster/consistent vs a rich-text editor.
- **Rendering:** Markdown body → GFM **tables**, `[!KEY]/[!TIP]/[!NOTE]/[!WARNING]` **callout boxes**, and **mermaid** diagrams (navy/gold). Employee `/knowledge` is a searchable master–detail like the Handbook.
- **Deck attachment (spec 008 FR-009):** a topic can carry one **PDF deck**. Admin uploads/replaces/removes it in the article editor; stored in Vercel Blob under `knowledge/<slug>/…`, validated server-side (PDF only, ≤25MB). The reader shows the blurb, then embeds the deck (`<object>`) below it with a Download link. Old blobs are cleaned up on replace/remove/delete. Migration `012_knowledge_attachments.sql`.
- **Data:** `KnowledgeArticle { slug, title, category, summary?, body(markdown), readingMinutes?, attachmentUrl?, attachmentName?, attachmentType?, attachmentSize?, published, order, authorId? }`. Deps: `react-markdown`, `remark-gfm`, `mermaid`, `@vercel/blob`.

### Time-Off / Leave Management
- Employee: request time off. **Direct manager** (from the org chart) approves/declines (single generic type, full days, no balances in v1).
- **In-app decision cue** (FR-014): a gold badge on the Time-Off nav item counts the employee's approved/declined-but-unseen requests; it clears once they open the Time-Off page (`decisionSeenAt`, migration `016`). No email.
- **Overlap warning** (FR-011): the manager queue and the HR view flag when a request's dates clash with another teammate's approved/pending leave.
- **HR central view** (FR-013): `/admin/time-off` lists **all** requests (filter by status) and lets HR/Super User approve or decline a pending one as a fallback when the manager is unavailable.
- Decisions are applied via dedicated `approveLeaveRequest`/`declineLeaveRequest` form actions (the decision rides the button's `formAction`, not a submit-button value — which React/Next doesn't reliably include).
- **Data:** `LeaveRequest { userId, startDate, endDate, note, status, approverId, decisionComment, decidedAt, decisionSeenAt }`.

### Dashboard
- Employee home: **module-aware** tiles + quick links (a switched-off module contributes neither).
  **Time-Off + Team Directory** are the always-on primary cards; the Benefits tile hides once submitted;
  Onboarding hides on completion. Plus announcements.
- Admin: post announcements.
- **Data:** `Announcement { id, title, body, authorId, publishedAt }`

### Branding / white-label (spec 011) — super user
- `BrandSettings` singleton (migration `017`): company name, short name, logo, **primary + accent** colors.
  Admin → **Brand** (super-user): edit name, upload a logo (Blob), pick two colors, or reset to Forefront.
- The two base colors are expanded to full tint/shade scales (`src/lib/brand.ts`) and injected as a
  `:root` override of the Tailwind theme variables — **re-themes the whole UI, no per-component edits**.
  Colors equal to the Forefront defaults inject nothing (identical look preserved).
- Name/logo flow into the sidebar, mobile header, sign-in, `<title>`, and the PWA manifest (name +
  `theme_color`). Root layout + manifest are `force-dynamic` so brand changes apply immediately.
- **Scope:** branding only; data stays single-tenant per deployment (one DB per company). Full
  multi-tenant data isolation (an `orgId` on every model) is a separate future spec.

### PWA (spec 010)
- Installable "Add to Home Screen": web manifest (`app/manifest.ts`), navy/gold "F" icons
  (`public/icons/*`), a minimal registration-only service worker (`public/sw.js`, no auth-content
  caching), and head meta (theme-color, apple-touch-icon, mobile-web-app-capable). No push (v1).

### Incentive Scheme (spec 009) — super-user only, hidden
- A **partner-compensation** engine implementing "Team Benefits System v1.5" (Business Partner Fee, Commission, Profit Share proposed, 70% margin gate, `eligible_to_lead` utilisation gate, contributor tiers/floor/cap, firm P&L, cost recovery, watch list). **Distinct from the employee Benefits module.**
- **Server-authoritative & pure:** all rules live in `src/lib/incentive/rules.ts` (final constants, **banker's rounding**). `import.ts` parses the CSV sheets; `compute.ts` turns a stored cycle into the report model with **flag-and-block** validation (contributions must total ~100%).
- **Per-cycle inputs uploaded as CSV** (people / assignments / contributions) + a firm-P&L form; downloadable templates. `bd == lead_source` ⇒ 5% commission else 3%. Per-hour metrics (Appendix B) are out until an hours column is added.
- **Access:** `/incentive` + template route are `requireSuperUser`; nav entry shows for super users only. Migration `013_incentive_scheme.sql`.
- **Proof:** `scripts/verify-incentive.ts` (Appendix A, 27/27) and `scripts/verify-incentive-cycle.ts` (sample sheets, 16/16).

### Authentication — email + password (Google parked)
- Sign-in is **email + password** (NextAuth Credentials), matching the employee by email. `User.passwordHash` (scrypt via Node crypto, no dependency; migration `014`). **Google sign-in is disabled for now** — the button is removed from the sign-in page; the provider is still env-gated (`AUTH_GOOGLE_ID`/`_SECRET`) so it can return later. Bootstrap admin bridge retained as a fallback.
- **Any registered email may sign in** — the company-domain restriction was **lifted** from password login (decision 2026-08-07). HR sees a **non-blocking warning** when creating an employee whose email isn't on `ALLOWED_EMAIL_DOMAIN`. (The dormant Google `signIn` callback still domain-checks, but Google is off.)
- **Forced temp-password change (migration `021`, `mustChangePassword`):** any admin-issued password — a single set/reset **or** the bulk generator — is temporary. On next sign-in the employee is gated to **`/set-password`** (a standalone page outside the `(app)` shell, so no redirect loop) and cannot reach the app until they choose their own. The flag clears when they set a compliant password (there or on Profile).
- **Password policy** (`validatePasswordPolicy`, server-enforced on `/set-password` and Profile; mirrored in the UI): **≥ 8 chars, an uppercase letter, a number, and a special character**. Temporary passwords are exempt (they force a compliant change).
- **HR bulk temp passwords:** Admin → Employees → **Temporary sign-in passwords** panel (`TempPasswordsPanel`) → `generateTeamPasswords`. "Generate for employees without a password" (missing) or, for Super Users, "Reset ALL passwords" (all, excludes the actor). Plaintext is returned **once** as a **one-time CSV** (name · email · password) — stored only as scrypt hashes, never re-shown. **No emails in v1**, so a forgotten password is reset the same way (no self-service recovery).

### Module release switch (super user)
- `ModuleFlag { key, enabled }` (migration `015`) + Admin → **Modules**. A module switched off is hidden from everyone's nav (`AppShell.hiddenNav`) and its pages redirect home (`requireModuleEnabled`). Lets a super user build in the background and release when ready.

## 4. Phase-2 (designed-for, not built in v1)
- **Learning Track** — courses → lessons → quizzes → certificate.
- **Case Studies** — shared knowledge library.
- **Benefits claims/reimbursement** — invoice/receipt submission against selected benefits.

## 5. Benefits domain model (real policy from the Onboarding Kit; interaction ported from the HTML simulator)
- **Employment type:** Full-time / Part-time.
- **Tenure bands (confirmed):** 6mo–2y · 2–4y · 4–7y · 7–10y.
- **Pool ceiling (confirmed, EGP):** FT 20,000 / 30,000 / 45,000 / 65,000 · PT 14,000 / 21,000 / 30,000 / 42,000. (Note: real PT is ~65–70% of FT, not the policy's "50%" wording.)
- **Fixed / guaranteed benefits:** Marriage allowance · Loans (after 1yr, 1-month salary) · Summer allowance · Professional development · Special events. Shown first, separate from the basket.
- **Flexible basket:** catalog grouped into 5 display categories (ported from `benefitsselector_3.html`) — **Health & protection** (Personal medical insurance, Annual health check-up) · **Wellbeing** (Gym, Coaching / therapy, Sports) · **Life & family** (Schooling / education, Childcare / nursery, Caregiver support) · **Personal growth** (Personal learning) · **Lifestyle & flexibility** (Mobile device, Home-office setup). Personal medical insurance covers the employee only; spouse/children are separate priced options in the medical modal. FT: no single benefit's **company share** > 50% of the pool (⇒ practically ≥2 picks), **max 5** picks. PT: **max 3** picks, exempt from the 50% cap. Costs in steps of 1,000. Catalog rows carry a `category` field.
- **Company coverage rates (spec `012`, migration `023`):** each flexible benefit carries a **`coverageRate`** (percent). The employee enters the benefit's **full cost**; the **covered (company) share = cost × rate/100** is the only part that draws from the pool, and the employee pays the remainder (out-of-pocket). **All money rules run on the covered amount** — pool total, over-pool, and the FT 50% single-benefit cap. Seeded rates: **100%** — Personal medical, Annual check-up, Coaching · **80%** — Gym, Sports, Schooling, Childcare, Caregiver, Personal learning · **50%** — Mobile, Home-office. Medical stays a single **100%-covered** rate-card item (cost = covered = premium), cap-exempt. `SelectionLine` stores both `cost` (entered) and `amount` (= covered pool draw); pre-012 rows backfilled `cost = amount`. The math lives in `src/lib/benefits/coverage.ts` (shared by the server rules and the client selector). The selector shows **cost · company share · your share** per benefit and the meter tracks the **company share**; claims reimburse the **covered portion** against proof of full spend. HR edits the rate per benefit in the admin Benefits **Configuration** catalog editor. Server-authoritative (`src/lib/benefits/rules.ts` + `saveBasket`).
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
