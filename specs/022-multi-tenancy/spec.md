# Feature Specification: Multi-Tenancy — One Platform, Many Group Companies

**Feature Branch**: `claude/claiming-card-toast-fix-l1rsrq`

**Created**: 2026-08-10

**Status**: Final (impact-analyzed; ready for `/speckit-plan`)

**Input**: User description: "Make the platform truly multi-tenant so the companies in our group can all use one deployment. Tenant = the signed-in user's organization; a platform owner creates organizations and their first HR admin; existing Forefront data is preserved as Organization #1."

## Overview

Today the platform is **single-tenant per deployment**: one database holds exactly one company's data, and branding is a single global record (spec 011 explicitly deferred true multi-tenancy to "a future spec"). The group wants **one shared platform** where several companies operate side by side, fully isolated from one another, each with its own employees, benefits configuration, branding, and admins — administered centrally by group IT.

This feature introduces the concept of an **Organization (tenant)**. Every person and every piece of business data belongs to exactly one organization. A user only ever sees and acts within their own organization; **no user, admin, query, or export can reach another organization's data**. A new **platform-owner** capability (above the per-organization Super User) lets group IT create organizations and seed each one's first HR admin. The current Forefront data becomes **Organization #1** with nothing lost.

## Clarifications

### Session 2026-08-10

- Q: How is the tenant identified? → A: **By the signed-in user** — each user belongs to exactly one organization; the session carries it and all access is scoped to it. One shared URL, no subdomains in this phase.
- Q: Who creates tenants and the first admin? → A: A **platform-owner role** above Super User, with a small in-app **provisioning console**.
- Q: Existing data? → A: **Preserve** — migrate current data into Organization #1 (Forefront); backfill the organization onto every existing record non-destructively.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Platform owner creates a new company (tenant) (Priority: P1)

Group IT (the platform owner) opens a platform-admin console, creates a new organization (name, short name, allowed sign-in email domain, branding colors/logo), and creates that organization's **first HR admin** with a temporary password. That admin can then sign in and build out their company independently.

**Why this priority**: This is the literal ask — "how do we create a new tenant." Without it there is no multi-tenancy.

**Independent Test**: As the platform owner, create "Acme Co", set its domain and branding, and create an Acme HR admin. Sign in as that admin and confirm they land in an empty Acme workspace (their own branding, no Forefront data).

**Acceptance Scenarios**:

1. **Given** I am the platform owner, **When** I create an organization and its first HR admin, **Then** that admin can sign in and sees only their own organization, themed with their organization's branding.
2. **Given** a newly created organization, **When** its admin adds employees and configures benefits, **Then** none of that data is visible to any other organization.
3. **Given** I am a normal HR admin or Super User (not the platform owner), **When** I try to reach the provisioning console, **Then** I am denied.

### User Story 2 - Complete data isolation between companies (Priority: P1)

Every employee, HR admin, and Super User operates entirely within their own organization. Directory, benefits, leave, documents, onboarding, knowledge, handbook, announcements, incentive scheme, dashboards, and every admin surface show **only** their organization's data. There is no action, filter, URL, or export that reveals another organization's records.

**Why this priority**: Isolation is the whole point and the core risk — a leak of one company's salaries or benefits to another is unacceptable. It must hold even if a single query is written incorrectly.

**Independent Test**: With two organizations populated, sign in as an admin of Org A and attempt to view/edit/export Org B data by every available path (lists, detail pages by guessing IDs, search, reports, API routes) — all must fail or return only Org A data.

**Acceptance Scenarios**:

1. **Given** I am an Org A admin, **When** I open any list (employees, claims, leave, etc.), **Then** I see only Org A records.
2. **Given** I know the ID of an Org B record, **When** I request its detail page or a direct route/export for it, **Then** I am denied or receive nothing — never Org B's data.
3. **Given** the same underlying database, **When** a query is written without an explicit organization filter, **Then** the system still prevents it from returning cross-organization rows (defense-in-depth).
4. **Given** money/rules (pool ceilings, 50% cap, medical, incentive scheme), **When** they are evaluated, **Then** they use only the acting user's organization's configuration.

### User Story 3 - Existing Forefront data becomes Organization #1 (Priority: P1)

The current live data is preserved and assigned to a first organization ("Forefront"), created from the existing branding. Every existing record (users, benefits, leave, documents, etc.) is attributed to that organization. Existing users continue to sign in and see exactly what they saw before — now scoped as Organization #1.

**Why this priority**: The rollout cannot lose or corrupt the live data; it must be a safe, non-destructive transition.

**Independent Test**: After the migration, sign in as an existing Forefront employee/admin and confirm all prior data is intact and unchanged, and that Forefront is now one organization among potentially many.

**Acceptance Scenarios**:

1. **Given** the pre-migration data, **When** the migration runs, **Then** every existing record belongs to Organization #1 and nothing is deleted or altered in value.
2. **Given** the migration completed, **When** an existing user signs in, **Then** their experience is unchanged (same data, same branding).

### User Story 4 - Per-company branding, modules, and settings (Priority: P2)

Each organization has its **own** branding (name, short name, logo, navy/gold-family colors), its **own** enabled modules, and its **own** notification settings and allowed sign-in email domain(s) — independent of every other organization. Changing one company's branding or configuration never affects another's.

**Why this priority**: Companies must feel like their own product; shared/global settings would break the tenant boundary. Important, but the platform is usable before every setting is per-org.

**Independent Test**: Set different branding, enabled modules, and notification settings for two organizations; confirm each user sees only their own organization's configuration.

**Acceptance Scenarios**:

1. **Given** two organizations with different branding, **When** users from each sign in, **Then** each sees their own name/logo/colors.
2. **Given** an organization with a module disabled, **When** its users navigate, **Then** that module is hidden for them but remains available to other organizations that enabled it.

### Edge Cases

- **Cross-org ID access**: requesting another organization's record by ID (detail page, file/proof route, export) must be denied, not silently served.
- **User with no organization**: a user must always belong to exactly one organization; an account without one cannot sign in to a workspace (the platform owner is the only cross-org actor).
- **Duplicate names across orgs**: two organizations may each have a "Wellbeing" category, a "Marketing" department, a benefit keyed "gym", or an employee named the same — these must not collide (uniqueness is per-organization, not global).
- **Sign-in identity**: a person's sign-in email maps to exactly one organization (a person has one login). Being an employee of two group companies at once is **out of scope** for this phase.
- **Platform owner scope**: the platform owner can create/manage organizations and seed admins but does not routinely browse a company's operational data unless explicitly acting within it; any such access is auditable.
- **Deleting/suspending an organization**: suspending an org blocks its users from signing in without destroying data. (Full deletion/offboarding is out of scope for this phase.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST represent each company as an **Organization**, and every person and business record MUST belong to exactly one organization.
- **FR-002**: The system MUST scope **all** reads and writes to the acting user's organization — every list, detail view, search, export, file/proof access, and admin surface — so a user can never see or affect another organization's data.
- **FR-003**: Isolation MUST hold as **defense-in-depth**: even a query that omits an explicit organization filter MUST NOT return cross-organization rows (a second enforcement layer below the application).
- **FR-004**: The system MUST provide a **platform-owner** capability, above the per-organization Super User, able to: create organizations; set an organization's name, short name, sign-in email domain(s), and branding; and create an organization's first HR admin.
- **FR-005**: The provisioning console and all platform-owner actions MUST be denied to every non-owner role.
- **FR-006**: Each organization MUST have its **own** branding, enabled modules, notification settings, and allowed sign-in email domain(s); changing one organization's settings MUST NOT affect another's.
- **FR-007**: All server-authoritative money and rules (pool ceilings by type × tenure, the 50%-per-benefit cap, medical handling, the plan-year window, and the incentive scheme) MUST be evaluated using **only** the acting user's organization's configuration.
- **FR-008**: Uniqueness rules MUST be **per-organization** where a value is naturally company-scoped (department names, benefit keys, pool-ceiling tiers, medical commitment per plan year, benefit release per plan year, etc.); a person's sign-in identity (email) remains a **single** platform login mapped to one organization.
- **FR-009**: The rollout MUST **preserve** all existing data by creating Organization #1 (Forefront) from current branding and attributing every existing record to it, non-destructively, delivered as hand-runnable database migration file(s) (sessions cannot push schema to the production database).
- **FR-010**: After migration, an existing user's experience MUST be unchanged (same data, same branding), now scoped to Organization #1.
- **FR-011**: Sign-in MUST resolve the user's organization from their account and carry it for the session; each organization's allowed sign-in domain(s) MUST be enforced per organization (replacing the single global domain setting).
- **FR-012**: The platform owner MUST be able to **suspend** an organization (blocking its users' sign-in) without destroying its data.
- **FR-013**: Cross-organization access attempts (e.g. a record ID from another org) MUST fail closed (denied / not found), never leak.

### Key Entities *(include if feature involves data)*

- **Organization (tenant)**: a company on the platform — name, short name, logo, brand colors, allowed sign-in email domain(s), enabled modules, notification settings, status (active/suspended). The root every other record hangs from.
- **User ↔ Organization**: every user belongs to exactly one organization; roles (Employee, HR Admin, Finance, Super User) are **within** that organization. The platform **Owner** is the one cross-organization capability.
- **All existing business records** (employees & profiles, departments, onboarding, knowledge, handbook, resources, personal documents, leave, all benefits tables, announcements, incentive scheme, module flags, notification settings, branding): each gains an owning organization and is only ever accessed within it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A platform owner can create a new company and its first admin, and that admin can sign in to an isolated, correctly branded workspace, in **under 10 minutes** with no engineering involvement.
- **SC-002**: **Zero** cross-organization data exposure: across a deliberate probing test (lists, ID guessing, search, exports, file routes, API routes) from one organization against another, **100%** of attempts return only the caller's organization data or are denied.
- **SC-003**: **100%** of tenant-owned data reads/writes are organization-scoped (verified by an automated check that no such access path is unscoped).
- **SC-004**: The rollout preserves **100%** of existing records with **no** change in value, and existing users report an unchanged experience.
- **SC-005**: Two or more organizations run concurrently on one deployment with independent branding, modules, and settings, and configuration changes in one are never observed in another.
- **SC-006**: All benefits/incentive money rules produce results using only the acting organization's configuration (no cross-org figures) in **100%** of evaluated cases.

## Assumptions

- **Tenant model**: shared deployment + shared database; a user belongs to exactly one organization; the organization is resolved from the signed-in user (no subdomain/custom-domain routing in this phase — deferred).
- **Sign-in identity is global**: one email = one platform login = one organization. Multi-organization membership for a single person is out of scope now.
- **Data isolation** is enforced both in the application (every access scoped to the organization) and by a second, lower layer as defense-in-depth for the sensitive money/salary data.
- **Existing roles are per-organization** (Employee, HR Admin, Finance, Super User); the new **Owner** is the only cross-organization capability and is held by group IT.
- **Phased delivery**, each phase verified before the next: (1) Organization model + orgId on every table + preserve-and-backfill migration; (2) organization-scoped data access across every query and action + sign-in carrying the organization; (3) per-organization branding/modules/notifications/domains; (4) platform-owner role + provisioning console; (5) defense-in-depth hardening + cross-tenant leakage tests.
- **Migration delivery**: as numbered, hand-runnable `prisma/sql/` files (Neon), applied by the operator; the existing live data is treated as real and preserved.
- **Out of scope (now)**: subdomain/custom-domain routing, public self-serve signup, billing/subscription, cross-organization (group-wide) reporting, and full organization deletion/offboarding.
- **Design language** stays navy/gold; any new surfaces (provisioning console, org switcher for the owner) follow the existing patterns and the mockup-first rule.
- **Login page is org-agnostic** (consequence of user-based tenant resolution): because the tenant is resolved from the signed-in user, the shared `/signin` page and the unauthenticated logo route cannot know the visitor's company, so **per-company branding applies only after login** — the login screen stays platform-generic. Per-company login branding would require subdomains/custom domains (deferred).

## Impact Analysis & Non-Breakage Gate

A full codebase sweep backs this spec — see **`impact-analysis.md`** in this folder (every finding is file:line-cited). Summary:

- **Nothing breaks for the existing company.** After the migration attributes all current data to **Organization #1 (Forefront)**, every existing query still returns Forefront data (one org only) and existing users are unaffected.
- **The multi-tenant risk is latent** and activates when **Organization #2** is created. The sweep found the concrete surface: ~40 files / ~180 Prisma call sites to org-scope; 4 hard config singletons (brand, notifications, medical rate card, module flags) and global reads (active plan year, pool ceilings, directory, headcount, incentive cycles) that would return the wrong org; 6 global unique constraints (`Department.name`, `BenefitCatalogItem.key`, `KnowledgeArticle.slug`, `HandbookSection.slug`, `PoolCeiling`, `IncentiveCycle.label`) that block a 2nd org until made per-org; the session/roles being global; and several file/export routes (documents, claim proofs, knowledge attachments, resources, both CSV exports) that would leak across orgs.
- **Controlling rule:** a **hard gate** — do not create Organization #2 until every item in the gate checklist (`impact-analysis.md`) is complete. Executed in the spec's five phases, the live single-org instance never regresses.

## Future goal — one identity, multiple employments (from spec 024)

Deferred here from the multi-brand work (spec 024, 2026-08-14): an employee who holds **two real contracts across two group companies** (e.g. part-time in one, full-time in another, each with its own employment type, tenure, salary, and **separate benefits entitlement**). Today the model is **one `User` = one employee = one contract**, and every module (benefits/pool/medical/claims, tenure, time-off, onboarding, incentive) keys off `User`, so this cannot be represented on one record.

- **Interim answer (in use now):** represent such a person as **two separate employee records** (one per contract) — each fully independent, with its own business-unit brand and benefits. Works today with no code; the trade-off is two logins, duplicated personal data, and a double directory listing. Adopted 2026-08-14 for the single known case.
- **Target model (this spec):** introduce an **`Employment`/contract entity** under a single person identity, moving benefits/tenure/time-off/salary from the person to the *contract*, with an active-contract context in the session. This is a large re-plumb of the same ~40 files / ~180 call sites this spec already scopes, so it belongs to (or immediately after) the org-scoping work rather than as a bolt-on to the benefits engine. Capture as a phase/extension when this spec is planned.
