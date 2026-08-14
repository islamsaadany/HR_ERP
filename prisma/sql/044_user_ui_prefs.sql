-- HR_ERP — Per-user UI preferences (account-level grid column layout).
-- Adds User.uiPrefs (jsonb) holding namespaced UI prefs, e.g.
--   {"employees.columns":[{"key":"name","visible":true}, …]}
-- so the Employees grid column layout follows the person across browsers/devices.
-- Cosmetic only — never affects data access, roles, or money rules.
-- Additive, non-destructive, idempotent. Null until the user arranges columns.
BEGIN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uiPrefs" jsonb;
COMMIT;
