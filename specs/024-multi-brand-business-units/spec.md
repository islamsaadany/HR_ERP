# Feature Specification: Multi-Brand by Business Unit

**Feature Branch**: `claude/platform-name-demo-view-hxzd6l`

**Created**: 2026-08-14

**Status**: Draft (aligned with user; ready for `/speckit-plan`)

**Input**: User description: "For an easier shift for now (before the full multi-tenancy of spec 022), take a multi-brand approach: the brand carries multiple brands with colors and names, and each employee is set to a business unit — in our case Forefront Consulting, Visual Shift Consulting, Omnisight Analytics. Based on each business unit we set a brand color and app name that gives a look and feel to the users, while Admin, Finance and HR keep the same function. Theme follows the user's own business unit; theming only for now."

## Overview

Today the platform shows **one global brand** (spec 011 `BrandSettings` singleton) to everyone, and true multi-tenancy with full data isolation is specified separately and deferred (spec 022). This feature is a deliberately lighter **interim step toward** spec 022: it gives each group company its own **look and feel** — company/app name, logo, and navy/gold-style color palette — layered over the **same shared data and administration**.

The mechanism is a new **Business Unit** concept. Each employee belongs to exactly one business unit, and the app's visual identity (name, logo, colors) **follows the viewing user's own business unit** on every screen — including for Admin, HR, and Finance users. Their **function and permissions do not change**: they still see and manage every employee across all business units, exactly as today; only the visual skin differs.

This feature is **theming only**. It does **not** isolate data between business units, does not create per-business-unit benefits configuration, and does not change any money rule. Those belong to the full multi-tenancy work (spec 022), into which the Business Unit concept is designed to graduate later.

## Clarifications

### Session 2026-08-14

- Q: When an Admin / HR / Finance user uses the app, whose brand do they see? → A: **Their own business unit's brand.** Their function/permissions are unchanged (they still administer everyone); only the color/name/logo follows their own business unit.
- Q: Scope for now? → A: **Theming only** — name, logo, and colors per business unit over shared data. No per-business-unit data isolation, benefits configuration, or directory filtering.
- Q: Is "business unit" a new field? → A: **Yes, a brand-new field, separate from department**, and each employee has **exactly one** business unit.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An employee sees their own company's brand (Priority: P1)

An employee assigned to "Visual Shift Consulting" signs in and the whole app — sidebar wordmark/logo, page title, and the navy/gold color palette — reflects Visual Shift's brand, not the generic default. A colleague in "Omnisight Analytics" signs in and sees Omnisight's brand instead. Each person feels they are using their own company's tool, even though both are on the same platform with the same data.

**Why this priority**: This is the core value — the per-company look and feel. Without it there is no feature.

**Independent Test**: Assign two employees to two different business units with distinct names/colors/logos. Sign in as each and confirm the sidebar name, logo, page title, and theme colors match that person's business unit; confirm neither sees the other's brand.

**Acceptance Scenarios**:

1. **Given** I am an employee whose business unit has a configured brand, **When** I sign in and use any page, **Then** the app name, logo, and colors are my business unit's brand throughout.
2. **Given** two employees in two different business units, **When** each signs in, **Then** each sees only their own business unit's brand.
3. **Given** I have **no** business unit set (or my business unit has no custom brand), **When** I sign in, **Then** I see the existing global default brand (today's look), with nothing broken.

### User Story 2 - A Super User manages business units and their brands (Priority: P1)

A Super User opens an admin surface listing the business units. They can add a business unit, edit its brand (company/app name, short name, logo, primary color, accent color — pasting a hex code or using the swatch), rename it, and remove it (blocked while employees are still assigned). The three initial business units — Forefront Consulting, Visual Shift Consulting, Omnisight Analytics — are available from the start.

**Why this priority**: The brands must be manageable in-app for the feature to be usable and demoable; seeding the three known units makes it immediately real.

**Independent Test**: As a Super User, create a business unit, set its name/colors/logo, assign an employee to it, and confirm that employee now sees the new brand. Rename it and confirm the change follows. Attempt to delete a unit with employees assigned and confirm it is blocked with a clear reason.

**Acceptance Scenarios**:

1. **Given** I am a Super User, **When** I open the business units admin surface, **Then** I see all business units and can add, edit, rename, or remove them.
2. **Given** a business unit with employees assigned, **When** I try to remove it, **Then** the system blocks it and tells me employees are still assigned.
3. **Given** I set a business unit's primary/accent color by pasting a hex code, **When** I save, **Then** every user in that business unit is re-themed with those colors.
4. **Given** I am an HR Admin (not Super User), **When** I try to reach the business units admin surface, **Then** I am denied (managing brands is a Super User governance action).

### User Story 3 - HR assigns an employee to a business unit (Priority: P1)

HR sets an employee's business unit on the admin employee create/edit form (a single-select of the managed business units), on the registry grid (inline, like other fields), and via CSV import/export (a "Business Unit" column, matched by name, tolerant like department). The assignment is HR-managed; the employee does not choose it.

**Why this priority**: Without a way to assign the business unit, no one gets a brand. The three input paths mirror how department is already managed.

**Independent Test**: Assign a business unit to an employee via the edit form; confirm it persists and re-themes them. Change it via the grid; confirm it updates. Export the registry, edit the Business Unit column, re-import, and confirm the assignment round-trips.

**Acceptance Scenarios**:

1. **Given** the employee create/edit form, **When** HR selects a business unit and saves, **Then** the employee is assigned to it.
2. **Given** the registry grid, **When** HR changes an employee's business unit cell, **Then** it saves like any other field.
3. **Given** a CSV export of employees, **When** HR fills the Business Unit column and re-imports, **Then** each employee's business unit is updated by name (an unknown name is flagged, not silently dropped, consistent with department handling).
4. **Given** an employee is reassigned to a different business unit, **When** they next load the app, **Then** their brand reflects the new business unit.

### User Story 4 - Impersonation shows the target's brand (Priority: P2)

When a Super User uses "View as employee" (the existing impersonation feature) to view as an employee, the app also shows that employee's **business-unit brand**. This lets all business-unit looks be demoed from a single login, and makes an impersonated session an accurate reproduction of what that employee sees.

**Why this priority**: High-value for demos and support, but the feature is complete and valuable without it; it is an enhancement that composes with User Story 1.

**Independent Test**: As a Super User, impersonate an employee in each of the three business units and confirm the brand (name, logo, colors) matches each target while the impersonation banner remains visible; exit and confirm the Super User's own brand returns.

**Acceptance Scenarios**:

1. **Given** I am a Super User viewing as an employee in "Omnisight Analytics", **When** the app renders, **Then** I see Omnisight's brand and the impersonation banner.
2. **Given** I exit impersonation, **When** I return to the admin, **Then** my own business unit's brand (or the default) returns.

### Edge Cases

- **No business unit assigned** → the global default brand is shown (fail-safe to today's look); the app never renders unbranded or broken.
- **Business unit exists but has no custom colors/logo/name** → fall back to the default for the unset attributes (e.g., default colors if none chosen), never a blank name or missing logo.
- **Employee reassigned or business unit's brand edited** → the new brand takes effect on the next load without needing to sign out.
- **Business unit deletion while employees are assigned** → blocked with a clear message (mirrors department removal).
- **Duplicate business unit name** → rejected (case-insensitive), mirroring department naming rules.
- **Pre-authentication surfaces** (the sign-in page) → show the default brand, since the viewer's business unit is not yet known.
- **Installable app (PWA) name/icon** → remains the single deployment default; only the in-app name/logo/colors vary per user (documented limitation for this phase).
- **Transactional emails** → keep the default brand for now (per-recipient business-unit branding is future work).
- **Colors chosen for a business unit** → readability/contrast are the operator's responsibility, consistent with the existing brand editor (the palette is auto-expanded from the two base colors as today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST introduce a managed **Business Unit** entity with, per unit: a company/app name, a short name, an optional logo, a primary color, and an accent color.
- **FR-002**: The system MUST allow a Super User to add, edit, rename, and remove business units and edit each unit's brand attributes (name, short name, logo, primary color, accent color), with colors settable by pasting a hex code or using a color swatch.
- **FR-003**: The system MUST reject a business unit name that duplicates an existing one (case-insensitive) and MUST block removal of a business unit while any employee is assigned to it, with a clear reason.
- **FR-004**: The system MUST let HR assign each employee to **exactly one** business unit (optional/nullable), as a field distinct from department, via (a) the admin employee create/edit form, (b) the registry grid inline edit, and (c) CSV import/export by business-unit name (tolerant; unknown names flagged, not dropped) — mirroring how department is managed today.
- **FR-005**: The system MUST render the app's visual identity — company/app name, logo, page title, and color theme — according to the **viewing user's own business unit** on every authenticated screen, for all roles (Employee, HR Admin, Finance, Super User).
- **FR-006**: The system MUST fall back to the existing global default brand when the viewing user has no business unit, or when the business unit leaves a brand attribute unset — with no visual breakage.
- **FR-007**: The system MUST NOT change any user's **function, permissions, or data visibility** based on business unit. Admin, HR, and Finance users continue to see and manage **all** employees across every business unit exactly as before; business unit affects **appearance only**.
- **FR-008**: When a Super User is impersonating an employee ("View as employee"), the system MUST render the **impersonated employee's** business-unit brand (while keeping the impersonation banner), and MUST restore the actor's own brand (or default) on exit.
- **FR-009**: The system MUST apply a change to an employee's business unit, or to a business unit's brand, on the affected users' next app load without requiring sign-out.
- **FR-010**: The system MUST seed the three initial business units — **Forefront Consulting**, **Visual Shift Consulting**, **Omnisight Analytics** — with Forefront Consulting reflecting the current default brand.
- **FR-011**: The system MUST keep the existing global default brand (spec 011) intact as the fallback brand and MUST NOT require every employee to have a business unit for the app to function.

### Out of Scope (this phase — theming only)

- **OOS-001**: No data isolation between business units. One shared employee directory, one benefits configuration, one set of admin surfaces; every employee remains visible to every other employee and to all admins, exactly as today.
- **OOS-002**: No per-business-unit benefits configuration, pool ceilings, medical rate card, catalog, or money rules. All benefits math and configuration remain global and unchanged.
- **OOS-003**: No per-business-unit directory filtering, reporting, or scoping.
- **OOS-004**: The installable PWA manifest (home-screen name and icon) remains the single deployment default; it does not vary per business unit.
- **OOS-005**: The sign-in page and other pre-authentication surfaces remain on the default brand.
- **OOS-006**: Transactional (benefit-claim) emails remain on the default brand.
- These are future work; most fold into the full multi-tenancy of spec 022.

### Key Entities

- **Business Unit**: A group company that an employee belongs to and whose brand the employee (and any admin in it) sees. Attributes: name (company/app name, unique), short name, optional logo, primary color, accent color. Relationship: one Business Unit has many employees; each employee has at most one Business Unit. Distinct from **Department** (an org-structure label) — the two are independent axes.
- **Employee (User)**: Gains an optional single reference to a Business Unit. Everything else about the employee is unchanged.
- **Default Brand**: The existing global brand (spec 011 `BrandSettings`), retained as the fallback shown to users with no business unit and on pre-auth surfaces.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Two employees assigned to two different business units each see their own company name, logo, and colors across 100% of authenticated pages, and never the other's brand.
- **SC-002**: A Super User can create a business unit, set its brand, and assign an employee to it, after which that employee's app reflects the new brand on their next load — completed in under 3 minutes without engineering help.
- **SC-003**: An employee with no business unit, and every user on a fresh/un-migrated database, sees exactly today's default brand with no visual breakage (zero regressions to the current look).
- **SC-004**: Admin, HR, and Finance users can still view and manage every employee across all business units — no reduction in what they can see or do — verified against the pre-feature behavior.
- **SC-005**: Impersonating an employee shows that employee's business-unit brand in 100% of cases, and exiting restores the actor's brand.
- **SC-006**: Changing an employee's business unit, or a business unit's colors, is reflected for affected users within one app load, with no sign-out required.

## Assumptions

- The existing brand theming mechanism (two base colors auto-expanded into a full navy/gold-style tint/shade scale, injected app-wide; spec 011) and the hex-code color entry (added 2026-08-14) are reused per business unit — no new theming engine is introduced.
- Business unit is HR-managed and optional; existing employees remain valid with no business unit and simply see the default brand until assigned.
- Department remains a separate, independent field; business unit does not replace or derive from it.
- Color contrast/readability for a business unit's chosen colors is the operator's responsibility, consistent with the current brand editor.
- Logos are stored using the same private file mechanism as the existing brand logo, served through the app's authorized route.
- This feature is a stepping stone to spec 022 (full multi-tenancy); the Business Unit concept is expected to graduate into that model, so its shape should not contradict spec 022's Organization concept.
- No change to authentication, roles, or the company-domain sign-in behavior.
