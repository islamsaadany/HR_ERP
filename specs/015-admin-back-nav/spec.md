# Feature Specification: Consistent Admin Back Navigation

**Feature Branch**: `015-admin-back-nav`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Add a consistent back link at the top of every Admin-area page so users can step back one level in the structure (breadcrumb-style, NOT browser history). Reuse the existing '←' style already on /admin/modules; consolidate the scattered ad-hoc back links into one shared pattern that points each page at its immediate parent."

## Clarifications

### Decisions already made (do not re-open)

- **Step up one level (structural), not browser back.** Each admin page's back link points to its
  **logical parent** in the admin hierarchy — always the same destination regardless of how the user
  arrived. (Not `history.back()`.)
- **Reuse the existing style.** The link uses the exact "←" back-link style already on `/admin/modules`
  (`text-sm text-muted hover:text-ink`). This is **not** a redesign — no new visual language, colors,
  spacing, or placement conventions; just applying the existing pattern everywhere.
- **Scope is the Admin area only.** Employee-facing (non-admin) pages are untouched.
- **Consolidate.** Replace the scattered ad-hoc back links (Modules, CSV Import, Release a benefit,
  Knowledge new/edit) with **one shared small component/pattern** so every admin page uses the same
  thing and each points at its immediate parent.
- **The Admin home is the root** — it needs no back link (it is the top of the admin hierarchy).
- **The Departments page already has the link** (spec 014); it adopts the shared component too so all
  pages are uniform.

### Parent map (the "one level up" destination per page)

| Admin page | Back goes to |
|------------|--------------|
| `/admin` (home) | *(root — no back link)* |
| `/admin/employees` | `/admin` |
| `/admin/employees/new` | `/admin/employees` |
| `/admin/employees/[id]` (edit) | `/admin/employees` |
| `/admin/employees/import` | `/admin/employees` |
| `/admin/onboarding` | `/admin` |
| `/admin/onboarding/new` · `/admin/onboarding/[id]` | `/admin/onboarding` |
| `/admin/handbook` | `/admin` |
| `/admin/handbook/new` · `/admin/handbook/[id]` | `/admin/handbook` |
| `/admin/knowledge` | `/admin` |
| `/admin/knowledge/new` · `/admin/knowledge/[id]` | `/admin/knowledge` |
| `/admin/benefits` | `/admin` |
| `/admin/benefits/release` | `/admin/benefits` |
| `/admin/time-off` | `/admin` |
| `/admin/announcements` | `/admin` |
| `/admin/brand` | `/admin` |
| `/admin/modules` | `/admin` |
| `/admin/departments` | `/admin` |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Step back from a deep admin page (Priority: P1)

An admin editing an employee sees a back link at the top of the page that returns them to the Employees
list; from the Employees list, a back link returns them to the Admin home. The destination is always
the structural parent, no matter how they navigated in.

**Why this priority**: The whole point — reliable "one level up" navigation from anywhere in the admin
area, so users are never stranded on a deep page.

**Independent Test**: Open `/admin/employees/[id]` via a direct link, click back → land on
`/admin/employees`. Click back again → land on `/admin`.

**Acceptance Scenarios**:

1. **Given** any nested admin page (new/edit/import/release), **When** the user clicks the back link, **Then** they land on that page's section list (its immediate parent), not the Admin home and not the previous browser page.
2. **Given** any top-level admin section page, **When** the user clicks the back link, **Then** they land on the Admin home (`/admin`).
3. **Given** the user reached a page via a direct URL (no prior in-app history), **When** they click back, **Then** they still land on the structural parent (proving it is not browser-history based).

### User Story 2 - Consistent placement and style everywhere (Priority: P1)

Every admin page (except the Admin home) shows the back link in the same place and the same style as the
existing `/admin/modules` link. Nothing about the link's appearance changes from today's pattern.

**Why this priority**: Consistency is the deliverable; a back link that looks or sits differently per
page would be its own confusion.

**Independent Test**: Visit each admin page and confirm the back link is present, in the same position
(above the section eyebrow/title), using the same muted "←" style.

**Acceptance Scenarios**:

1. **Given** any admin page other than the Admin home, **When** it renders, **Then** a back link appears using the existing `/admin/modules` style and placement.
2. **Given** the pages that previously had ad-hoc back links (Modules, CSV Import, Release a benefit, Knowledge new/edit), **When** they render, **Then** they use the shared component and their destination follows the parent map (no duplicate or conflicting back links remain).
3. **Given** the Admin home, **When** it renders, **Then** no back link is shown.

### Edge Cases

- **A page that previously linked back to the wrong level** (e.g. Import or Release linking to `/admin`
  instead of its section) — corrected to the parent map so it steps back exactly one level.
- **Deep dynamic routes** (`[id]`, `[slug]`) — the back link uses the static section path, not the
  dynamic segment, so it always resolves to the section list.
- **A future new admin page** — the shared component makes "add a back link to my parent" a one-line
  inclusion, reducing the chance a new page ships without one.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every Admin-area page **except the Admin home** MUST display a back link that navigates to
  that page's **structural parent** per the parent map.
- **FR-002**: The back link MUST navigate by **explicit destination path** (structural), NOT by browser
  history; the destination MUST be identical regardless of how the user reached the page.
- **FR-003**: The back link MUST use the **existing visual style and placement** from `/admin/modules`
  (a muted "←" link above the page's eyebrow/title). No new visual styling is introduced.
- **FR-004**: A **single shared component/pattern** MUST provide the back link; all admin pages MUST use
  it, and the previously scattered ad-hoc back links MUST be replaced by it (no duplicates).
- **FR-005**: The Admin home (`/admin`) MUST NOT display a back link.
- **FR-006**: Nested pages (create/edit/import/release under a section) MUST link back to their
  **section list**, and section pages MUST link back to the **Admin home**, per the parent map.
- **FR-007**: The change MUST be limited to the Admin area — no employee-facing page is altered.

### Key Entities

- *None — this is a navigation/UI consistency feature with no data model.*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **100% of admin pages except the Admin home** show a back link to the correct structural
  parent (verifiable by walking the parent map).
- **SC-002**: The back destination is **independent of navigation path** — arriving by direct URL vs.
  in-app link yields the same "up one level" target in 100% of cases.
- **SC-003**: **Zero** admin pages retain an ad-hoc/duplicate back link; all use the shared component.
- **SC-004**: The back link's appearance is **unchanged** from the existing `/admin/modules` pattern (no
  visual diff beyond presence/destination).
- **SC-005**: The Admin home shows **no** back link.

## Assumptions

- The existing `/admin/modules` back-link style (`text-sm text-muted hover:text-ink`, a leading "←") is
  the canonical pattern to reuse.
- Placement is above the page's existing eyebrow/title, matching the current Modules and Departments
  pages.
- Section labels in the link text may read "← Admin" for section→home and a section name (e.g.
  "← Employees") for nested→section, consistent with the existing "← Admin" convention; exact wording is
  an implementation detail that does not change the visual style.
- No routing/layout framework change is required; the shared component is a small presentational element
  dropped into each page.
