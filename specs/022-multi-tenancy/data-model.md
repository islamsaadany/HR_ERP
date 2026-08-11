# Phase 1 Data Model — Multi-Tenancy

Defines the `Organization` entity, the `orgId` attribution across the schema, the uniqueness
changes, per-org config, and the RLS policy shape. Field-level Prisma is written during
implementation; this is the design contract.

## New entity: Organization

| Field | Type | Notes |
|---|---|---|
| `id` | String (cuid) | PK; tenant key referenced by every tenant row |
| `name` | String | Legal/display company name |
| `shortName` | String | Compact label |
| `slug` | String @unique | Stable machine handle (future subdomain routing) |
| `allowedDomains` | String[] | Sign-in email domain(s); replaces global `ALLOWED_EMAIL_DOMAIN` |
| `logoUrl` | String? | Per-org (from Blob) |
| `primaryColor` | String | Default navy `#0f2444` |
| `accentColor` | String | Default gold `#c9a227` |
| `status` | enum `OrgStatus { ACTIVE, SUSPENDED }` | SUSPENDED blocks its users' sign-in, keeps data |
| `createdAt` / `updatedAt` | DateTime | |

Branding moves **onto Organization** (so `BrandSettings` singleton is absorbed — its fields become
Organization columns; the migration copies the singleton into Org #1). `NotificationSettings`,
`ModuleFlag`, `MedicalRateCard`, `PlanYear` become **per-org rows** (keyed by `orgId`).

## `orgId` attribution — every tenant-owned model

Add `orgId String` + `organization Organization @relation(...)` + `@@index([orgId])` to all 25
tenant models (child tables included, per research R5):

`User, Dependant, PersonalDocument, OnboardingActivity, ActivityCompletion, KnowledgeArticle,
HandbookSection, Resource, LeaveRequest, PlanYear, PoolCeiling, GuaranteedBenefit, BenefitRelease,
Department, MedicalRateCard, BenefitCatalogItem, MedicalCommitment, Announcement, BenefitClaim,
IncentiveCycle, IncentivePerson, IncentiveAssignment, IncentiveContribution, ModuleFlag,
NotificationSettings` (+ Organization absorbs the former `BrandSettings`).

`onDelete`: tenant rows are `Cascade` from Organization only for a future hard-delete flow (out of
scope now); suspension is the supported lifecycle.

## Role change

`enum Role { EMPLOYEE, HR_ADMIN, FINANCE, SUPER_USER, OWNER }` — `OWNER` is platform-level
(cross-org); all others are interpreted within `User.orgId`.

## Uniqueness changes (per research R6)

| Model | Old | New |
|---|---|---|
| User | `email @unique` | **unchanged** (global login identity) |
| Department | `name @unique` | `@@unique([orgId, name])` |
| BenefitCatalogItem | `key @unique` | `@@unique([orgId, key])` |
| KnowledgeArticle | `slug @unique` | `@@unique([orgId, slug])` |
| HandbookSection | `slug @unique` | `@@unique([orgId, slug])` |
| PoolCeiling | `@@unique([employmentType, tenureBand])` | `@@unique([orgId, employmentType, tenureBand])` |
| IncentiveCycle | `label @unique` | `@@unique([orgId, label])` |
| MedicalCommitment | `@@unique([userId, planYearId])` | unchanged (scoped via userId/planYearId) |
| BenefitRelease | `@@unique([userId, guaranteedBenefitId, planYearId])` | unchanged |
| ActivityCompletion | `@@unique([userId, activityId])` | unchanged |
| Incentive{Person,Assignment,Contribution} | `@@unique([cycleId, …])` | unchanged (scoped via cycleId) |

Per-org config singletons: `NotificationSettings`/`MedicalRateCard` become `@@unique([orgId])`
(one per org); `ModuleFlag` becomes `@@unique([orgId, key])`; `PlanYear` is many-per-org.

## Same-org referential invariants (enforced on write, per impact analysis class 5)

These id references MUST resolve to a row in the **same** `orgId`; validated in the server action
that sets them (and guaranteed by RLS since the referenced row is only visible within the org):
`User.reportsToId`, `LeaveRequest.approverId`, `BenefitClaim.reviewedById/paidById`,
`MedicalCommitment.committedById`, `BenefitRelease.releasedById/userId`,
`PersonalDocument.ownerId/uploadedById`, `Announcement.authorId`, and every benefit record's
config FK (`planYearId/guaranteedBenefitId/catalogItemId`). `User.department` (free-text) is matched
against the org's `Department` rows; the rename cascade is org-scoped.

## Row-Level Security (Phase E)

For every tenant table:

```sql
ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "<T>" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON "<T>"
  USING ("orgId" = current_setting('app.current_org', true))
  WITH CHECK ("orgId" = current_setting('app.current_org', true));
```

The tenant client sets `SET LOCAL app.current_org = <orgId>` per transaction (research R4). The
application DB role must not have `BYPASSRLS`. The OWNER console operates on `Organization` (not
under a tenant GUC) via the raw client. Priority order to enable: benefits + incentive (salary)
tables first, then the rest.

## Backfill (migration)

1. Insert `Organization #1` (Forefront) from the current `BrandSettings` singleton + current
   `ALLOWED_EMAIL_DOMAIN`.
2. Add nullable `orgId` to all tenant tables; per-org config keys added.
3. `UPDATE "<T>" SET "orgId" = '<org1>'` for every tenant table; copy singleton config into Org #1
   rows (rate card, notifications, module flags, plan years).
4. `ALTER … SET NOT NULL`, add FKs, convert uniques to composites.
5. Enable RLS + policies.

State: existing users keep their global `email`; every existing row now belongs to Org #1;
behavior is unchanged for the single org.
