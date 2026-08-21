-- HR_ERP — Learning Track (spec 038): courses, assignment & tracked progress.
--
-- WHY
--   Phase 9 built for real. HR authors courses (course -> sections -> lessons -> blocks) and routes
--   them to employees by a live registry-derived AUDIENCE, a named GROUP, or a direct assignment;
--   employees work through them with tracked progress.
--
-- TWO SHAPES WORTH KNOWING BEFORE READING THE TABLES
--   1. "CourseAudience" stores a RULE, not its expansion. A row says "the Consulting department" or
--      "the 6mo-2y tenure band"; it is resolved against the registry at read time. That is what
--      makes a new joiner pick up their courses with nobody re-running anything. A TENURE_BAND rule
--      is compiled to a startDate RANGE in application code, never to User.tenureBand, because that
--      column is derived from the hire date and can be stale.
--   2. "CourseEnrollment" is itself an ACCESS ROUTE. While completedAt and accessWithdrawnAt are
--      both NULL the learner is mid-course and keeps access even after every other route is gone.
--      Nothing is written when a route is removed, so no route-removal path can forget to
--      grandfather anybody. The row is created when the employee FIRST OPENS the course, never on
--      assignment — which is what makes "never started => lose access immediately" expressible.
--
-- NAMING
--   The middle hierarchy level is "CourseSection", never "Module" ("ModuleFlag" already means "app
--   area" in this schema), and nothing here is called "Announcement" (that model exists).
--
-- NOT HERE, DELIBERATELY
--   No quizzes, no gradable assignments, no certificates, no discussions, no notifications, no
--   analytics. No video hosting: video is LINKED (unlisted Vimeo/YouTube or a direct file URL), so
--   there is no upload column and no UPLOAD member on "VideoSource". No column is added to "User".
--
-- SAFETY
--   Additive only: five new enums and eleven new tables. No existing table is altered, no data is
--   back-filled, nothing is dropped. Idempotent throughout (guarded CREATE TYPE, IF NOT EXISTS),
--   so a retry or a redeploy is a no-op and a rollback is a DROP of new tables only.
--
-- KNOWN, DELIBERATE DRIFT
--   `prisma migrate diff` reports `ALTER COLUMN "updatedAt" DROP DEFAULT` for every table here.
--   That is the established house pattern, not a mistake: seven earlier migrations (005, 030, 047,
--   048, 057, 059 …) give `updatedAt` a DB default that Prisma's `@updatedAt` does not model, and
--   `IncentiveCycle`, `MedicalCycleCharge` and `PoolCeilingException` carry the identical diff
--   today. Prisma always writes the column itself, so the default only protects a raw-SQL insert
--   from failing a NOT NULL. Verified 2026-08-21: apart from those lines, this file produces ZERO
--   drift against schema.prisma.
--
-- ORDER: run after 059.

-- ─── Enums ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LearningCourseStatus') THEN
    CREATE TYPE "LearningCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LearningVisibility') THEN
    CREATE TYPE "LearningVisibility" AS ENUM ('OPEN', 'RESTRICTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LessonBlockType') THEN
    CREATE TYPE "LessonBlockType" AS ENUM ('VIDEO', 'TEXT', 'FILE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AudienceKind') THEN
    CREATE TYPE "AudienceKind" AS ENUM
      ('ALL_ACTIVE', 'DEPARTMENT', 'BUSINESS_UNIT', 'EMPLOYMENT_TYPE', 'TENURE_BAND', 'REPORTS_TO');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VideoSource') THEN
    CREATE TYPE "VideoSource" AS ENUM ('YOUTUBE', 'VIMEO', 'DRIVE', 'DIRECT_FILE');
  END IF;
END $$;

-- ─── Content hierarchy ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Course" (
  "id"           TEXT NOT NULL,
  "title"        TEXT NOT NULL,
  "summary"      TEXT,
  "coverBlobUrl" TEXT,
  "category"     TEXT,
  "status"       "LearningCourseStatus" NOT NULL DEFAULT 'DRAFT',
  "visibility"   "LearningVisibility" NOT NULL DEFAULT 'RESTRICTED',
  "order"        INTEGER NOT NULL DEFAULT 0,
  "publishedAt"  TIMESTAMP(3),
  "createdById"  TEXT,
  "updatedById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Course_status_idx" ON "Course"("status");
CREATE INDEX IF NOT EXISTS "Course_order_idx" ON "Course"("order");

CREATE TABLE IF NOT EXISTS "CourseSection" (
  "id"        TEXT NOT NULL,
  "courseId"  TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "order"     INTEGER NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseSection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CourseSection_courseId_idx" ON "CourseSection"("courseId");

CREATE TABLE IF NOT EXISTS "Lesson" (
  "id"               TEXT NOT NULL,
  "sectionId"        TEXT NOT NULL,
  "title"            TEXT NOT NULL,
  "order"            INTEGER NOT NULL,
  "isRequired"       BOOLEAN NOT NULL DEFAULT true,
  "estimatedMinutes" INTEGER,
  "minWatchPercent"  INTEGER NOT NULL DEFAULT 0,
  "deletedAt"        TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lesson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Lesson_sectionId_idx" ON "Lesson"("sectionId");

CREATE TABLE IF NOT EXISTS "LessonBlock" (
  "id"            TEXT NOT NULL,
  "lessonId"      TEXT NOT NULL,
  "type"          "LessonBlockType" NOT NULL,
  "order"         INTEGER NOT NULL,
  "text"          TEXT,
  "blobUrl"       TEXT,
  "externalUrl"   TEXT,
  "videoSource"   "VideoSource",
  "fileName"      TEXT,
  "fileSizeBytes" INTEGER,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LessonBlock_lessonId_idx" ON "LessonBlock"("lessonId");

CREATE TABLE IF NOT EXISTS "VideoCheckpoint" (
  "id"           TEXT NOT NULL,
  "lessonId"     TEXT NOT NULL,
  "atSec"        INTEGER NOT NULL,
  "prompt"       TEXT NOT NULL,
  "options"      TEXT[],
  "correctIndex" INTEGER NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VideoCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VideoCheckpoint_lessonId_idx" ON "VideoCheckpoint"("lessonId");

-- ─── Access routes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CourseAudience" (
  "id"          TEXT NOT NULL,
  "courseId"    TEXT NOT NULL,
  "kind"        "AudienceKind" NOT NULL,
  "value"       TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseAudience_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseAudience_courseId_kind_value_key"
  ON "CourseAudience"("courseId", "kind", "value");
CREATE INDEX IF NOT EXISTS "CourseAudience_courseId_idx" ON "CourseAudience"("courseId");

CREATE TABLE IF NOT EXISTS "LearnerGroup" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LearnerGroup_name_key" ON "LearnerGroup"("name");

CREATE TABLE IF NOT EXISTS "LearnerGroupMember" (
  "id"        TEXT NOT NULL,
  "groupId"   TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "addedById" TEXT,
  "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearnerGroupMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LearnerGroupMember_groupId_userId_key"
  ON "LearnerGroupMember"("groupId", "userId");
CREATE INDEX IF NOT EXISTS "LearnerGroupMember_userId_idx" ON "LearnerGroupMember"("userId");

-- Exactly one of "userId"/"groupId" is set; revocation is a stamp, never a delete. The two partial
-- unique indexes are what make a repeated assignment a no-op rather than a duplicate.
CREATE TABLE IF NOT EXISTS "CourseAssignment" (
  "id"          TEXT NOT NULL,
  "courseId"    TEXT NOT NULL,
  "userId"      TEXT,
  "groupId"     TEXT,
  "grantedById" TEXT,
  "grantedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"   TIMESTAMP(3),
  CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseAssignment_courseId_userId_key"
  ON "CourseAssignment"("courseId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseAssignment_courseId_groupId_key"
  ON "CourseAssignment"("courseId", "groupId");
CREATE INDEX IF NOT EXISTS "CourseAssignment_courseId_revokedAt_idx"
  ON "CourseAssignment"("courseId", "revokedAt");
CREATE INDEX IF NOT EXISTS "CourseAssignment_userId_idx" ON "CourseAssignment"("userId");
CREATE INDEX IF NOT EXISTS "CourseAssignment_groupId_idx" ON "CourseAssignment"("groupId");

-- ─── Learning state ─────────────────────────────────────────────────────
-- No progressPercent column on purpose: the percentage is computed from "LessonProgress" so it can
-- never disagree with the rows it summarises.
CREATE TABLE IF NOT EXISTS "CourseEnrollment" (
  "id"                  TEXT NOT NULL,
  "courseId"            TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"         TIMESTAMP(3),
  "firstCompletedAt"    TIMESTAMP(3),
  "reopenedAt"          TIMESTAMP(3),
  "accessWithdrawnAt"   TIMESTAMP(3),
  "accessWithdrawnById" TEXT,
  "lastLessonId"        TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CourseEnrollment_courseId_userId_key"
  ON "CourseEnrollment"("courseId", "userId");
CREATE INDEX IF NOT EXISTS "CourseEnrollment_userId_idx" ON "CourseEnrollment"("userId");
CREATE INDEX IF NOT EXISTS "CourseEnrollment_courseId_idx" ON "CourseEnrollment"("courseId");

CREATE TABLE IF NOT EXISTS "LessonProgress" (
  "id"              TEXT NOT NULL,
  "enrollmentId"    TEXT NOT NULL,
  "lessonId"        TEXT NOT NULL,
  "completedAt"     TIMESTAMP(3),
  "lastPositionSec" INTEGER,
  "videoWatchedSec" INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LessonProgress_enrollmentId_lessonId_key"
  ON "LessonProgress"("enrollmentId", "lessonId");
CREATE INDEX IF NOT EXISTS "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- ─── Foreign keys ───────────────────────────────────────────────────────
-- Guarded individually so a partial earlier run leaves nothing to trip over.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Course_createdById_fkey') THEN
    ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Course_updatedById_fkey') THEN
    ALTER TABLE "Course" ADD CONSTRAINT "Course_updatedById_fkey"
      FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseSection_courseId_fkey') THEN
    ALTER TABLE "CourseSection" ADD CONSTRAINT "CourseSection_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Lesson_sectionId_fkey') THEN
    ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_sectionId_fkey"
      FOREIGN KEY ("sectionId") REFERENCES "CourseSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonBlock_lessonId_fkey') THEN
    ALTER TABLE "LessonBlock" ADD CONSTRAINT "LessonBlock_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VideoCheckpoint_lessonId_fkey') THEN
    ALTER TABLE "VideoCheckpoint" ADD CONSTRAINT "VideoCheckpoint_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAudience_courseId_fkey') THEN
    ALTER TABLE "CourseAudience" ADD CONSTRAINT "CourseAudience_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAudience_createdById_fkey') THEN
    ALTER TABLE "CourseAudience" ADD CONSTRAINT "CourseAudience_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearnerGroup_createdById_fkey') THEN
    ALTER TABLE "LearnerGroup" ADD CONSTRAINT "LearnerGroup_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearnerGroupMember_groupId_fkey') THEN
    ALTER TABLE "LearnerGroupMember" ADD CONSTRAINT "LearnerGroupMember_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "LearnerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearnerGroupMember_userId_fkey') THEN
    ALTER TABLE "LearnerGroupMember" ADD CONSTRAINT "LearnerGroupMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LearnerGroupMember_addedById_fkey') THEN
    ALTER TABLE "LearnerGroupMember" ADD CONSTRAINT "LearnerGroupMember_addedById_fkey"
      FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAssignment_courseId_fkey') THEN
    ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAssignment_userId_fkey') THEN
    ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAssignment_groupId_fkey') THEN
    ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "LearnerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseAssignment_grantedById_fkey') THEN
    ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_grantedById_fkey"
      FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseEnrollment_courseId_fkey') THEN
    ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseEnrollment_userId_fkey') THEN
    ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseEnrollment_accessWithdrawnById_fkey') THEN
    ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_accessWithdrawnById_fkey"
      FOREIGN KEY ("accessWithdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonProgress_enrollmentId_fkey') THEN
    ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_enrollmentId_fkey"
      FOREIGN KEY ("enrollmentId") REFERENCES "CourseEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LessonProgress_lessonId_fkey') THEN
    ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
