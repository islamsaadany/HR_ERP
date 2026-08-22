-- HR_ERP — A Learning manager appointment (spec 038 follow-up, 2026-08-22).
--
-- WHY
--   Someone should be able to build and run training without becoming an HR Admin. Holding a row
--   here opens Admin → Learning and nothing else — no employee records, no salaries, no benefits,
--   no leave.
--
-- WHY A TABLE AND NOT A `Role` MEMBER
--   A new Role member would be a value every OTHER module's check has to be right about, forever.
--   An appointment is inert: `canManageLearning` is the only thing that reads it, the person stays
--   an EMPLOYEE, and the employee form does not change. Nothing can leak because there is nothing
--   new for another check to misread.
--
--   HR Admins and Super Users are deliberately NOT rows here — they hold Learning because they
--   hold everything. `canManageLearning` unions the two, so emptying this table can never lock HR
--   out of the module.
--
-- SAFETY
--   One new table. Nothing existing is altered and there is no back-fill: with no rows, behaviour
--   is exactly what it is today (HR Admin / Super User only). Idempotent.
--
-- THE `updatedAt` DIFF: not applicable — this table has no `updatedAt`.
--
-- ORDER: run after 064.

CREATE TABLE IF NOT EXISTS "LearningManager" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "appointedById" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningManager_pkey" PRIMARY KEY ("id")
);

-- One appointment per person: appointing twice is a no-op, not a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS "LearningManager_userId_key" ON "LearningManager" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearningManager_userId_fkey') THEN
    ALTER TABLE "LearningManager" ADD CONSTRAINT "LearningManager_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearningManager_appointedById_fkey') THEN
    ALTER TABLE "LearningManager" ADD CONSTRAINT "LearningManager_appointedById_fkey"
      FOREIGN KEY ("appointedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
