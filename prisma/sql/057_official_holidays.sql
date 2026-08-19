-- 057 — Official holidays: ranges, verification lifecycle, announcements (spec 037).
-- Paste into Neon's SQL editor after 056. Idempotent.
--
-- PublicHoliday grows from a single unique date into TWO date ranges: `original*` (what was
-- announced, frozen after creation) and `actual*` (where the holiday really lands — what all
-- working-day counting reads). A range rather than a date so a multi-day holiday like Eid is
-- ONE entry HR verifies and moves as a whole.
--
-- Existing rows carry over losslessly: original = actual = their stored date, status VERIFIED
-- (HR typed them deliberately) and source MANUAL, so counting behaves exactly as before.
-- The old `date` column is dropped ONLY after the backfill, and only if it is still there.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "HolidayStatus" AS ENUM ('TENTATIVE', 'VERIFIED', 'MOVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "HolidaySource" AS ENUM ('FETCHED', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AnnouncementKind" AS ENUM ('ORIGINAL', 'CORRECTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── PublicHoliday: new columns (nullable first so the backfill can fill them) ─
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "localName"      TEXT;
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "originalStart"  TIMESTAMP(3);
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "originalEnd"    TIMESTAMP(3);
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "actualStart"    TIMESTAMP(3);
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "actualEnd"      TIMESTAMP(3);
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "status"         "HolidayStatus" NOT NULL DEFAULT 'TENTATIVE';
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "source"         "HolidaySource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "verifiedAt"     TIMESTAMP(3);
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "PublicHoliday" ADD COLUMN IF NOT EXISTS "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ── Backfill from the old single date, then settle the pre-existing rows ──────
-- Guarded on the column still existing so re-running after the drop is a no-op.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'PublicHoliday' AND column_name = 'date'
  ) THEN
    EXECUTE '
      UPDATE "PublicHoliday"
         SET "originalStart" = COALESCE("originalStart", "date"),
             "originalEnd"   = COALESCE("originalEnd",   "date"),
             "actualStart"   = COALESCE("actualStart",   "date"),
             "actualEnd"     = COALESCE("actualEnd",     "date"),
             "status"        = ''VERIFIED''::"HolidayStatus",
             "source"        = ''MANUAL''::"HolidaySource",
             "verifiedAt"    = COALESCE("verifiedAt", "createdAt")
       WHERE "actualStart" IS NULL';
  END IF;
END $$;

-- Anything still unfilled would be a row created between the ALTERs and the backfill —
-- there is no such write path, but leaving NULLs would break the NOT NULL below loudly
-- rather than silently, which is the intent.
ALTER TABLE "PublicHoliday" ALTER COLUMN "originalStart" SET NOT NULL;
ALTER TABLE "PublicHoliday" ALTER COLUMN "originalEnd"   SET NOT NULL;
ALTER TABLE "PublicHoliday" ALTER COLUMN "actualStart"   SET NOT NULL;
ALTER TABLE "PublicHoliday" ALTER COLUMN "actualEnd"     SET NOT NULL;

-- ── Drop the old single-date column and its unique index ─────────────────────
DROP INDEX IF EXISTS "PublicHoliday_date_key";
ALTER TABLE "PublicHoliday" DROP COLUMN IF EXISTS "date";

CREATE INDEX IF NOT EXISTS "PublicHoliday_actualStart_idx" ON "PublicHoliday"("actualStart");

-- ── HolidayAnnouncement ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HolidayAnnouncement" (
  "id"             TEXT NOT NULL,
  "holidayId"      TEXT NOT NULL,
  "kind"           "AnnouncementKind" NOT NULL DEFAULT 'ORIGINAL',
  "subject"        TEXT NOT NULL,
  "bodyEn"         TEXT NOT NULL,
  "bodyAr"         TEXT NOT NULL,
  "announcedStart" TIMESTAMP(3) NOT NULL,
  "announcedEnd"   TIMESTAMP(3) NOT NULL,
  "bridgeDates"    TEXT,
  "sentById"       TEXT,
  "sentAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "HolidayAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "HolidayAnnouncement_holidayId_idx" ON "HolidayAnnouncement"("holidayId");

DO $$ BEGIN
  ALTER TABLE "HolidayAnnouncement"
    ADD CONSTRAINT "HolidayAnnouncement_holidayId_fkey"
    FOREIGN KEY ("holidayId") REFERENCES "PublicHoliday"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HolidayAnnouncement"
    ADD CONSTRAINT "HolidayAnnouncement_sentById_fkey"
    FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Notification settings: the verification lead time (spec 037 FR-015) ──────
ALTER TABLE "NotificationSettings"
  ADD COLUMN IF NOT EXISTS "verificationLeadDays" INTEGER NOT NULL DEFAULT 14;
