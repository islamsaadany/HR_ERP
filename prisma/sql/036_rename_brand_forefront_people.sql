-- HR_ERP — Rename platform: "Forefront HR" → "Forefront People".
-- Updates the live BrandSettings singleton so the running deployment shows the
-- new name immediately (sidebar, mobile header, sign-in, <title>, PWA manifest).
-- Only rewrites the row if it is still the old default, so a custom name a
-- super user set at Admin → Brand is left untouched. Idempotent.
BEGIN;

-- Ensure the singleton exists (no-op if the table was seeded already).
INSERT INTO "BrandSettings" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;

UPDATE "BrandSettings"
   SET "companyName" = 'Forefront People',
       "updatedAt"   = now()
 WHERE "id" = 'singleton'
   AND "companyName" = 'Forefront HR';

COMMIT;
