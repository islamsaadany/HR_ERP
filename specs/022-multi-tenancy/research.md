# Phase 0 Research — Multi-Tenancy

Resolves the open technical decisions behind the plan. Format: Decision / Rationale / Alternatives.

## R1. Isolation model — shared DB, shared schema, `orgId` column

- **Decision**: One database, one schema, an `orgId` column on every tenant-owned table; scoping enforced in the app **and** by Postgres RLS.
- **Rationale**: Matches the "one shared platform" goal and the existing hand-run `prisma/sql` migration workflow. Cheapest to operate (one DB, one deploy). RLS gives a hard guarantee for salary/benefits data even if a query forgets its filter.
- **Alternatives**: *Schema-per-tenant* (Postgres schemas) — stronger isolation but painful with Prisma (one schema per client, migrations × N) and with Neon pooling. *DB-per-tenant* — that is the current single-tenant "separate deployment" model the user explicitly moved away from. Both rejected.

## R2. Tenant resolution — from the signed-in user

- **Decision**: Each `User` has one `orgId`; the NextAuth `jwt` callback stamps `orgId` on the token, the `session` callback exposes it, and `requireUser/requireAdmin/...` return it. No subdomains in this phase.
- **Rationale**: Works with the existing email+password login and pre-registration model; one shared URL; least moving parts.
- **Consequence**: the `/signin` page and the unauthenticated logo route cannot know the org, so **login is platform-generic**; per-company branding applies post-login. Per-company login branding needs subdomains (deferred).
- **Alternatives**: Subdomain/host-based resolution — enables per-company login branding but needs DNS/routing and host parsing; deferred, and can be layered on later without changing the data model.

## R3. Sign-in identity — email stays globally unique

- **Decision**: `User.email` remains globally `@unique` (one email = one platform login = one org). Other naturally company-scoped uniques become per-org composites.
- **Rationale**: User-based resolution with email login requires an unambiguous email→org mapping; a global-unique email guarantees it. Simpler mental model (one person, one login).
- **Alternatives**: Per-org email uniqueness (same person in two orgs) — breaks unambiguous login without an org selector; multi-org membership is an explicit non-goal now.

## R4. Enforcement layer — a tenant-scoped Prisma client extension + RLS

- **Decision**: `getTenantDb(orgId)` returns a Prisma **client extension** that (1) injects `where:{orgId}` on reads and `data:{orgId}` on writes for tenant models, and (2) runs each call inside a transaction beginning with `SET LOCAL app.current_org = $orgId` so RLS is active. Request handlers get `db` from the tenant context; the raw client is used only for auth bootstrap and OWNER org-CRUD.
- **Rationale**: Centralizes correctness — isolation becomes a property of the client, not of ~180 individual `where` clauses. `SET LOCAL` scopes the GUC to the transaction, which is correct under Neon's pooled connections (no leakage between pooled requests). RLS is the safety net.
- **Alternatives**: *Manual `where:{orgId}` everywhere* — brittle; one miss = leak; rejected as the sole mechanism (but the extension effectively does this uniformly). *Prisma middleware (`$use`)* — deprecated in favor of client extensions. *App-only, no RLS* — fails the "impossible to leak even if a filter is missed" requirement for salary data.
- **Risk/Validation**: The `SET LOCAL` + pooling interaction and the extension's model coverage must be proven with the two-org leakage probe (quickstart) before RLS is trusted. Neon pooling (PgBouncer transaction mode) is compatible with `SET LOCAL` because it is transaction-scoped.

## R5. `orgId` on child tables — direct column everywhere

- **Decision**: Put `orgId` directly on every tenant table, including children that could inherit it via a parent (`Dependant`, `ActivityCompletion`, `BenefitClaim/Release`, `MedicalCommitment`, `IncentivePerson/Assignment/Contribution`, `PoolCeiling`).
- **Rationale**: RLS policies and the client extension are uniform and simple when every row has `orgId` locally; avoids join-based policies. Backfill derives child `orgId` from the parent once.
- **Alternatives**: Inherit via parent FK in RLS (`org_id` through a join) — more complex policies, slower; rejected for uniformity.

## R6. Global unique constraints → per-org composites

- **Decision**: Convert to `(orgId, …)`: `Department.name`, `BenefitCatalogItem.key`, `KnowledgeArticle.slug`, `HandbookSection.slug`, `PoolCeiling(employmentType,tenureBand)`, `IncentiveCycle.label`. Keep global: `User.email`. Incentive child uniques already scope via `cycleId` (fine).
- **Rationale**: Two orgs must be able to reuse the same department/benefit-key/slug/cycle label. Safe to convert at migration time because only Org #1 exists (no duplicates yet).

## R7. Roles — add platform `OWNER`; existing roles stay per-org

- **Decision**: `Role += OWNER` (above `SUPER_USER`). OWNER is the only cross-org capability (create/suspend orgs, seed first admin) via a dedicated `(owner)/` console using the raw client. `EMPLOYEE/HR_ADMIN/FINANCE/SUPER_USER` are interpreted within the acting user's org. Bootstrap admin (`BOOTSTRAP_ADMIN_*`) becomes the seed OWNER.
- **Rationale**: Clean separation of "run the platform" from "run a company"; keeps tenant admins unable to cross orgs.
- **Alternatives**: A separate `PlatformAdmin` table decoupled from `User` — heavier; the single-role-enum approach reuses existing role plumbing.

## R8. Per-org config & env → Organization fields

- **Decision**: `BrandSettings`, `NotificationSettings`, `MedicalRateCard`, `PlanYear`, `ModuleFlag` become per-org (keyed by `orgId`, dropping the `"singleton"` ids / global keys). `ALLOWED_EMAIL_DOMAIN` → `Organization.allowedDomains` (array); `ADMIN_EMAILS` → replaced by explicit first-admin seeding per org. Google-domain enforcement (if enabled) checks the org's domains.
- **Rationale**: Configuration is tenant data; env globals cannot express N companies.

## R9. Migration strategy — additive, backfilled, then constrained

- **Decision**: Ordered `prisma/sql` files: (1) create `Organization` + Org #1 from current `BrandSettings`; (2) add nullable `orgId` to all tenant tables + per-org config keys; (3) backfill every row / config to Org #1; (4) `SET NOT NULL` + add FKs + convert uniques to composites; (5) enable RLS + policies. Each file idempotent where practical; verified on throwaway local Postgres over the full 000→03N chain (as for 032/033).
- **Rationale**: Non-destructive; the live instance keeps working after each step. Splitting across files lets the operator apply and verify incrementally.
- **Risk**: RLS + the app role — the app's DB role must NOT be `BYPASSRLS`; confirm Neon role privileges during Phase E.

## R10. Testing multi-tenancy

- **Decision**: Beyond `tsc`/`build`, add a **two-org leakage probe** (quickstart): seed Org A + Org B, then from an Org A session attempt lists, ID-guess detail pages, search, both CSV exports, and each file route against Org B ids — every attempt must deny or return only Org A. Plus a static gate: no tenant model is queried off the raw client outside `auth`/`owner`.
- **Rationale**: SC-002 (zero exposure) and SC-003 (100% scoped) are only credible if actively probed.
