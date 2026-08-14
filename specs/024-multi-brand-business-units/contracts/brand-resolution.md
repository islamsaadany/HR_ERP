# Contract: Effective Brand Resolution

The single rule the whole app relies on for "which brand do I show". Implemented in
`src/lib/brand.ts` (`getBrand()`), request-cached, consumed by `src/app/layout.tsx` (theme CSS +
metadata) and `src/app/(app)/layout.tsx` (AppShell name/logo).

## Inputs (read at request time)

- The NextAuth session (`auth()`), or none.
- The impersonation cookie (`ff_impersonate`) — honored only when the real session user is a Super
  User and the target is a non-Super User (identical guard to `requireUser`/`getImpersonation`).
- `BusinessUnit` row for the effective user's `businessUnitId` (if any).
- The `BrandSettings` singleton (fallback), itself falling back to `BRAND_DEFAULTS`.

## Output

A `Brand` object (unchanged shape): `{ companyName, shortName, logoUrl, primaryColor, accentColor }`.

## Rules

1. **Signed out / pre-auth** (no session): return the default brand. (Sign-in page, errors, etc.)
2. **Signed in, effective user has a `businessUnitId`**: return that unit's brand, **per-attribute
   merged** over the default (a null attribute on the unit uses the default's value).
3. **Signed in, no `businessUnitId`**: return the default brand.
4. **Impersonating**: the "effective user" is the impersonation target, so rule 2/3 use the target's
   business unit → the app shows the target's brand; on exit, the actor's brand returns.
5. **Un-migrated / error** (no BusinessUnit table or column, DB error): return the default brand
   (try/catch), never throw into a layout.
6. **Colors** are always valid hex on output (unit colors are NOT NULL, defaulted to navy/gold), so
   `brandThemeCss` always receives usable values.

## Invariants

- No business unit ever changes a user's **permissions or data visibility** — resolution affects
  appearance only.
- Zero extra behavior for the default look: a user with no business unit sees byte-for-byte today's
  brand.
- One resolution per request (cached), shared by theme CSS, metadata, and the shell.
