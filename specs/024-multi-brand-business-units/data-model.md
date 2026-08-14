# Phase 1 Data Model: Multi-Brand by Business Unit

## New entity: `BusinessUnit`

A group company whose brand its members (and any admin who belongs to it) see. Carries the same
brand attributes as the global `BrandSettings`, per unit.

| Field          | Type       | Null | Default            | Notes |
|----------------|------------|------|--------------------|-------|
| `id`           | String     | no   | `cuid()`           | PK |
| `name`         | String     | no   | —                  | **Unique** (case-insensitive enforced in app). The company name; also the default app/wordmark name. |
| `shortName`    | String     | no   | `"Forefront"`-like | Eyebrow / initial; seeded from the unit name. |
| `logoUrl`      | String?    | yes  | `null`             | Private Vercel Blob URL; served via the existing authorized route. `null` → wordmark. |
| `primaryColor` | String     | no   | `"#0f2444"`        | Hex; expanded by `brandThemeCss`. |
| `accentColor`  | String     | no   | `"#c9a227"`        | Hex; expanded by `brandThemeCss`. |
| `order`        | Int        | no   | `0`                | Display order in the admin list (mirrors Department). |
| `createdAt`    | DateTime   | no   | `now()`            | |
| `updatedAt`    | DateTime   | no   | `now()` `@updatedAt` | |

**Relationships**: one `BusinessUnit` has many `User`. **Validation**: `name` trimmed, non-empty,
unique case-insensitively (reject duplicates, like Department); colors must match `^#[0-9a-fA-F]{6}$`
(same rule as the Brand editor); removal blocked while any `User.businessUnitId` references it.

## Changed entity: `User`

| Field            | Type    | Null | Default | Notes |
|------------------|---------|------|---------|-------|
| `businessUnitId` | String? | yes  | `null`  | New FK → `BusinessUnit.id`, `onDelete: SetNull`. Optional; a null value → default brand. **Distinct from `department`.** |

Everything else on `User` is unchanged. No change to role, permissions, or which records a user can
see. `businessUnitId` is HR-managed (form / grid / CSV), never self-set by the employee.

Prisma (schema intent):

```prisma
model BusinessUnit {
  id           String   @id @default(cuid())
  name         String   @unique
  shortName    String
  logoUrl      String?
  primaryColor String   @default("#0f2444")
  accentColor  String   @default("#c9a227")
  order        Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @default(now()) @updatedAt
  members      User[]
}

// on model User:
//   businessUnitId String?
//   businessUnit   BusinessUnit? @relation(fields: [businessUnitId], references: [id], onDelete: SetNull)
//   @@index([businessUnitId])
```

## Derived value: the **effective brand** (not stored)

Resolved per request by `getBrand()`:

```
effectiveUserId = impersonating ? targetId : sessionUserId   // null when signed out
bu              = effectiveUserId ? user.businessUnit         // null when no BU / no session
default         = BrandSettings singleton (or BRAND_DEFAULTS)
effectiveBrand  = {
  companyName : bu?.name         ?? default.companyName,
  shortName   : bu?.shortName    ?? default.shortName,
  logoUrl     : bu?.logoUrl      ?? default.logoUrl,   // per-attribute fallback
  primaryColor: bu?.primaryColor ?? default.primaryColor,
  accentColor : bu?.accentColor  ?? default.accentColor,
}
```

## Seed data (`prisma/sql/0NN_business_units.sql`, idempotent)

| name                     | shortName   | primaryColor | accentColor | logoUrl |
|--------------------------|-------------|--------------|-------------|---------|
| Forefront Consulting     | Forefront   | `#0f2444`    | `#c9a227`   | null |
| Visual Shift Consulting  | Visual Shift| `#0f2444`    | `#c9a227`   | null |
| Omnisight Analytics      | Omnisight   | `#0f2444`    | `#c9a227`   | null |

Colors seed to the current navy/gold so nothing changes visually until the Super User re-themes a
unit. **No employees are auto-assigned.** (The `BrandSettings` singleton is untouched — it remains the
fallback brand.)

## Migration notes

- New table + nullable FK column are **additive and non-destructive**; existing rows get
  `businessUnitId = NULL` and keep the default brand (SC-003).
- Regenerate `prisma/sql/0NN_business_units.sql` in the same commit as `schema.prisma`
  (constitution IV); verify on a throwaway Postgres (apply DDL, seed, query the three units + a
  user assignment round-trip).
