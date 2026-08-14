# Phase 0 Research: Multi-Brand by Business Unit

The spec was pre-aligned (no open `[NEEDS CLARIFICATION]`). Research here records the
implementation decisions and the alternatives weighed, grounded in the existing codebase.

## D1 — Where brand resolution becomes viewer-aware

- **Decision**: Make `getBrand()` (`src/lib/brand.ts`) resolve the **effective** brand: read the
  session (NextAuth `auth()`); compute the effective user id (honoring the impersonation cookie
  exactly as `requireUser`/`getImpersonation` do — Super User + non-Super target); load that user's
  `businessUnitId`; if set, return the BusinessUnit's brand merged over the `BrandSettings` default;
  otherwise return today's default. Keep it request-cached (`react` `cache`) so the root layout,
  `(app)` layout, and metadata share one resolution per request.
- **Rationale**: The root layout already injects `brandThemeCss()` and metadata from `getBrand()`, and
  the `(app)` layout passes `brand.companyName/shortName/logoUrl` to `AppShell`. Centralizing the
  "which brand" decision in `getBrand()` re-themes the entire app at one point — mirroring how
  `requireUser()` centralizes "which user" for impersonation.
- **Alternatives**: (a) Resolve in each layout separately — duplicative, drift risk. (b) A middleware
  that sets a header — extra moving part; can't read Prisma easily; harder to test. Rejected.

## D2 — Null-safety for pre-authentication and no-BU users

- **Decision**: When there is no session (sign-in and other pre-auth surfaces) or the effective user
  has no `businessUnitId`, return the existing default brand unchanged. Wrap the session/DB reads in
  try/catch so an un-migrated database (no BusinessUnit table / column) silently falls back to the
  default — matching the existing `getBrand()` try/catch.
- **Rationale**: Root layout is `force-dynamic` and renders for every route incl. `/signin`. Zero
  regression is a success criterion (SC-003). Fail-safe to the default look, never broken/blank.
- **Alternatives**: Require every user to have a BU — rejected (breaks existing data; spec FR-011).

## D3 — Per-attribute fallback (partial BU brands)

- **Decision**: The effective brand is a per-attribute merge: for each of {companyName, shortName,
  logoUrl, primaryColor, accentColor}, use the BusinessUnit's value when set, else the `BrandSettings`
  default value (which itself falls back to `BRAND_DEFAULTS`). Colors are stored NOT NULL on the
  BusinessUnit (defaulted to navy/gold on create) so a unit always themes cleanly; `logoUrl` is
  nullable (a unit with no logo shows its wordmark, not another company's logo).
- **Rationale**: Matches spec edge cases (BU exists but attribute unset → default for that attribute;
  no blank name / missing logo). Keeps the color path always valid for `brandThemeCss`.
- **Alternatives**: All-or-nothing per BU — less forgiving, more operator error. Rejected.

## D4 — BusinessUnit as a table + FK (vs Department's text label)

- **Decision**: New `BusinessUnit` table; `User.businessUnitId` nullable FK (`onDelete: SetNull` as a
  safety net, though the admin blocks deletion while any employee is assigned). Managed at
  `/admin/business-units` (Super User), mirroring the Departments admin (add / rename / remove-blocked-
  while-in-use / case-insensitive dedupe) plus per-unit brand editing.
- **Rationale**: A business unit carries structured brand data and is referenced for resolution, so a
  real entity + FK is cleaner and safer than a stray text label, and it lines up with spec 022's
  `Organization`. Governance (brands) is a Super User action, consistent with the Brand screen.
- **Alternatives**: Text label like Department + a separate name→brand map — two sources of truth,
  fragile. Rejected.

## D5 — Assigning the business unit (form, grid, CSV)

- **Decision**: Add a Business Unit single-select to the employee create/edit form and an inline
  grid column (populated from the managed BU list), and a "Business Unit" CSV column matched by name
  (tolerant; unknown name flagged in the import report, not dropped) — reusing the exact patterns
  department already uses (`getDepartments`, grid enum cell, import known-set flagging). Role/status/
  salary CSV exclusions are unchanged.
- **Rationale**: Consistency with the established Department UX; least surprise for HR; FR-004.
- **Alternatives**: Separate assignment screen — more clicks, diverges from department. Rejected.

## D6 — Impersonation interplay

- **Decision**: Because `getBrand()` resolves the **effective** user (impersonation-aware), viewing as
  an employee automatically themes to that employee's business unit; exiting restores the actor's own
  brand. No extra work beyond D1's effective-user resolution.
- **Rationale**: Reuses the just-shipped impersonation cookie/guard; satisfies FR-008 for free.
- **Alternatives**: None needed.

## D7 — Seeding the three business units

- **Decision**: Seed **Forefront Consulting**, **Visual Shift Consulting**, **Omnisight Analytics**.
  Default each unit's `companyName`/`shortName` to its own name and colors to the current navy/gold
  (`#0f2444` / `#c9a227`); the Super User then edits colors/logo/name per unit. Do NOT auto-assign
  existing employees to any unit — they stay on the default brand until HR assigns them.
- **Rationale**: Makes the feature immediately demoable while keeping the current look for everyone
  until intentionally themed (SC-003). Ship as a `prisma/sql/0NN_business_units.sql` handoff file
  (idempotent), regenerated in the same commit as the schema change.
- **Alternatives**: Backfill all Forefront employees into a "Forefront Consulting" unit — changes the
  live look without approval; rejected for this phase (belongs to a deliberate rollout step).

## D8 — Known limitations accepted this phase (from spec Out-of-Scope)

- PWA manifest name/icon stays the single deployment default (one manifest per deployment).
- Sign-in and pre-auth surfaces show the default brand (viewer unknown).
- Transactional emails keep the default brand.
- No data isolation, no per-BU benefits/directory scoping. All fold into spec 022.
