# Quickstart — Validating Multi-Tenancy

How to prove the feature works end-to-end and, above all, that **nothing leaks between orgs** and
the existing org is unaffected. Run these after each phase reaches a testable point. This is a
validation guide — implementation lives in `tasks.md`.

## Prerequisites
- A throwaway local Postgres (as used for specs 032/033) with the full `prisma/sql` chain applied,
  including the new multi-tenancy migrations.
- `npx tsc --noEmit` and `npm run build` green.
- Two organizations seeded: **Org A** (the migrated Forefront = Organization #1) and **Org B** (new,
  via the owner console), each with an admin and a couple of employees + benefits config.

## Scenario 1 — Existing org unaffected (SC-004)
1. Apply the migrations to a copy of representative single-org data.
2. Sign in as an existing Forefront user.
3. **Expect**: identical data and branding to before; every list/detail matches pre-migration.
   Confirm counts (employees, claims, leave) are unchanged.

## Scenario 2 — Create a tenant in < 10 min (SC-001)
1. Sign in as the platform **OWNER**; open the console.
2. Create **Org B** (name, short name, slug, allowed domain, branding).
3. Create Org B's first HR admin; capture the one-time temporary password.
4. Sign in as that admin.
5. **Expect**: an empty Org B workspace themed with Org B branding; forced password change; **no**
   Forefront data anywhere.

## Scenario 3 — Isolation probe (SC-002, SC-003) — the critical test
As an **Org A** admin, attempt to reach **Org B** data by every path; each must **deny or return
only Org A data**:
1. Lists: employees, directory, claims, leave, knowledge, handbook, resources, announcements,
   incentive cycles → only Org A rows.
2. Detail-by-id: open `/directory/<orgB-user-id>`, `/incentive/<orgB-cycle-id>`,
   `/admin/employees/<orgB-user-id>` → 404/deny.
3. File routes: `GET /api/documents/<orgB-doc-id>`, `/api/claims/<orgB-claim-id>/proof`,
   `/api/knowledge/<orgB-article-id>/attachment`, `/api/resources/<orgB-resource-id>` → 404/deny.
4. Exports: `/api/admin/employees/export`, `/api/admin/benefits/export` → contain only Org A rows.
5. Config: Org A sees only its brand, modules, notifications, medical rate card, plan year.
6. **RLS backstop**: run a deliberately unscoped `findMany` for a tenant model under Org A's context
   → returns only Org A rows (the GUC + policy block the rest).
7. Referential write: as Org A admin, try to set an Org A employee's manager / a leave approver /
   a claim reviewer to an **Org B** user id → rejected (foreign id invisible).

**Pass condition**: 100% of the above deny or scope correctly.

## Scenario 4 — Money rules per-org (SC-006)
1. Give Org A and Org B **different** pool ceilings / medical rate cards / plan years.
2. File a benefit claim as an employee in each.
3. **Expect**: each evaluation (pool ceiling, 50% cap, medical premium) uses only that employee's
   org config; no cross-org figure appears.

## Scenario 5 — Suspend an org
1. As OWNER, set Org B `SUSPENDED`.
2. **Expect**: Org B users cannot sign in; Org B data is intact; re-activating restores access.

## Static gate (SC-003)
- Grep/lint check: no tenant model is accessed off the raw `prisma` client outside
  `src/lib/auth.ts`, `src/lib/org.ts`, and `src/app/(owner)/**`.
