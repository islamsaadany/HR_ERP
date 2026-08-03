# Spec 011 — Branding (White-label per company)

**Input**: The platform will serve several of our companies (one deployment per company for now).
Each needs its own **branding** — company name, logo, and brand colors — without a code change.
Data stays single-tenant per deployment; this spec covers branding only (not multi-tenant data).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Set our company's identity (Priority: P1)
A Super User opens Brand settings, sets the company name, uploads a logo, and picks two brand
colors (primary + accent). The whole app immediately reflects them — sidebar, sign-in, and the
installable app name.

**Independent Test**: Change name/logo/colors in Admin → Brand; the sidebar, sign-in page, browser
tab, and PWA name update accordingly.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: A single `BrandSettings` record MUST hold company name, short name, optional logo URL,
  and two base colors (primary, accent). It MUST default to Forefront (navy `#0f2444` / gold `#c9a227`).
- **FR-002**: Super User MUST be able to edit these in an Admin → Brand screen; the logo uploads to
  Vercel Blob (existing pattern). HR Admin (non-super) MAY view but not change (governance).
- **FR-003**: The **primary** and **accent** base colors MUST each be expanded into a full tint/shade
  scale and applied by overriding the theme CSS variables — re-theming the entire UI (the existing
  `navy-*` = primary, `gold-*` = accent utilities) with **no per-component changes**.
- **FR-004**: When the colors equal the Forefront defaults, the app MUST render **byte-for-byte** as
  today (no override injected) — the navy/gold design is preserved unless a company opts to change it.
- **FR-005**: The company name MUST appear in the sidebar, the sign-in page, the browser tab title,
  and the PWA manifest name; the logo (when set) MUST replace the wordmark in the sidebar + sign-in.
- **FR-006**: The PWA `theme_color` MUST follow the brand primary color.
- **FR-007**: All brand config is server-read; only Super User writes it.

### Key Entities
- **BrandSettings** (singleton): companyName, shortName, logoUrl?, primaryColor, accentColor.

### Assumptions
- One deployment per company (separate DB) — data isolation is by deployment, not by tenant column.
- Color scales are generated from one base each (hue/character from the base, tonal structure from the
  original navy/gold ramps). The app icon stays the generated "F" for now; a logo→icon pipeline is later.

## Success Criteria
- **SC-001**: Setting a primary + accent visibly rebrands the app (sidebar, buttons, highlights).
- **SC-002**: With defaults unchanged, the UI is identical to the current navy/gold look.
