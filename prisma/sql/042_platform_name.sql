-- HR_ERP — Branding: separate the platform (display) name from the company name.
-- Adds a nullable `platformName` to the default brand + each business unit. It is
-- what shows in-app (the wordmark, page title, PWA name); when blank, the app
-- falls back to the official company name (existing behavior). `shortName` stays
-- the eyebrow. Additive, non-destructive, idempotent.
BEGIN;

ALTER TABLE "BrandSettings" ADD COLUMN IF NOT EXISTS "platformName" text;
ALTER TABLE "BusinessUnit"  ADD COLUMN IF NOT EXISTS "platformName" text;

COMMIT;
