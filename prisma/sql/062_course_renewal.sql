-- HR_ERP — Learning Track: optional per-course renewal (spec 038 follow-up, 2026-08-21).
--
-- WHY
--   Completion was permanent. Some training genuinely needs redoing on a cycle, so a course may
--   now carry a renewal period in months. NULL — the default, and what every existing course gets
--   — means permanent, exactly as before.
--
-- HOW LAPSING WORKS (worth knowing before reading anything else)
--   Lapsing is DERIVED from the completion date against the course's period, never stored as a
--   flag and never driven by a scheduled job. So there is nothing to miss, nothing to run twice,
--   and no midnight sweep that can leave half the company in the wrong state. A learner's lesson
--   ticks are cleared only when they actually reopen the lapsed course to redo it.
--
-- SAFETY
--   Two additive nullable/defaulted columns on tables created by 060. No back-fill: every existing
--   course keeps permanent completion, and completionCount starts at 0 for historic rows, which is
--   honest — we do not know how many times they were completed before this column existed.
--
-- ORDER: run after 061.

ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "renewAfterMonths" INTEGER;
ALTER TABLE "CourseEnrollment" ADD COLUMN IF NOT EXISTS "completionCount" INTEGER NOT NULL DEFAULT 0;
