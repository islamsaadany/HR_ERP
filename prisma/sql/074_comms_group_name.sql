-- HR_ERP — the group name on communications emails (2026-08-25).
--
-- WHAT
--   One nullable column on the NotificationSettings singleton.
--
-- WHY
--   The small-caps line above the business unit on every email read
--   `BrandSettings.companyName` — the name of the PLATFORM, which is "Forefront Consulting". The
--   group above the units is a different thing and is called "Forefront Group". Sharing one column
--   meant the only way to correct the email header was to rename the whole application, including
--   the sign-in page.
--
--   Left NULL rather than back-filled: `groupName()` falls back to "Forefront Group", so an
--   untouched database gets the right answer without this file having to guess at one. An operator
--   who sets it takes over from the fallback.
--
-- SAFETY
--   Additive, nullable, idempotent. Nothing existing is altered and no row is written.

ALTER TABLE "NotificationSettings" ADD COLUMN IF NOT EXISTS "groupName" TEXT;
