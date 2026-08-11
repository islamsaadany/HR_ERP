# Implementation Plan: Multi-Tenancy — One Platform, Many Group Companies

**Branch**: `claude/claiming-card-toast-fix-l1rsrq` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-multi-tenancy/spec.md` (+ [impact-analysis.md](./impact-analysis.md))

## Summary

Turn the single-tenant-per-deployment HR platform into a **true shared multi-tenant** platform:
one deployment + one database serving many group companies, isolated by an **Organization**.
Every tenant-owned row carries an `orgId`; the tenant is resolved from the **signed-in user** and
carried in the session; **all** data access goes through a **tenant-scoped Prisma client** that
injects `orgId` automatically, with **Postgres row-level security (RLS)** as a hard backstop for the
money/salary tables. A new platform-level **OWNER** role provisions organizations and each one's
first HR admin through a small console. Existing Forefront data is preserved as **Organization #1**
via a non-destructive backfill. Delivered in five verifiable phases; the live single-org instance
never regresses (see the non-breakage gate in `impact-analysis.md`).

## Technical Context

**Language/Version**: TypeScript 5, Next.js 16 (App Router), React 19

**Primary Dependencies**: Prisma (PostgreSQL/Neon), NextAuth v5 (Credentials + optional Google), Tailwind, Vercel Blob

**Storage**: PostgreSQL (Neon) — **shared database, shared schema**, `orgId` on every tenant-owned table + RLS policies; hand-runnable `prisma/sql/` migrations (sessions never `prisma db push`)

**Testing**: `npx tsc --noEmit` + `npm run build`; migration verification on throwaway local Postgres (as done for specs 032/033); a scripted **cross-tenant leakage probe** (two orgs, attempt every access path)

**Target Platform**: Vercel serverless (Node runtime); Neon pooled connections

**Project Type**: Web application — a single Next.js app (no separate frontend/backend)

**Performance Goals**: No material regression; org-scoping adds an indexed `orgId` predicate to queries. Tenant provisioning completes in < 10 min (SC-001).

**Constraints**: **Zero** cross-tenant data exposure (SC-002); benefits/incentive money rules stay server-authoritative and **per-org** (Constitution III); migrations preserve 100% of existing data (SC-004); no secrets committed; PII files stay out of git.

**Scale/Scope**: Tens of group companies; low-thousands of employees total. Change surface (from the impact analysis): ~40 files / ~180 Prisma call sites, 8 API routes, the auth layer, 4 config singletons, 6 global unique constraints, ~10 same-org referential checks.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after design.*

- **I. Align Before Building (NON-NEGOTIABLE)** — PASS. Spec + impact analysis approved; this plan is the aligned design. Each implementation phase re-gates with the user before code.
- **II. UI Changes Require Explicit Approval** — DEFERRED-GATE. New surfaces (owner provisioning console, per-org branding already exists, an owner org-switcher) are UI; each requires a **navy/gold mockup + sign-off** and a `ui-versions/` snapshot before building (enforced in `tasks.md`, phase 4).
- **III. Benefits Money & Rules Server-Authoritative (NON-NEGOTIABLE)** — PASS/STRENGTHENED. Pool ceilings, 50% cap, medical, plan-year window, and the incentive scheme become **per-org** and remain server-evaluated; RLS adds a second guarantee on the salary tables.
- **IV. Spec-Driven & Docs Move With Code** — PASS. spec/plan/tasks under `specs/022-…`; the four steering docs updated in the same commits as code.
- **V. Engineered Enough, Explicit Over Clever** — PASS. The tenant-scoped client + RLS is the deliberate, non-fragile way to make "never leak" true by construction rather than by remembering a `where` clause on ~180 call sites.

No violations requiring Complexity Tracking. The added mechanisms (tenant client, RLS) are justified directly by the non-negotiable isolation requirement for money/salary data.

## Design Overview

### Tenancy mechanism (the core decision)
1. **`Organization` table** + **`orgId`** on every tenant-owned table (direct column; child tables also get it for RLS simplicity even though they could inherit via parent). See `data-model.md`.
2. **Tenant resolution**: the signed-in user's `orgId` is looked up in the NextAuth `jwt` callback and carried on the token/session. `requireUser/requireAdmin/...` return `{ id, role, orgId }`.
3. **Tenant-scoped data access**: a `getTenantDb(orgId)` helper returns a Prisma client bound to the org — implemented as a Prisma **client extension** that (a) injects `where: { orgId }` on reads and `data: { orgId }` on writes for tenant models, and (b) opens each operation in a transaction that first executes `SET LOCAL app.current_org = <orgId>` so **RLS** applies. Server code uses `db` from the request's tenant context; the raw client is reserved for auth bootstrap and the OWNER console.
4. **RLS backstop**: every tenant table gets a policy `USING (org_id = current_setting('app.current_org')::text)`. Even a query that forgets the filter cannot cross orgs. Priority coverage: benefits + incentive (salary) tables first.
5. **Platform OWNER**: a new top role; the OWNER context is explicitly cross-org and uses the raw client for org CRUD only, never for browsing tenant operational data.

### Per-org configuration (replacing singletons/env)
`BrandSettings`, `NotificationSettings`, `MedicalRateCard`, `PlanYear`, `ModuleFlag` become per-org
(keyed by `orgId`). `ALLOWED_EMAIL_DOMAIN` and `ADMIN_EMAILS` move onto `Organization`
(`allowedDomains`, and the first admin seeded explicitly by the OWNER). The `/signin` page and the
unauthenticated logo route stay **platform-generic** (login is org-agnostic — see spec Assumptions).

### Migration & rollout (non-destructive, phased)
Numbered `prisma/sql/` files: add `Organization`; create Org #1 from the current `BrandSettings`
singleton; add nullable `orgId` everywhere; **backfill** all rows to Org #1; set `NOT NULL` + FKs;
convert the 6 global uniques to `(orgId, …)` composites (safe — one org at migration time); enable
RLS. Verified on throwaway local Postgres across the full chain, as for 032/033.

## Project Structure

### Documentation (this feature)

```text
specs/022-multi-tenancy/
├── plan.md               # This file
├── spec.md               # Feature spec (final)
├── impact-analysis.md    # File:line codebase sweep + non-breakage gate
├── research.md           # Phase 0 — resolved technical decisions
├── data-model.md         # Phase 1 — Organization + orgId + uniques + RLS
├── contracts/            # Phase 1 — provisioning + tenant-context contracts
│   ├── tenant-context.md
│   └── owner-provisioning.md
├── quickstart.md         # Phase 1 — validation scenarios (isolation probe)
└── tasks.md              # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root — where the change lands)

```text
prisma/
├── schema.prisma                     # + Organization; orgId on all tenant models; per-org config; composite uniques; Role += OWNER
└── sql/034_*.sql … 03N_*.sql         # phased, hand-runnable migrations (add/backfill/notnull/uniques/RLS)

src/
├── lib/
│   ├── auth.ts                       # jwt/session carry orgId; per-org domain + admin bootstrap
│   ├── roles.ts                      # requireUser/... return orgId; OWNER checks; requireOwner()
│   ├── tenant.ts                     # NEW — getTenantContext(), getTenantDb(orgId) (Prisma extension + SET LOCAL app.current_org)
│   ├── prisma.ts                     # base client (bootstrap/owner only)
│   ├── brand.ts, modules.ts, notifications/settings.ts, departments.ts, benefits/config.ts  # per-org lookups
│   └── org.ts                        # NEW — organization CRUD + first-admin seeding (owner)
├── app/
│   ├── (app)/**                      # every page/action reads tenant db from context (all ~40 files)
│   ├── (owner)/**                    # NEW — platform-owner console (create/suspend org, seed admin)
│   └── api/**                        # documents/proof/attachment/resource/export routes org-checked
└── data/                             # types for Organization + tenant context

ui-versions/                          # snapshots for any changed/added UI (owner console, etc.)
```

**Structure Decision**: Single Next.js app, shared-DB multi-tenancy. Tenant enforcement is
centralized in `src/lib/tenant.ts` (app layer) + Postgres RLS (data layer) so isolation is a
property of the system, not of each call site. A new route group `(owner)/` isolates the
cross-org platform-admin console from the tenant app.

## Phased Delivery (each verified before the next; re-gate with user per Constitution I)

- **Phase A — Schema + backfill**: `Organization`, `orgId` everywhere, per-org config keys, composite uniques, `Role += OWNER`; migration creates Org #1 and backfills. *Verify*: local-Postgres migration test; existing data intact; `tsc`/`build`.
- **Phase B — Tenant-scoped data access + auth**: `src/lib/tenant.ts`, session carries `orgId`, convert **all** queries/actions/singletons/global-reads to the tenant db (the class-1 list in the impact analysis). *Verify*: single-org behavior unchanged; no unscoped tenant query remains (grep/lint gate).
- **Phase C — Per-org config & routes**: brand/modules/notifications/rate-card/plan-year per org; per-org allowed domain(s) in auth; org-check the 8 API/file/export routes; same-org referential validation on writes. *Verify*: config changes isolated.
- **Phase D — OWNER role + provisioning console**: create org (name/short/domain/branding), seed first HR admin, suspend org. *Verify*: owner-only access; new org boots isolated + branded. (UI mockup-first.)
- **Phase E — RLS hardening + leakage probe**: enable RLS policies (salary tables first); scripted two-org probe over every access path must return only the caller's data or deny. *Verify*: SC-002 = 100%.

## Complexity Tracking

No constitution violations to justify. (The tenant client + RLS are not "extra" complexity but the
minimum needed to satisfy the non-negotiable isolation requirement across ~180 call sites and the
salary tables.)
