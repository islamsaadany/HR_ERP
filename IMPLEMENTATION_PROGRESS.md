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
| 5 — Time-Off / Leave | 🟢 Complete (V1) |
| 6 — Benefits (admin config) | 🟢 Complete |
| 7 — Benefits (employee selector) | 🟢 Complete → 🔵 **redesigned to claim-based allowance (spec 018)** |
| 8 — Dashboard + polish | 🟢 Complete |
| 9 — Learning Track placeholder + Handoff | ⬜ Not started |

## Spec 019 — Mid-year starter proration (built, pending Neon migration)
- [x] Spec + `/speckit-plan` + `/speckit-tasks` + `/speckit-implement` (`specs/019-mid-year-proration/`).
- [x] Schema: `PlanYear.startDate`/`endDate` + `GuaranteedBenefit.prorated`; migration `prisma/sql/027_plan_year_window.sql` (**applied cleanly on a throwaway local Postgres, 000→027; profdev flag + entry-tier ceilings verified**).
- [x] Core: pure `src/lib/benefits/proration.ts` (`classifyEligibility`/`prorate`/`remainingWholeMonths`); `config.ts` `planYearWindow` + `poolCeilingFor` (entry-tier fallback); `derive.ts` `addMonths`.
- [x] Server (authoritative): `createClaim` prorates the pool ceiling (6mo) + Professional-development allocation; `commitMedical` 3-month gate + prorated premium + entry-tier fallback; `createPlanYear`/`editPlanYearWindow` accept dates. **Compiled module validated against the quickstart figures via tsx (5000/1333/2375, FULL/NOT_YET, fallbacks).**
- [x] UI (mockup-approved): `PlanYearDialog` date inputs + edit-dates; admin window display + “proration off” warning; employee “Prorated · N of 12 mo” pool + prof-dev indicators; **medical-only view** for sub-6-month employees with prorated premium preview. Snapshots in `ui-versions/`.
- [x] `npx tsc --noEmit` green (build's `apply-sql` step needs the live DB, not runnable from a session). Docs updated (this file, PROJECT_DETAILS, IMPLEMENTATION_PLAN decision log).
- [ ] **Apply `027_*.sql` to Neon** (paste after `026`), then **set each open plan year's start/end dates** in the Plan-year dialog to switch proration on. Medical premium figures stay placeholders until the operator's prorated rates are confirmed.

## Spec 018 — Benefits claim-based living allowance (built, pending review + Neon migration)
- [x] Spec + `/speckit-clarify` + `/speckit-plan` + `/speckit-tasks` (`specs/018-benefits-claim-allowance/`).
- [x] Schema: dropped `BenefitSelection` + `SelectionLine`; added `MedicalCommitment`; migration `prisma/sql/025_claim_based_allowance.sql` (**validated on a throwaway local Postgres**).
- [x] Rules: `evaluateClaim` (50%-per-benefit for FT+PT + pool ceiling); cost = exact receipt value (no rounding); `COUNT_LIMIT_ENABLED=false`; `evaluateBasket`/`STEP`/`coerceAmount` removed.
- [x] Server: `commitMedical`, claim-as-you-go `createClaim` (no basket requirement, computes covered), admin `editMedicalCommitment`/`removeMedicalCommitment`, manual-release + export + dashboard updated; admin catalog 0% guard.
- [x] UI: new `MedicalCommitmentCard`, `BenefitClaims` full-price entry + covered preview, rewritten benefits page + orientation + `/benefits/policy`; removed `BenefitsSelector`/`BenefitsTabs` (snapshots in `ui-versions/`).
- [x] `npx tsc --noEmit` + `npm run build` green. Docs updated (this file, PROJECT_DETAILS, CLAUDE.md, constitution).
- [ ] **User review of the new UI** + apply `025_*.sql` to Neon (destructive clean-wipe of selection data — confirmed test data).

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
| 008 | Knowledge Base — Consulting References & Reads | ✅ implemented (V1) |
| 012 | Benefits — Company Coverage Rates (co-funding) | ✅ implemented (branch — migration `023`) |
| 013 | Benefits — HR Bulk-Release + configurable sheet | ✅ implemented (in `main`) |
| 014 | HR-Managed Departments (add/rename/remove) | ✅ implemented (branch — migration `022`) |
| 015 | Consistent Admin Back Navigation | ✅ implemented (branch) |
| 016 | Admin Benefits redesign + manual claim/release | ✅ implemented (branch) |
| 017 | Benefits orientation tour | ✅ implemented (branch — migration `024`) |

## Next up
Autonomous build to the approved specs. Done: ALL 7 v1 modules (Foundation · Directory · Onboarding · Handbook · Time-Off · Benefits · Dashboard).
1. Build complete. Remaining: your setup actions in HANDOFF.md (Neon SQL, env, Google OAuth), then deploy + smoke test; optional polish (benefits visual fidelity, HR config-editing UI).
2. Hand-off items accumulate in `HANDOFF.md` (Neon SQL, env, Google OAuth, team-seed file) — delivered at the end.

## Build log
- **2026-08-07 — Benefits orientation tour (spec 017, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`, migration `024`):**
  A personalized, first-run, skippable, re-openable **stepped-cards** walkthrough (`BenefitsOrientation`)
  on the employee Benefits page. 4 steps in the employee's own numbers (welcome + first name → pool/band;
  guaranteed benefits with band amounts; how the flexible basket works; the rules — coverage 100/80/50,
  50% cap with **medical exempt**, claims = request-or-proof → covered portion, link to `/benefits/policy`).
  **Auto-opens** only when the selector is available and the employee hasn't submitted and hasn't seen it;
  **"How it works"** button re-opens any time. New `User.benefitsOrientationSeenAt` flag (migration `024`) +
  `markOrientationSeen` action (set once). No selector/money-rule change; reuses existing page data.
  Verified: `tsc` + `build` green; throwaway Postgres — migration idempotent, flag set-once (2nd attempt a
  no-op). UI mockup approved (final wording: medical-only 50% exemption; request-or-proof claims). Snapshot
  saved. **Neon: `prisma/sql/024_benefits_orientation.sql` (auto-applied by the deploy runner).**

- **2026-08-07 — Admin Benefits redesign + manual claim/release (spec 016, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`):**
  `/admin/benefits` recomposed into **three tabs** — **Submissions & Claims** (default) · **Benefits
  Catalogue** · **Amounts** — retiring the old Configuration + Claim-requirements tabs. **Catalogue** is
  one table (Name · Category · Order · Claim requirement · Coverage %) + hide/show/add, absorbing the
  per-item claim-requirement and coverage-% editing. **Amounts** groups ceilings, guaranteed amounts,
  guaranteed claim-requirements, and the rate card. All config tables are **view-first** via a shared
  `EditableSection` (read-only → Edit → Done), toggling independently. **Manual entry** (`manual-actions.ts`
  `recordManualRelease` + `ManualReleaseForm`): HR/Super User back-fills an already-approved claim as a
  **RELEASED** `BenefitClaim` with the entered approval date + actor, not queued, counted against the
  allocation; server-guarded (future date, allocation target required, amount ≤ remaining, covered terms).
  **No schema change.** Verified: `tsc` + `build` green; throwaway Postgres **9/9**
  (`scripts/verify-manual-release.mts`: released state + back-dated decision + reviewer, allocation cap for
  guaranteed & catalog, future-date + no-target rejection). UI snapshots saved. Preserves plan-year popup,
  submissions, claims queue, CSV export, reopen/reset. Future: everyone × benefits filterable master view.

- **2026-08-07 — Benefits company coverage rates / co-funding (spec 012, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`, migration `023`):**
  Each flexible benefit now carries a **coverage rate**. The employee enters the **full cost**; the
  **covered (company) share = cost × rate/100** draws from the pool, and they pay the rest. **All money
  rules run on the covered amount** (pool total, over-pool, FT 50% cap). Selection limits raised to
  **FT 5 / PT 3**. Medical unchanged (single 100%-covered rate-card item, cap-exempt). Claims reimburse
  the **covered portion** against proof of full spend.
  - Schema: `BenefitCatalogItem.coverageRate` (default 100) + `SelectionLine.cost` (`amount` stays the
    covered pool draw). Migration `023_benefits_coverage.sql` — seeds 80%/50% rates, backfills `cost = amount`.
  - New `src/lib/benefits/coverage.ts` (`coveredAmount`/`outOfPocket`) — single source shared by the
    server rules (`rules.ts`, now covered-based; FT5/PT3) + `saveBasket` and the client selector.
  - Selector (approved mockup): per benefit **Cost · Company pays (r%) · You pay**, a `r% covered` badge,
    and the meter tracks the **company share**; "Selected" panel headlines the company share. Admin
    Configuration catalog editor gains a **Coverage %** field (medical locked at 100). Policy page +
    claims wording updated to covered terms.
  - Verified: `tsc` + `build` green; **19/19** coverage/rules checks (`scripts/verify-coverage.mts`:
    80/100/50 math, DC-2 non-1,000, FT 50% cap on covered, over-pool, PT exempt, FT5/PT3, medical);
    throwaway Postgres — migration idempotent, rates seed (gym 80 / mobile 50 / medical 100), `cost`
    backfill correct + idempotent. UI snapshot saved. **Neon: `prisma/sql/023_benefits_coverage.sql`
    (auto-applied by the deploy runner).** The admin-Benefits tab redesign + manual claims is the next
    spec (016).

- **2026-08-07 — Consistent admin back navigation (spec 015, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`):**
  Added a shared `BackLink` component (`components/admin/BackLink.tsx`, the existing muted "←" style) to
  every admin page except the Admin home. Each links to its **structural parent** (section → Admin home;
  nested create/edit/import/release → its section list) — explicit path, not browser history — per the
  parent map in `specs/015`. Replaced the scattered ad-hoc back links (Modules, CSV Import, Release a
  benefit, Knowledge new/edit, Departments) with the one component; removed now-unused `Link` imports.
  20 admin pages wired. Verified: `tsc` + `build` green; grep confirms no stray ad-hoc back links.
  UI snapshots of all admin pages saved before editing (`ui-versions/admin-back-nav/2026-08-07/`).

- **2026-08-07 — HR-managed departments (spec 014, branch `claude/hr-erp-benefits-coverage-rates-hnaox1`, migration `022`):**
  Replaced the hard-coded `DEPARTMENTS` constant with a managed `Department` lookup table HR maintains
  at **Admin → Departments** (HR Admin + Super User). Department stays a **text label** on `User`
  (Option A); **rename cascades** to every employee in that department (one transaction); **remove is
  blocked** while anyone is assigned; names trimmed, duplicates rejected case-insensitively. New
  `getDepartments()`/`getDepartmentsWithUsage()`/`unionDepartments()` in `lib/departments.ts`; every
  department **choice/filter** now reads the managed list (employee create/edit form, grid filter,
  directory filter, CSV-import unknown-department flag), while display-only surfaces keep the stored
  label. `DepartmentsManager` client component (read-first list, Add, per-row Edit/Remove). Seeded the
  original five (`022_departments.sql`, idempotent, runner-applied). Verified: `tsc` + `build` green;
  **throwaway Postgres 13/13** (`scripts/verify-departments.mts`: add/dedup/trim, rename cascade with
  zero stale + case-only self-rename, rename-to-other-name rejected, remove-guard block/allow) + the
  migration applies idempotently (2nd run inserts 0). UI snapshots saved for the edited components.
  **Neon: `prisma/sql/022_departments.sql` (auto-applied by the deploy runner).**

- **2026-08-07 — Credentials auth + forced temp-password change (branch `claude/hr-erp-credentials-auth`, spec 001 FR-001/002/021/022/023/024):**
  Product decision: drop Google for now, use email + password, force a temp-password change on first login.
  - **Login:** removed the "Sign in with Google" button (provider still env-gated so it can return); **lifted the
    company-domain restriction** on password sign-in (`auth.ts` authorize) — any registered ACTIVE employee may
    sign in. HR gets a **non-blocking warning** in the employee form when an email isn't on `ALLOWED_EMAIL_DOMAIN`.
  - **Forced change:** new `mustChangePassword` flag (**migration `021_must_change_password.sql`** — renumbered from
    the parked branch's `020` to avoid colliding with `020_benefit_release.sql`). Admin-issued passwords (single or
    bulk) set the flag; the `(app)` layout redirects flagged users to a standalone **`/set-password`** page (outside
    the shell, no redirect loop) until they choose their own. Cleared on set (there or on Profile).
  - **Policy:** `validatePasswordPolicy` — ≥ 8 chars + uppercase + number + special — enforced server-side on
    `/set-password` and Profile; temp passwords exempt.
  - **Bulk temp passwords:** `TempPasswordsPanel` + `generateTeamPasswords` on Admin → Employees — generate for
    everyone missing a password (or Super-User "Reset ALL", excluding the actor) → **one-time CSV** (name · email ·
    password); stored only as scrypt hashes. No emails in v1 → HR reset is the only recovery.
  - Verified: `tsc` + `build` green; **throwaway Postgres** — migration idempotent, column `NOT NULL default false`,
    flag set-on-temp / clear-on-own, bulk missing-target correct; password-policy cases 7/7. Reuses the parked
    `team-credentials` work, adapted to these decisions. **Neon: run `prisma/sql/021_must_change_password.sql`.**

- **2026-08-05 — Consolidation branch `claude/hr-erp-benefits-consolidation`:** compiled the separate benefits
  branches into one mergeable unit off `main` (which already had spec 013). Bundles, verified together (`tsc` +
  `build` green):
  - **Selection guards (spec 007 FR-035/036, code):** over-selection prevented at the max (4 FT / 2 PT — unselected
    items dim); claimed benefits locked on reopen (can't deselect/under-fund below what's claimed); enforced in
    `saveBasket`. Verified earlier on Postgres (claimed-lock 6/6).
  - **Self-service reopen (FR-038, code):** employee reopens their own submitted basket ("Update my basket" →
    `reopenOwnSelection`), guarded to own+open+submitted. Verified earlier (reopen 5/5).
  - **Benefits guide de-confidentialized (FR-037, code):** `/benefits/policy` no longer exposes the pool-ceiling
    matrix / guaranteed amounts / rate card; rules-in-words + how-to-claim only.
  - **Salary confidential (spec 001 FR-018, code):** monthly salary is Super-User-only — hidden from HR Admin in
    the employee grid/form/inline-edit and never sent to a non-Super-User client (`canSeeSalary`).
  - **Spec 012 (Company Coverage Rates)** authored + clarified (docs only; **not built** — the next task).
  - Note: FR-035 caps FT at **4** today; spec 012 raises it to **5** when built (planned-vs-built, not a conflict).

  New **`/admin/benefits/release`** (linked "Release a benefit" from admin Benefits). `ReleaseManager` (client):
  benefit picker (fixed-allowance only — **Loans/salary-driven excluded**), employee table with **per-person
  release** (checkbox + **Select all/none** → `setReleased`), a **Status** column, a **column picker** (default
  `# · Employee · Tenure · Allowance value · Status` + optional non-confidential fields; **no salary**), and a
  client-side **CSV download**. New `BenefitRelease` model + **migration `020_benefit_release.sql`** (per employee ×
  benefit × plan year; presence = released; snapshots amount + date + actor). Amounts are band-derived
  (`amountForBand`); no-band employees flagged. **HR sees no salary anywhere in this feature.**
  Verified: `tsc` + `build` green; throwaway Postgres **9/9** (eligible filter excludes Loans; population = active +
  matching type; amount snapshots; no-band/PT/LEFT excluded; idempotent re-release; unrelease; unique constraint) +
  the migration SQL applies idempotently. **Neon: run `prisma/sql/020_benefit_release.sql`.** Docs updated.

- **2026-08-04 — Admin Benefits restructure, slice 1 (branch `claude/hr-erp-benefits-admin-config`):**
  `/admin/benefits` moved from a long scroll to **three tabs** (`AdminBenefitsTabs`, mirroring the
  employee `BenefitsTabs`): **Configuration · Submissions & claims · Claim requirements**. Plan-year
  management moved into a **top-right popup** (`PlanYearDialog`) — the year list with open/close toggles +
  create-new-year, all server-action forms (revalidate, popup stays open). The **Configuration** tab ships
  its first editable section — the **pool-ceilings grid** (type × band, `updatePoolCeilings`, one Save).
  No behaviour change to claims/submissions/requirements (markup relocated into panels). Verified on a
  throwaway Postgres (6/6: update, blank-skip, negative-clamp, create-missing, rounding, untouched).
  `tsc` + `build` green. UI snapshot saved.
- **2026-08-04 — Admin Benefits, slice 2 (Configuration editors):** the Configuration tab now also edits
  **guaranteed amounts** (FT/PT tables per band; Loans stays salary-driven/null), the **basket catalog**
  (edit name/category/order, **hide instead of delete**, add item with a derived unique key), and the
  **flat medical rate card** (self · spouse · child<18 · child18+). New actions in `config-actions.ts`.
  Verified on a throwaway Postgres (10/10: per-field guaranteed save with FT/PT isolation + salary-driven
  untouched; catalog edit/hide/create-unique/order; rate-card create + partial update). `tsc` + `build`
  green.
- **2026-08-04 — Admin Benefits, slice 3 (policy page):** new **`/benefits/policy`** — a read-only
  "How the benefits basket works" explainer generated from the **live config** (rules, pool ceilings,
  guaranteed amounts, active catalog by category, rate card, worked example) with a **Print / Save-as-PDF**
  button (`PrintButton` + `@media print` isolation so only the doc prints). Readable by any employee; linked
  from the employee Benefits page ("How the benefits basket works →") and the admin Benefits header
  ("Policy page"). `tsc` + `build` green; UI snapshots saved. **Benefits-admin restructure complete** across
  the 3 slices.
  Reference `benefitsselector_3.html` checked against seed: ceilings, guaranteed amounts, and catalog match
  exactly; the medical rate card is the only real gap (HTML is tiered Standard/Silver/Gold, ours is a single
  flat card — kept flat per decision, made editable in a later slice).

- **2026-08-03 — Benefits sticky tabs + claims table + Directory list-only sort (branch `claude/hr-erp-benefits-directory-ux`):**
  - **Benefits sticky tab bar (spec 007 · FR-034):** the "Your benefits / Claims & reimbursement" tab bar
    now stays pinned just beneath the sticky page header while scrolling either tab. `BenefitsTabs` measures
    the header (`#benefits-header`, via `ResizeObserver`) so the two frosted bands sit flush on every width;
    the header's own compact-on-scroll behavior is untouched.
  - **Benefits claims redesigned to a table (spec 007 · FR-033, supersedes the 2-column cards):** the claims
    tab is a table — **# · Benefit · Allocated · Reimbursed · Pending · Left to claim · Status**, one row per
    benefit with an at-a-glance status pill (Not started / Pending review / Partially reimbursed / Fully
    claimed / Rejected). Each row expands to its claim history + the file-a-claim form (Proof: amount + note
    + mandatory upload; Request: full-amount request + optional note). All prior capability preserved
    (multiple partial claims, notes, proof upload, tracker). `BenefitClaims` is now a client component.
  - **Directory list-only + sortable columns (spec 003 · FR-014/FR-015):** the card view + card/list toggle
    were retired; the Directory is the list/table alone, with **clickable Title / Department headers** that
    sort A→Z / Z→A (blanks last), layered on the existing search + department filter.
  - A clickable HTML mockup of the claims table was approved before implementing. UI snapshots saved for
    `DirectoryBrowser`, `BenefitsTabs`, `BenefitClaims`, and the benefits page. `tsc --noEmit` + `next build`
    both green. (Specs 003/007 + PROJECT_DETAILS updated in the same commit.)

- **2026-08-03 — Benefits claims: tabs + 2-column + human wording (spec 007 · FR-033):** the submitted
  benefits page splits into two tabs ("Your benefits" summary / "Claims & reimbursement", the latter
  badged with the pending-claim count) instead of one long scroll; claim cards lay out in two columns.
  Claim actions read by type — Request: "Request your benefit" / "Confirm request"; Proof: "Request
  your payback" / "Submit request". Verified in-browser (both tabs, 2-col, per-type wording); tsc green.

- **2026-08-03 — Benefits submitted-state view (spec 007 · FR-032):** once the basket is submitted the
  editable selector is replaced by a read-only **"Your selections"** summary (chosen benefits + amounts);
  the running-total box stays on the right (sticky, read-only); **Terms & conditions** move to a
  full-width two-column band below; the guaranteed band stays at top and the claims section follows.
  Draft state is unchanged (full editable selector). Verified in-browser: summary card renders, editable
  toggles gone. UI snapshot saved; `tsc` green.

- **2026-08-03 — Benefits claims refinement + employee salary (spec 007, branch `claude/hr-erp-dashboard-pwa`):**
  - Fixed the admin claim-type dropdown appearing to revert after **Set** (it saved; the uncontrolled
    field reset — keyed it by value).
  - Refined claim policy (migration `019`): **Medical = Automatic**; all guaranteed = **Request** except
    **Professional development = Proof**; basket = Proof. **Request** claims are **note-only** (no amount)
    and take the full allocation; **Proof** claims keep amount + upload.
  - Added `User.monthlySalary` (HR-private; employee form + grid): the **Loans** benefit now shows the
    employee's salary as its figure instead of "Available". Medical shows under "Paid automatically".
  - Verified on a throwaway Postgres: migration 019 applied + idempotent with correct defaults; Loans
    showed EGP 50,000; a note-only Request claim on Marriage auto-claimed the full 30,000 (Pending →
    fully claimed); Professional development = proof-required. `tsc` + build green.

- **2026-08-03 — Benefits claims & reimbursement + page polish (spec 007, branch `claude/hr-erp-dashboard-pwa`):**
  - **Page fixes:** submit confirmation banner (F1); the running-total meter now sticks on desktop
    while scrolling (F2, was broken — the whole aside was sticky but taller than the viewport); sticky
    page header (F3); guaranteed cards aligned on one baseline with reserved 2-line subtitles (F4).
  - **Claims/reimbursement (Phase-2, now built):** migration `018` adds a per-benefit `claimType`
    (None/Note/Proof) + a `BenefitClaim` model. Employees file **multiple partial claims** up to a
    benefit's allocation (note or mandatory proof-upload to Blob); a per-benefit tracker shows
    allocated / reimbursed / pending / left. Admin → Benefits gains a **Claims to review** queue
    (Release / Reject-with-reason), a **Claim requirements** editor (per benefit), and a full **Reset**
    (blocked when claims exist) beside Reopen. All server-authoritative.
  - Verified on a throwaway Postgres: migration 018 applied + idempotent with correct defaults;
    full Playwright flow — employee filed a claim → Pending → admin review queue (·1) → Release →
    tracker showed Reimbursed 4,000 / Left 6,000; Reset blocked when claims exist. `tsc` + build green.

- **2026-08-03 — Branding / white-label (spec 011, branch `claude/hr-erp-dashboard-pwa`):**
  - Single-row `BrandSettings` (migration `017`): company name, short name, logo, primary + accent
    colors. Super-User **Admin → Brand** screen (name, logo upload to Blob, two color pickers, reset).
  - The two base colors are expanded into full tint/shade scales and injected as a `:root` override of
    the theme CSS variables — **re-themes the entire UI with no per-component changes**. When colors
    equal the Forefront defaults, **no override is injected** (byte-for-byte identical to today).
  - Company name/logo applied to the sidebar, mobile header, sign-in, browser title, and the PWA
    manifest (name + theme color follow the brand). Data stays single-tenant per deployment.
  - Verified on a throwaway Postgres: a maroon/teal brand re-themed the whole app (styled screenshot);
    admin save changed the name to "Globex Inc" and reset restored "Forefront HR"; manifest + `<title>`
    reflect the brand. `tsc` + `next build` green. (Full multi-tenant data isolation is a separate,
    future spec — this is branding only.)

- **2026-08-03 — Home + PWA + grid polish (branch `claude/hr-erp-dashboard-pwa`):**
  - **Admin grid filters persist** (spec 001 · FR-020): the employees grid now remembers the filter
    selections (search, department, type, status, role) in localStorage, like it already did for
    column show/hide + order. Proven: set a filter + hid a column, reloaded → both restored.
  - **Module-aware dashboard** (spec 006 · FR-004/FR-004a): disabled modules contribute no tile and
    no quick link (fixes Onboarding showing after being switched off); the Benefits tile hides once
    submitted; Time-Off + Team Directory are the always-on primary cards (added a Directory card).
  - **PWA / installable** (spec 010): web manifest, navy/gold "F" icons (192/512/maskable + Apple),
    a minimal service worker (no auth-content caching), and head meta (theme-color, manifest,
    apple-touch-icon, mobile-web-app-capable). SW registered+activated in a real browser; installable
    on the HTTPS deploy. `tsc` + `next build` green.

- **2026-08-03 — Benefits: submissions CSV export (release scope #2):** `Export CSV` on
  Admin → Benefits downloads the open plan year's submissions via `/api/admin/benefits/export`
  (HR/Super-User only), one row per selected benefit line (employee · email · status · submitted ·
  benefit · category · medical · amount). Verified on a throwaway Postgres with a seeded submission:
  authenticated fetch returns HTTP 200 `text/csv` attachment with correct rows; `tsc` + build green.

- **2026-08-03 — Time-Off release additions (spec 005 · branch `claude/hr-erp-directory-benefits`):**
  - **HR central leave view** (FR-013): `/admin/time-off` lists every request (status filter);
    HR/Super User can approve or decline a pending request as a fallback. Admin card added.
  - **In-app decision badge** (FR-014): gold nav badge counts decided-but-unseen requests, cleared
    when the employee opens Time-Off (`decisionSeenAt`, migration `016`, idempotent). No email.
  - **Overlap warning** (FR-011, previously unimplemented): manager queue + HR view flag date
    clashes with a teammate's approved/pending leave (wires the existing `overlaps()` helper).
  - **Bug fixed:** decisions were carried on a submit-button `value`, which React/Next does not
    reliably include in a server action's FormData (manager approve/decline was silently no-op).
    Reworked to dedicated `approveLeaveRequest`/`declineLeaveRequest` actions via `formAction`.
  - Verified: `tsc` + `next build` green; migration `016` applied + idempotent on a throwaway
    Postgres; live Playwright — badge shows `1` and clears after viewing, both overlap warnings
    render, and an admin approve flipped a request to APPROVED in the DB. UI snapshot saved.

- **2026-08-03 — Directory grid + benefits polish (branch `claude/hr-erp-directory-benefits`):**
  - **Admin editable employees grid** (spec 001 · FR-020): `/admin/employees` is now an
    inline-editable power-grid — typed cells (text/email, date pickers, enum + Manager dropdowns),
    column show/hide + drag-reorder (localStorage), and filters (search + department/type/status/role).
    New server action `updateEmployeeField` validates one field with the full-form's per-field rules
    and enforces the same governance (Super-User-only role, email uniqueness, self/cycle guards, no
    self role/status change); optimistic UI with revert-on-error. The employee `/directory` is unchanged.
  - **Directory card/list toggle** (spec 003 · FR-014): read-only list (table) view alongside the
    cards, remembered per user; public fields only, same filters.
  - **Benefits polish** (spec 007): guaranteed benefits render as single-line rows; a pinned mobile
    floating summary bar keeps the running total/actions visible while scrolling (desktop keeps the
    sticky panel).
  - Verified: `tsc` + `next build` green; `scripts/verify-grid-writes.mts` 16/16 against a throwaway
    Postgres (text, enum→null, date coerce/clear, status, email-uniqueness, self/cycle guards); live
    Playwright pass — bootstrap login, inline title edit persisted through reload, Columns toggle,
    and screenshots of the grid, directory list, and benefits desktop + mobile. UI snapshots saved.

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

- **2026-07-27 — Time-Off complete (V1):** schema (LeaveRequest + LeaveStatus); employee /time-off
  (request full-day range + note; my-requests list with status; cancel pending); direct-manager
  approval queue (approve/decline + comment); no-manager falls back to a Super User; date validation.
  Single generic type, no balances, full days. Build green.

- **2026-07-27 — Benefits complete:** schema (PlanYear, PoolCeiling, GuaranteedBenefit,
  MedicalRateCard, BenefitCatalogItem, BenefitSelection, SelectionLine + enums). Server-authoritative
  rule engine (`src/lib/benefits/rules.ts`): pool ceiling, FT 50% single-benefit cap, FT max-4 / PT
  max-2, medical rate-card premium (self always + spouse/children by bracket) exempt from 50% but
  ceiling-capped, steps of 1,000. Employee /benefits: guaranteed panel + ported navy/gold selector
  (toggles, steppers, live meter, medical modal) with save-draft/submit-lock; window-gated. HR
  /admin/benefits: plan-year open/close + create, submissions view + reopen. Seeded confirmed config
  (`prisma/sql/003_seed_benefits.sql`). Deferred: HR editing UI for ceilings/guaranteed/rate-card
  (values seeded & authoritative); selector visual polish vs the HTML reference. Build green.

- **2026-07-27 — Dashboard complete + build complete:** Announcement model; composed /dashboard
  (onboarding progress, benefits status, time-off, manager approvals tile, announcements, quick
  links — role-adaptive); HR /admin/announcements. All 7 modules build green (typecheck + next build).

- **2026-07-28 — Auth bridge + CSV employee import:**
  - **Temporary username/password sign-in** (NextAuth Credentials provider) so HR can use
    the app before Google OAuth is configured. Validated against a single bootstrap admin
    (`BOOTSTRAP_ADMIN_*`, defaults `Islam`/`1234`), upserted as an active SUPER_USER on first
    login — no seed/SQL. Google provider is now optional (shown only when `AUTH_GOOGLE_ID`/
    `_SECRET` set); signin page swapped to a username/password form (UI snapshot saved).
  - **Bulk employee import** at `/admin/employees` → **Import CSV**. Dependency-free CSV/TSV
    parser + tolerant date parser (long-form, dotted, `d-Mon-yy`, slash formats; ambiguous
    numeric dates read **day-first** per HR decision; unreadable/annotated dates left blank &
    flagged). Tenure band **derived from hire date**. Upsert by email (never changes an
    existing role); external-domain emails imported (directory-visible, can't sign in yet);
    kids → dependants when a DOB parses. Per-row on-screen review report. Verified against the
    real 19-row sheet. Replaces the gitignored `seed_data_team.sql` handoff. Build green.

- **2026-08-03 — Incentive Scheme (spec 009), super-user only:** a hidden partner-compensation
  engine implementing "Team Benefits System v1.5" — Business Partner Fee, Commission, Profit
  Share (proposed), 70% gate, `eligible_to_lead` utilisation gate, contributor tiers/floor/cap,
  firm P&L, cost recovery, watch list. Pure engine in `src/lib/incentive/` (banker's rounding),
  per-cycle model (`013`), CSV upload with downloadable templates + flag-and-block validation,
  reports at `/incentive` (requireSuperUser; nav entry for super users only). Proven against
  Appendix A: `scripts/verify-incentive.ts` 27/27 and `scripts/verify-incentive-cycle.ts` 16/16.

- **2026-08-03 — Email + password sign-in + admin/self-service (auth):** employees sign in with
  their Forefront email + password or Google, both to the dashboard. `passwordHash` (scrypt, no
  new dep; migration `014`); admin set/reset per employee (temp password shown once); self-service
  change on Profile. Bootstrap admin retained as fallback.

- **2026-08-03 — Module release switch (super user):** Admin → Modules toggles each module on/off
  (`ModuleFlag`, migration `015`); off = hidden from nav + route redirects home. Guards on all six
  module root pages; nav filtered via `AppShell.hiddenNav`.

- **2026-07-30 — Knowledge Base deck attachments (spec 008 FR-009):** a KB topic can now carry one
  **PDF deck** so slide-heavy training topics keep a short, searchable blurb + the real deck instead of
  re-typing it as Markdown. Added `attachmentUrl/Name/Type/Size` to `KnowledgeArticle`
  (`012_knowledge_attachments.sql`, idempotent, auto-applied). Admin editor gains an "Attach deck (PDF)"
  field (upload / replace / remove), reusing the existing Vercel Blob `put()` pattern; server validates
  PDF-only ≤25MB and cleans up the old blob on replace/remove/delete. Employee reader renders the blurb
  first, then embeds the deck (`<object>`) with a Download link. Build green (typecheck + next build);
  migration `012` applied to a throwaway local Postgres and verified (columns added, idempotent, deck
  row reads back). UI snapshots saved before editing `KnowledgeExplorer`/`ArticleForm`.

- **2026-07-28 — Benefits catalog + shell polish:**
  - **Benefits selector rebuilt to `benefitsselector_3.html`:** catalog grouped into 5 display
    categories (Health & protection · Wellbeing · Life & family · Personal growth · Lifestyle &
    flexibility) with their items; category headers + "Selected" + "Terms & conditions" panels,
    navy/gold. Added `category` to `BenefitCatalogItem`; reseeded (`003`) + migration
    (`004_benefits_categories.sql`). Medical unchanged (Personal = self only; dependants separate
    in the modal). All money rules still server-side. Also fixed the `003` apostrophe bug.
  - **Collapsible sidebar:** chevron collapse → narrow icon rail with reopen; remembered in
    localStorage; **Handbook auto-collapses** it. Shell is now a client component; sign-out moved to
    a server action.
  - **Handbook & Resources → Vercel-style master–detail:** left list of sections + Resources group,
    content opens on the right, active item bold + navy underline, search retained. Removed the old
    card `HandbookBrowser`. Excluded `ui-versions/` snapshots from `tsc`.
  - Build green (typecheck + next build). UI snapshots saved before each edit.

- **2026-07-28 — Knowledge Base module (spec 008):** split the Handbook. The 3 consulting sections
  (Strategy Consulting, AI-Strategy Consulting, Assignment Phases) moved into a new **Knowledge Base**
  of admin-authored "reads." New `KnowledgeArticle` model; `/knowledge` employee master–detail
  (Vercel-style, search) with a Markdown renderer supporting GFM **tables**, `[!KEY/TIP/NOTE/WARNING]`
  **callouts**, and **mermaid** diagrams; `/admin/knowledge` CRUD with a **copyable Claude prompt** +
  paste-to-parse front-matter authoring flow. Nav gains "Knowledge Base" (auto-collapses the sidebar
  like Handbook). Seeded 9 starter articles mined from the Onboarding Kit PDF. DB: table added to
  `000`; 3 sections deactivated in `002`; `005_knowledge_base.sql` migrates existing DBs (table +
  deactivate + seed). Added deps: react-markdown, remark-gfm, mermaid. Build green.

- **2026-07-29 — Migration runner + onboarding v2 + handbook policies:**
  - **Deploy-time migration runner** (`scripts/apply-sql.mjs`, wired into `build`): applies pending
    `prisma/sql/NNN_*.sql` on each deploy, tracked in `_sql_migrations`; baselines the hand-applied
    000–005; no more pasting SQL into Neon. Skips cleanly when no DB URL (local builds).
  - **Onboarding v2:** stage is now **free-text** (group order from `order`) — no more enum
    migrations to add weeks. Redistributed into **Week 1–8 + Check-ins** (front-loaded foundation,
    consulting from Week 1, Real Case Sessions Momen/Omar/Galal/Islam in Weeks 3–6, split 30/60/90).
    New items: buddy, HR/Marketing/3× BU-head sessions, know-the-Time-Off-tool, 4 reading blocks,
    read case studies, own a deliverable. Policy items now deep-link to Handbook sections; actions to
    modules. (`006_onboarding_8week.sql`)
  - **Handbook policies:** added Office & Workplace · Time Off · Expenses · Code of Conduct ·
    Confidentiality · IT/Data-security sections (as points), plus optional **policy→tool buttons**
    (`actionLabel`/`actionHref`) — Time Off → Time-Off tool, People Governance → Benefits, rendered in
    both the reader and the explorer. (`007_handbook_policies.sql`)
  - All verified on a local Postgres (fresh + existing paths); typecheck + build green.

## Notes / carry-over
- Planning docs originally drafted in a prior session were staged in another repo (inaccessible from HR_ERP-scoped sessions); they have been recreated here as the canonical copy.
- Benefits figures are now **confirmed** (pool ceilings, guaranteed amounts by band, medical rate card) — see spec `007` and `PROJECT_DETAILS.md §5`. Claims/reimbursement remains Phase 2.

---

*Last Updated: 2026-08-03.*
