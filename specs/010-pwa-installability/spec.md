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

### User Story 2 — Actually use it from a phone (Priority: P1, added 2026-08-25)
An employee opens the installed app on their phone, taps into Time-Off, and then wants Benefits.
They open the menu and go straight there — the same sections a desktop shows, in the same order.

**Independent Test**: at 390px wide, from any page, every section the person is entitled to is
reachable in two taps; the desktop layout at ≥768px is unchanged.

**Why P1, above the install story**: installability without navigation is a home-screen icon that
opens a dead end. Measured before this work: from `/time-off` at phone width, exactly two links
were tappable.

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

*Added 2026-08-25 (User Story 2):*
- **FR-006**: Below the `md` breakpoint the app MUST offer a navigation menu carrying **every**
  section the signed-in person is entitled to — the standard nav plus any appointment or admin
  entries — in the same order and with the same badge counts the desktop sidebar shows. At `md`
  and above the menu MUST NOT appear and the sidebar MUST be unchanged.
- **FR-007**: The menu MUST close on choosing a section, on its dismiss control, on the page
  behind it, on Escape, and on any navigation. While open, the page behind MUST NOT scroll.
- **FR-008**: Controls inside the menu MUST be at least 44×44 px.
- **FR-009**: The menu's entry button MUST indicate whether anything is waiting, derived from the
  **same** badge derivations the menu renders — never a separately computed count. It MUST show a
  single indicator, not a total: the header has room for the question, not seven answers.
- **FR-010**: Sign out and Switch account inside the menu MUST NOT close it from the submit
  button's own click handler — that unmounts the form before the browser dispatches `submit`, so
  the action silently never runs. They navigate, which unmounts the menu anyway.
- **FR-011**: Installed and run full-screen, no chrome may sit under the device's status bar and no
  content may run into its home indicator. The rules doing this MUST measure zero in a browser tab
  and on desktop.
- **FR-012**: The entries beyond the standard nav MUST have **one** definition shared by every
  surface that renders them (the collapsed rail, the expanded sidebar, the phone menu), so a module
  cannot reach one and be missing from another.

### Out of scope
- Re-laying-out individual pages for small screens. Wide data tables (the employee registry, the
  finance sheets) still scroll sideways inside their own container, as they do today. Making those
  comfortable on a phone is separate work.
- Any change to the desktop layout. This is additive below `md`, and the desktop sidebar's rendered
  output is asserted unchanged.

### Assumptions
- HTTPS is provided by Vercel (required for service workers / installability).
- The icon is a placeholder navy/gold "F"; a final brand logo can replace `public/icons/*` later.

## Success Criteria
- **SC-001**: Lighthouse/Chrome consider the app installable; the install prompt appears on the deploy.
- **SC-002**: Launched from the home screen, the app opens standalone with the Forefront icon.
- **SC-003** (2026-08-25): At 390px, from any page, every section the person is entitled to is
  reachable via the menu; a plain employee sees no admin or finance entry.
- **SC-004** (2026-08-25): The desktop sidebar renders **identically** before and after — asserted
  by screenshot comparison (expanded and collapsed) and by per-row geometry/colour measurement.

## Notes for a later session
- **Next 15 renders `appleWebApp.capable` as the modern `mobile-web-app-capable` meta**, not the
  deprecated Apple-prefixed one. Do not "add the missing Chrome tag" via `other:` — it was already
  there and you will emit it twice. Checked against served HTML, 2026-08-25.
- The service worker deliberately still caches nothing (FR-003). Offline support would mean caching
  authenticated pages, which is a decision about per-user data, not a performance tweak.
