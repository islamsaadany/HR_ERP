-- HR_ERP — Designate a default business unit (branding follow-up).
-- Adds BusinessUnit.isDefault; the unit marked default is the fallback brand for
-- unassigned users, sign-in, and the app icon (replaces the separate default-brand
-- section). At most one unit is default (enforced by the app's "Make default"
-- action). Additive, non-destructive, idempotent. No unit is default until set —
-- until then the app falls back to the BrandSettings default as before.
BEGIN;
ALTER TABLE "BusinessUnit" ADD COLUMN IF NOT EXISTS "isDefault" boolean NOT NULL DEFAULT false;
COMMIT;
