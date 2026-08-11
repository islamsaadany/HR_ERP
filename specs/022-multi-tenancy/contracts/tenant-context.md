# Contract — Tenant Context & Scoped Data Access

The internal contract every server component, server action, and route handler in the tenant app
(`src/app/(app)/**`, tenant `src/app/api/**`) MUST follow. This is the isolation guarantee.

## Session/auth contract

- The NextAuth token and session carry **`orgId`** alongside `id` and `role` (stamped in the `jwt`
  callback from `User.orgId`; exposed in the `session` callback).
- `requireUser()` → `{ id, orgId, role, name, email }`. `requireAdmin()/requireSuperUser()/
  requireFinance()` additionally assert the role **and** return `orgId`.
- `requireOwner()` → asserts `role === OWNER`; used only by the `(owner)/` console. It does **not**
  return a tenant `orgId` (OWNER is cross-org).
- A user whose `Organization.status === SUSPENDED` cannot obtain a session (sign-in denied).

## Data-access contract

- Tenant code obtains its client via **`getTenantDb(orgId)`** (from `src/lib/tenant.ts`), never the
  raw `prisma` client. The tenant client:
  - injects `where: { orgId }` on reads and `data: { orgId }` on writes for tenant models;
  - wraps each operation in a transaction that first runs `SET LOCAL app.current_org = <orgId>` so
    RLS is enforced.
- **Prohibited**: importing the raw `prisma` client in tenant code. Allowed raw-client users:
  `src/lib/auth.ts` (login/bootstrap), `src/lib/org.ts` + `(owner)/**` (org CRUD), and migrations.
  A static check (grep/lint) enforces this (SC-003).

## Referential-write contract

When a server action sets a cross-record id (`reportsToId`, `approverId`, `reviewedById`,
`paidById`, `committedById`, `releasedById`, benefit-config FKs, document `ownerId`), it MUST
resolve that id **through the tenant client** — so an id from another org is invisible and the write
fails closed. Lists that feed such selectors (manager dropdown, approver pick) MUST be tenant-scoped.

## Route-handler contract (files/exports)

`api/documents/[id]`, `api/claims/[id]/proof`, `api/knowledge/[id]/attachment`,
`api/resources/[id]`, and both CSV exports MUST load their target through the tenant client (so a
foreign-org id 404s) in addition to the existing role/owner check. The unauthenticated
`api/brand/logo` route is platform-generic (login screen) and serves no tenant data.

## Invariant (what the leakage probe verifies)

> For any signed-in user with `orgId = X`, no code path — list, detail-by-id, search, export, file
> route, or config read — returns a row whose `orgId ≠ X`, even if the query omits an explicit
> filter (RLS blocks it). See `quickstart.md`.
