-- HR_ERP — Learning Track: course documents, resources and ratings (spec 038 materials, 2026-08-22).
--
-- WHY
--   A course now carries three standard DOCUMENTS (outline, expanded outline, slides — only the
--   slides ever reach an employee) and a list of RESOURCES (books, articles, videos, courses,
--   links). Employees can suggest a resource; HR approves before it appears, which is what makes
--   the library grow without HR having to find everything themselves. Finishing a course asks for
--   a 1–5 rating.
--
-- ANONYMITY, honestly
--   "CourseRating" stores userId. It has to: it is the only way to avoid asking the same person
--   twice and to keep one person to one score. It is never exposed — HR sees the average and the
--   count. A renewal UPDATES the row rather than adding one, so nobody is counted twice.
--
-- SAFETY
--   Three new tables, three new enum types, and ONE additive defaulted column on CourseEnrollment.
--   Nothing existing is altered or back-filled. Idempotent throughout: enum creation is guarded by
--   a catalogue check, tables by IF NOT EXISTS.
--
-- THE `updatedAt` DIFF (expected, same as 060)
--   `prisma migrate diff` will report `ALTER COLUMN "updatedAt" DROP DEFAULT` for the three tables
--   here. That is the house pattern, not a mistake: every hand-written migration in prisma/sql
--   gives `updatedAt` a DB default that Prisma's `@updatedAt` does not model, so a raw INSERT
--   cannot fail on a missing timestamp.
--
-- ORDER: run after 063.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseDocumentSlot') THEN
    CREATE TYPE "CourseDocumentSlot" AS ENUM ('OUTLINE', 'EXPANDED_OUTLINE', 'SLIDES');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseResourceKind') THEN
    CREATE TYPE "CourseResourceKind" AS ENUM ('BOOK', 'ARTICLE', 'COURSE', 'VIDEO', 'LINK');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CourseResourceStatus') THEN
    CREATE TYPE "CourseResourceStatus" AS ENUM ('PENDING', 'PUBLISHED', 'DECLINED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "CourseDocument" (
  "id"           TEXT NOT NULL,
  "courseId"     TEXT NOT NULL,
  "slot"         "CourseDocumentSlot" NOT NULL,
  "blobUrl"      TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "contentType"  TEXT,
  "sizeBytes"    INTEGER,
  "uploadedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CourseResource" (
  "id"            TEXT NOT NULL,
  "courseId"      TEXT NOT NULL,
  "kind"          "CourseResourceKind" NOT NULL,
  "name"          TEXT NOT NULL,
  "url"           TEXT,
  "status"        "CourseResourceStatus" NOT NULL DEFAULT 'PUBLISHED',
  "order"         INTEGER NOT NULL DEFAULT 0,
  "suggestedById" TEXT,
  "reviewedById"  TEXT,
  "reviewedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CourseRating" (
  "id"              TEXT NOT NULL,
  "courseId"        TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "stars"           INTEGER NOT NULL,
  "completionIndex" INTEGER NOT NULL DEFAULT 1,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CourseRating_pkey" PRIMARY KEY ("id")
);

-- The finish panel (rating + suggest a resource) is answered or skipped per completion, so a
-- renewal asks again on its own with no flag to reset.
ALTER TABLE "CourseEnrollment"
  ADD COLUMN IF NOT EXISTS "ratingPromptDoneCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "CourseDocument_courseId_slot_key" ON "CourseDocument" ("courseId", "slot");
CREATE INDEX IF NOT EXISTS "CourseResource_courseId_status_idx" ON "CourseResource" ("courseId", "status");
CREATE INDEX IF NOT EXISTS "CourseResource_status_idx" ON "CourseResource" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "CourseRating_courseId_userId_key" ON "CourseRating" ("courseId", "userId");
CREATE INDEX IF NOT EXISTS "CourseRating_courseId_idx" ON "CourseRating" ("courseId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseDocument_courseId_fkey') THEN
    ALTER TABLE "CourseDocument" ADD CONSTRAINT "CourseDocument_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseDocument_uploadedById_fkey') THEN
    ALTER TABLE "CourseDocument" ADD CONSTRAINT "CourseDocument_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseResource_courseId_fkey') THEN
    ALTER TABLE "CourseResource" ADD CONSTRAINT "CourseResource_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseResource_suggestedById_fkey') THEN
    ALTER TABLE "CourseResource" ADD CONSTRAINT "CourseResource_suggestedById_fkey"
      FOREIGN KEY ("suggestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseResource_reviewedById_fkey') THEN
    ALTER TABLE "CourseResource" ADD CONSTRAINT "CourseResource_reviewedById_fkey"
      FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseRating_courseId_fkey') THEN
    ALTER TABLE "CourseRating" ADD CONSTRAINT "CourseRating_courseId_fkey"
      FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CourseRating_userId_fkey') THEN
    ALTER TABLE "CourseRating" ADD CONSTRAINT "CourseRating_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
