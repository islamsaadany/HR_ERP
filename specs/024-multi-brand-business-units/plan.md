# Implementation Plan: Multi-Brand by Business Unit

**Branch**: `claude/platform-name-demo-view-hxzd6l` (spec dir `024-multi-brand-business-units`) | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/024-multi-brand-business-units/spec.md`

## Summary

Give each group company its own look and feel over shared data. Introduce a **BusinessUnit** table that carries a brand (name, short name, logo, primary/accent colors), add a nullable **`User.businessUnitId`** foreign key, and make the app's brand resolution **viewer-aware**: the theme, name, logo, and page title follow the effective (viewing/impersonated) user's business unit, falling back to the existing global `BrandSettings` singleton when unset. Reuse the existing color-ramp engine (`brandThemeCss`) and the hex-entry field unchanged — the only new theming logic is *which* brand to resolve. No data isolation, no money-rule changes; a Super User manages business units + brands, and HR assigns each employee one business unit via form, grid, and CSV.

## Technical Context

**Language/Version**: TypeScript, Next.js 16 (App Router) + React 19

**Primary Dependencies**: Prisma + PostgreSQL (Neon); NextAuth v5 (session for effective-user resolution); Tailwind v4 (CSS-variable theming); Vercel Blob (logo storage, existing `put` + private serve route)

**Storage**: PostgreSQL — new `BusinessUnit` table + `User.businessUnitId` FK; existing `BrandSettings` singleton retained as fallback

**Testing**: `npx tsc --noEmit` + `npm run build`; seed/DDL applied to a throwaway local Postgres and queried (constitution/CLAUDE §3a); manual click-through of the theming/impersonation paths

**Target Platform**: Vercel (serverless), one deployment, one database (single-tenant data — unchanged)

**Project Type**: Web application (Next.js App Router monolith under `src/`)

**Performance Goals**: Brand resolution adds at most one indexed lookup per request; zero extra DB work for users with no business unit is not required, but the resolution must not add a query for signed-out/pre-auth requests

**Constraints**: Root layout is `force-dynamic` and renders for **all** routes incl. pre-auth — resolution must be null-safe with no session; must never leak or break the current default look (zero regression when no BU is assigned)

**Scale/Scope**: 3 seeded business units, tens of employees today; a handful of new files + one migration + edits to the two layouts, the employee form/grid/CSV, and the admin home

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Align Before Building (NON-NEGOTIABLE)** — PASS. Scope pre-aligned with the user (3 recorded decisions); this plan adds no scope beyond the spec.
- **II. UI Changes Require Explicit Approval** — GATE FOR `/implement`. New admin UI (Business Units management) and a theming change are visual. Before building any UI, produce a **static navy/gold mockup** of (a) the Business Units admin surface and (b) the employee-form/grid business-unit field, and get sign-off (MOCKUP-FIRST). Snapshot every edited UI file to `ui-versions/` before editing. Theming reuses the existing ramp — no redesign of components.
- **III. Benefits Money & Rules Server-Authoritative (NON-NEGOTIABLE)** — PASS / N/A. No benefits rule, figure, pool, or medical logic is touched; business unit affects appearance only (OOS-002).
- **IV. Spec-Driven & Docs Move With Code** — PASS (planned). The four steering files + this spec are updated in the same commit as the code; the `prisma/sql/0NN_*.sql` migration is regenerated in that commit.
- **V. Engineered Enough, Explicit Over Clever** — PASS. Reuse the Department admin pattern and the brand ramp; handle nulls/fallbacks explicitly (no BU, partial BU brand, deletion-while-assigned, unknown CSV name). `tsc` + `build` verified before handover.

**Result**: No violations. One process gate (II) to honor during `/implement`. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/024-multi-brand-business-units/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── brand-resolution.md
│   └── business-unit-admin.md
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                     # + model BusinessUnit; + User.businessUnitId
└── sql/0NN_business_units.sql        # NEW: table + FK + seed 3 BUs (Forefront/Visual Shift/Omnisight)

src/
├── lib/
│   ├── brand.ts                      # EDIT: viewer-aware effective-brand resolution + fallback merge
│   ├── business-units.ts             # NEW: list/CRUD helpers, name normalize/dedupe, usage counts
│   └── impersonation.ts              # (reuse) effective-user id already resolvable via roles/cookie
├── app/
│   ├── layout.tsx                    # EDIT: theme CSS + metadata from the EFFECTIVE brand
│   └── (app)/
│       ├── layout.tsx                # EDIT: pass effective brand name/logo to AppShell (already does; source changes)
│       └── admin/
│           ├── page.tsx              # EDIT: add "Business Units" super-user card
│           └── business-units/
│               ├── page.tsx          # NEW: manage BUs + per-BU brand (Super User)
│               └── actions.ts        # NEW: add/edit/rename/remove BU + brand + logo upload
│       └── admin/employees/          # EDIT: create/edit form, grid, CSV import/export gain Business Unit
└── components/
    └── admin/
        ├── BusinessUnitsManager.tsx  # NEW: list + editable brand rows (reuses BrandColorField)
        └── EmployeeGrid.tsx          # EDIT: Business Unit column (enum-like select of managed BUs)
```

**Structure Decision**: Single Next.js App-Router project (existing `src/` monolith). BusinessUnit is a **first-class table with a real FK** on `User` (unlike Department's text label) because it carries structured brand data and must block deletion while referenced; this also positions it to graduate into spec 022's `Organization`. Admin surface mirrors the Departments pattern; brand editing reuses `BrandColorField` and the existing logo-upload flow.

## Complexity Tracking

No constitution violations — section intentionally empty.
