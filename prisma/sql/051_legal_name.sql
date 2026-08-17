-- HR_ERP — Legal name on the employee record (My Profile unified attributes, 2026-08-17).
--
-- WHY
--   Employees need somewhere to record their full official name exactly as written on their
--   national ID — the platform display name is HR-managed and often shorter/anglicised. The
--   employee types it himself on My Profile (like phone: direct save, no HR review); HR can
--   see and correct it on the admin employee form. It never appears in the Team Directory,
--   and nothing money-related reads it.
--
-- SAFETY
--   Purely additive: one nullable text column, no backfill, nothing existing is read or changed.
--
-- ORDER: run after 050.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "legalName" text;
