-- HR_ERP — Learning Track: store the reported video duration (spec 038 FR-027, T036).
--
-- WHY
--   The watch gate has to be decided on the SERVER, and until now the server knew how many seconds
--   a learner had watched but not how long the video was — so it could only refuse someone who had
--   watched nothing. Storing the duration the player reports lets it compare the ratio properly.
--
--   Worth being honest about in the schema as well as the code: the figure originates from the
--   client, so a determined learner who under-reports it can still pass. Reading the true duration
--   would mean calling Vimeo/YouTube. The gate is an honesty aid against clicking past training,
--   not an adversarial control.
--
-- SAFETY
--   One nullable column on a table created by 060. Additive, idempotent, no back-fill (NULL simply
--   means "no duration reported yet", which the gate treats as not-yet-satisfied).
--
-- ORDER: run after 060.

ALTER TABLE "LessonProgress" ADD COLUMN IF NOT EXISTS "videoDurationSec" INTEGER;
