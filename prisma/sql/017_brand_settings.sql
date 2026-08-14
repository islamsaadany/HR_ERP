-- HR_ERP — Branding: single-row brand identity (name, logo, primary/accent colors).
-- Idempotent, runner-applied. Seeds the Forefront default row.
BEGIN;
CREATE TABLE IF NOT EXISTS "BrandSettings" (
  "id"           text PRIMARY KEY DEFAULT 'singleton',
  "companyName"  text NOT NULL DEFAULT 'Forefront People',
  "shortName"    text NOT NULL DEFAULT 'Forefront',
  "logoUrl"      text,
  "primaryColor" text NOT NULL DEFAULT '#0f2444',
  "accentColor"  text NOT NULL DEFAULT '#c9a227',
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now()
);
INSERT INTO "BrandSettings" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;
COMMIT;
