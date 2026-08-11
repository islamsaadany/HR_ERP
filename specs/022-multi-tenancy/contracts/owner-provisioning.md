# Contract — Platform Owner Provisioning

The cross-org capability held by group IT (`Role.OWNER`). Lives under `src/app/(owner)/**` +
`src/lib/org.ts`, guarded by `requireOwner()`, and uses the **raw** Prisma client (it operates on
`Organization`, not tenant data). All actions are server-authoritative and audited.

## Actions

### createOrganization(input)
- **Input**: `name`, `shortName`, `slug` (unique), `allowedDomains: string[]`, optional branding
  (`logoUrl`, `primaryColor`, `accentColor`).
- **Effect**: creates an `Organization` (status `ACTIVE`) and seeds its **default per-org config**:
  empty module flags (all enabled unless set), a `NotificationSettings` row, a `MedicalRateCard`
  row (placeholder), no plan year yet.
- **Guards**: `requireOwner()`; `slug`/`allowedDomains` well-formed and not colliding.
- **Returns**: the new `orgId`.

### createFirstAdmin(orgId, input)
- **Input**: `name`, `email`, temporary password (or auto-generate).
- **Effect**: creates a `User` in that org with `role = HR_ADMIN` (or `SUPER_USER`) and
  `mustChangePassword = true`; email is globally unique (rejected if taken).
- **Guards**: `requireOwner()`; org exists and is `ACTIVE`.
- **Returns**: the one-time temporary password (shown once), mirroring the existing admin-password flow.

### setOrganizationBranding(orgId, branding) / setAllowedDomains(orgId, domains)
- **Effect**: updates the org's branding / sign-in domains. Isolated to that org.

### setOrganizationStatus(orgId, ACTIVE|SUSPENDED)
- **Effect**: SUSPENDED blocks that org's users from signing in; data is preserved. Reversible.
- **Guards**: `requireOwner()`; an org cannot suspend the owner's own access to the console.

## Non-goals (this phase)
- Owner does **not** browse a tenant's operational data through the console; any such access would be
  an explicit, audited "act within org" action (future). No org hard-delete. No self-serve signup.

## UI
The owner console is new UI → **navy/gold mockup + sign-off + `ui-versions/` snapshot before build**
(Constitution II). Minimal surface: org list, create-org form, org detail (branding/domains/status),
create-first-admin.
