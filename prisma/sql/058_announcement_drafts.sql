-- 058 — Save an announcement draft without sending it (spec 037 follow-up).
-- Applied automatically by the Vercel build; idempotent.
--
-- HR edits the generated wording over several sittings. Until now the only way to keep an
-- edit was to send it. These three columns hold the work in progress; the composer opens
-- with them when they are set, and clears them once the announcement actually goes out.

ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "draftSubject" TEXT;
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "draftBodyEn"  TEXT;
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "draftBodyAr"  TEXT;
