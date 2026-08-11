# Multi-Tenancy — Codebase Impact Analysis ("will it break anything?")

**Companion to** `spec.md` · **Created** 2026-08-10 · **Status** Final (design/`plan.md` pending)

This is an engineering impact analysis of introducing organizations (tenants) into the
existing single-tenant codebase. It answers one question: **what breaks, and how do we
sequence the work so nothing breaks?** Every claim is grounded in a file:line reference from
a full sweep of the repo. No code has been changed.

## Verdict

- **For the existing company alone (post-backfill), nothing breaks.** After the migration
  attributes every existing row to **Organization #1 (Forefront)**, every current query still
  returns Forefront data (there is only one org), and existing users' experience is unchanged.
- **The risk is latent and activates the moment Organization #2 is onboarded.** Dozens of
  queries assume "one company," several config records are hard singletons, several unique
  constraints are global, roles are global, and several file/export routes are unscoped. With a
  second org present, these would **mix or leak** data across companies.
- **Therefore the controlling rule is a hard gate:** *do not create Organization #2 until every
  item in the "Gate before Org #2" checklist below is done.* Executed in the phased order in the
  spec, the build never breaks the live Forefront instance, because the app keeps running as a
  correct single-org system throughout — the multi-tenant surface only goes live when #2 arrives.

## Scope: what carries an organization

**25 models are tenant-owned** (all of them, essentially — there is no shared reference data):
`User, Dependant, PersonalDocument, OnboardingActivity, ActivityCompletion, KnowledgeArticle,
HandbookSection, Resource, LeaveRequest, PlanYear, PoolCeiling, GuaranteedBenefit, BenefitRelease,
Department, MedicalRateCard, BenefitCatalogItem, MedicalCommitment, Announcement, BenefitClaim,
IncentiveCycle, IncentivePerson, IncentiveAssignment, IncentiveContribution, ModuleFlag,
BrandSettings, NotificationSettings`.

Child tables (`Dependant`, `ActivityCompletion`, `IncentivePerson/Assignment/Contribution`,
`BenefitClaim/Release`, `MedicalCommitment`, `PoolCeiling`) can inherit their org through their
parent (`userId`/`cycleId`/`planYearId`), but for defense-in-depth (row-level security) an explicit
`orgId` on every table is safer. `plan.md` decides direct-vs-inherited per table.

## Breakage class 1 — "one company" singletons & global queries (HIGH)

These return *the* row/rows today; with two orgs they return the **wrong** org's data or a mix.
All must be converted to org-scoped before Org #2.

- **Active plan year** — `src/lib/benefits/config.ts:78` `planYear.findFirst({status:OPEN})`.
  Drives all benefits gating. Wrong-org plan year = wrong money rules.
- **Medical rate card** — `config.ts:117`, `admin/benefits/config-actions.ts:245`,
  `admin/benefits/page.tsx:79` `medicalRateCard.findFirst()`. Money.
- **Pool ceilings** — `admin/benefits/page.tsx:67` `poolCeiling.findMany()` (no `where`) returns
  every org's ceilings. Money.
- **Brand settings** — `lib/brand.ts:97`, `api/brand/logo/route.ts:17`, `admin/brand/actions.ts:29`
  `brandSettings.findFirst()`; model is a hard singleton (`schema.prisma:603`, `id @default("singleton")`).
- **Notification settings** — `lib/notifications/settings.ts:25`, `admin/notifications/actions.ts:41`
  keyed on `id:"singleton"` (`schema.prisma:618`).
- **Module flags** — `lib/modules.ts:23` `moduleFlag.findMany({enabled:false})`; `key @id`
  (`schema.prisma:593`) — one switchboard for the whole deployment.
- **Directory profile** — `directory/[id]/page.tsx:18` `user.findFirst({id,ACTIVE})`: any signed-in
  user can open **any** org's employee profile by id. **Cross-org leak.**
- **Whole-company reads** with only `status` scope: `directory/page.tsx:13` (directory list),
  `dashboard/page.tsx:57` (`user.count({ACTIVE})` headcount), `departments.ts:37` (`user.groupBy`),
  manager dropdowns `admin/employees/[id]/page.tsx:27` & `new/page.tsx:13`.
- **No-`where` `findMany`** (return everything): `incentive/page.tsx:15` (cycles — salary data),
  `announcements/page.tsx:11`, `handbook/page.tsx:18` (resources), `benefits/policy/page.tsx:27`,
  `admin/benefits/page.tsx:41/65/66/67`, `admin/knowledge/actions.ts:256`, `departments/actions.ts:22`.
- **Slug/name lookups** that would collide across orgs: `handbook/[slug]/page.tsx:16`,
  `admin/handbook/actions.ts:83`, `admin/knowledge/actions.ts:181`.
- **Leave approver fallback** — `time-off/actions.ts:53` `user.findFirst({role:SUPER_USER})` picks
  **any** super user in the DB → could hand another org's admin approval rights. **Cross-org.**

## Breakage class 2 — global unique constraints that block Org #2 (HIGH)

A second org literally cannot insert until these fold `orgId` into their keys:

- `Department.name @unique` (`schema.prisma:403`) — two orgs both need "Marketing".
- `BenefitCatalogItem.key @unique` (`:426`) — both need key `gym`.
- `KnowledgeArticle.slug @unique` (`:203`) and `HandbookSection.slug @unique` (`:229`).
- `PoolCeiling @@unique([employmentType, tenureBand])` (`:337`).
- `IncentiveCycle.label @unique` (`:526`) — both need "H1-2026".

Keep global: **`User.email @unique`** (`:51`) — it is the platform login identity and, with
user-based tenant resolution, must map to exactly one org (one person = one login = one org).
The other incentive uniques (`@@unique([cycleId, …])`) already scope through `cycleId` and are fine.

## Breakage class 3 — auth & roles are global (HIGH)

- **Session/JWT carries no org.** `auth.ts:143-145` stamps `token.uid/role/name`; `:150-155`
  copies to `session.user.id/role`. Must add `orgId`, and `requireUser/requireAdmin/...`
  (`roles.ts:17-50`) must expose it and bind the tenant-scoped data client.
- **Role is a single global field on `User`.** An org's `SUPER_USER`/`HR_ADMIN` is only meaningful
  within their org; role checks must be evaluated against the acting org. Add the platform **OWNER**
  role above `SUPER_USER`.
- **`ALLOWED_EMAIL_DOMAIN`** (`auth.ts:26`, enforced for Google at `:110`; also the HR "non-company
  domain" warning at `admin/employees/new/page.tsx:34`, `[id]/page.tsx:58`, `import/actions.ts:60`)
  and **`ADMIN_EMAILS`** (`auth.ts:27`, auto-promotes to SUPER_USER at `:118`) are single global env
  values → must move onto the Organization (per-org domain(s) + per-org admin bootstrap).
- **Bootstrap admin** (`BOOTSTRAP_ADMIN_*`, `auth.ts:33-40`, upsert `:81-90`) becomes the seed
  **OWNER**.

## Breakage class 4 — API/file/export routes leak across orgs (HIGH)

- `api/knowledge/[id]/attachment/route.ts:12` and `api/resources/[id]/route.ts:11` — **sign-in
  only**, no owner/org check → any user fetches any org's attachment/resource. Must add org scope.
- `api/documents/[id]/route.ts:24-26` and `api/claims/[id]/proof/route.ts:24-27` — allow
  `owner OR isAdmin`; since `isAdmin` is a **global** role, an admin of Org A could fetch Org B's
  document/proof by id. Must add org scope.
- `api/admin/employees/export/route.ts:24` — `user.findMany` with no `where` → exports the **entire**
  registry across all orgs. `api/admin/benefits/export/route.ts:24-47` — exports every employee in
  the plan year, unscoped. Both must scope to the acting org.
- `api/brand/logo/route.ts:17` — **unauthenticated** (shown on `/signin`). See the login-branding
  note below.

## Breakage class 5 — same-org referential invariants (MEDIUM)

These id references have no same-company constraint today and could point across orgs if not
validated on write:
- `User.reportsToId` org chart (`schema.prisma:91`; set in `admin/employees/actions.ts:67/137/271`,
  `import/actions.ts:174`; `wouldCycle` only prevents cycles).
- `LeaveRequest.approverId` (`:277`); `BenefitClaim.reviewedById/paidById` (`:503/:507`);
  `MedicalCommitment.committedById` (`:461`); `BenefitRelease.releasedById/userId` (`:383/:391`);
  `PersonalDocument.ownerId/uploadedById` (`:141/:147`); `Announcement.authorId`/`KnowledgeArticle.authorId`
  (loose id fields, no FK).
- Benefit records' FKs to config (`planYearId/guaranteedBenefitId/catalogItemId`) must resolve to the
  **same** org's config.
- `User.department` is a **free-text label** matched by name against the `Department` table
  (`departments.ts`, rename-cascade `admin/departments/actions.ts:61`) — the cascade and name
  uniqueness must be org-scoped.

## Consequence of user-based tenant resolution: the login page is org-agnostic

Because the tenant is resolved **from the signed-in user** (no subdomains this phase), the `/signin`
page and the unauthenticated `api/brand/logo` route **cannot know which company** a visitor belongs
to. So **per-company branding applies only after login**; the login screen stays platform-generic
(one shared logo/name). Per-company *login* branding requires subdomains/custom domains, which are
explicitly deferred. This is a known, accepted limitation — call it out to the user.

## Defense-in-depth (RLS) note

The spec requires isolation to hold even if a query forgets its org filter. In Postgres that means
**row-level security** with a per-request `SET app.current_org`. With Prisma on Neon's pooled
serverless connections this must be wired carefully (set the GUC inside the same transaction/session
as the queries, via a tenant-bound client/middleware). It is real work and is sequenced as the final
hardening phase — the **primary** enforcement is the application-layer tenant-scoped data client;
RLS is the backstop, most important for the salary-bearing tables (benefits, incentive scheme).

## Migration safety (non-destructive)

The rollout is safe precisely because **only one org exists at migration time**:
1. Add `Organization`; create Organization #1 from the current `BrandSettings` singleton.
2. Add nullable `orgId` to every tenant-owned table; **backfill** every existing row to Org #1.
3. Set `orgId` `NOT NULL` + FK; convert the global uniques (class 2) to composite `(orgId, …)` —
   safe because there are no cross-org duplicates yet.
4. Move `ALLOWED_EMAIL_DOMAIN`/`ADMIN_EMAILS` onto Organization #1; seed the OWNER.
Delivered as numbered, hand-runnable `prisma/sql/` file(s) (Neon), applied by the operator. Because
every step preserves existing values, the live instance keeps working throughout.

## Effort magnitude

Roughly **40 files / ~180 Prisma call sites** must become org-aware, plus 8 API routes, the auth
layer, 4 hard singletons, 6 global unique constraints, and ~10 same-org referential checks. This is
a large, multi-phase change — not a single PR. The spec's five phases sequence it so each is
verifiable and the single-org instance never regresses.

## Gate before onboarding Organization #2 (must all be true)

- [ ] `orgId` on every tenant-owned table; all existing rows backfilled to Org #1; NOT NULL + FKs set.
- [ ] Global unique constraints converted to per-org composites (class 2).
- [ ] Session/JWT carries `orgId`; `requireUser/requireAdmin/...` bind a tenant-scoped data client; OWNER role added.
- [ ] Every Prisma read/write org-scoped (all ~40 files) — including the singletons/global queries in class 1.
- [ ] Per-org config live: brand, modules, notifications, medical rate card, plan year, allowed domain(s).
- [ ] API/file/export routes org-checked (documents, proof, attachment, resource, both CSV exports).
- [ ] Same-org referential validation on write (reportsTo, approver, reviewer/payer, committer, releaser, document owner, benefit-config FKs, department label).
- [ ] RLS enabled as the backstop (at least on the money/salary tables), verified by a cross-tenant probing test.

Only when every box is checked is it safe to create a second organization.
