-- HR_ERP — Learning Track: remember a lesson video's real length (2026-08-21).
--
-- WHY
--   Authors were typing a lesson's length by hand, including in the upload template. The player
--   already knows the true length the moment anyone presses play, so the platform learns it instead
--   of asking.
--
--   The alternative — asking Vimeo/YouTube at save time — was measured and rejected for YouTube:
--   its free oEmbed endpoint returns title, author and thumbnail but NO duration, so it would need
--   the YouTube Data API, a Google Cloud project and an API key. (Vimeo's oEmbed does return it,
--   free. If YouTube durations ever need to appear before the first view, that key is the price.)
--
-- SAFETY
--   One nullable column on a table created by 060. Additive, idempotent, no back-fill — NULL simply
--   means "nobody has played this yet", which is exactly true for every existing lesson.
--
-- ORDER: run after 062.

ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "videoDurationSec" INTEGER;
