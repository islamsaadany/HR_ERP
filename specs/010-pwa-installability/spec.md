# Spec 010 — PWA Installability (Add to Home Screen)

**Input**: "Can the platform be a web app people save on their mobiles?" — make Forefront HR
installable as a Progressive Web App so employees can add it to their phone home screen and
open it full-screen like a native app.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Install on a phone (Priority: P2)
An employee opens the app on their phone and installs it ("Install app" on Android Chrome, or
Share → "Add to Home Screen" on iOS Safari). It then launches full-screen with its own icon.

**Independent Test**: On the HTTPS deploy, the browser offers install; after installing, the app
opens standalone (no browser chrome) with the Forefront icon.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The app MUST ship a web manifest (`/manifest.webmanifest`) with name, short_name,
  `display: standalone`, a `start_url` (`/dashboard`), scope `/`, and navy theme/background colors.
- **FR-002**: The manifest MUST include PNG icons at 192 and 512 px plus a 512 px `maskable` icon.
- **FR-003**: The app MUST register a service worker so it meets install criteria. The worker MUST
  NOT cache authenticated page content (this is a per-user app) — it exists for installability only.
- **FR-004**: The document head MUST carry `theme-color`, the manifest link, an apple-touch-icon,
  and `mobile-web-app-capable` so iOS/Android treat it as an installable app.
- **FR-005**: No push notifications in v1 (consistent with the no-email rule).

### Assumptions
- HTTPS is provided by Vercel (required for service workers / installability).
- The icon is a placeholder navy/gold "F"; a final brand logo can replace `public/icons/*` later.

## Success Criteria
- **SC-001**: Lighthouse/Chrome consider the app installable; the install prompt appears on the deploy.
- **SC-002**: Launched from the home screen, the app opens standalone with the Forefront icon.
