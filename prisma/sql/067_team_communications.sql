-- HR_ERP — Team Communications (spec 039, 2026-08-24).
--
-- WHY
--   An admin surface for emailing employees: ANNOUNCEMENTS to a chosen audience, and personal
--   CONGRATULATIONS for birthdays and joining anniversaries. This is the platform's third email
--   workflow and the FIRST broadcast one — the two before it are transactional, one person
--   receiving one message because of something they did.
--
-- WHAT IS AND IS NOT CROSSED
--   The rule that no scheduled process may email an EMPLOYEE (spec 037) holds absolutely. The new
--   daily job prepares drafts and nudges operators; every message that reaches an employee is the
--   result of a person pressing send.
--
-- TWO THINGS THAT ARE STRUCTURAL RATHER THAN REMEMBERED
--   1. `Occasion` is unique on (userId, kind, occasionYear). That constraint IS the guarantee a
--      repeat cron run creates nothing new — not a check the job performs and could skip.
--   2. `MessageRecipient` is unique on (messageId, userId). Somebody matched by their department
--      AND by name receives ONE email, however the audience choices overlap.
--
-- SAFETY
--   Four new tables, three new enum types, one defaulted column on the settings singleton.
--   Nothing existing is altered and there is NO back-fill: with no rows, the platform behaves
--   exactly as it does today. Idempotent throughout — it may be retried.
--
-- THE `updatedAt` DIFF (expected, same as 060)
--   `prisma migrate diff` reports `ALTER COLUMN "updatedAt" DROP DEFAULT` for the tables here.
--   That is the house pattern: every hand-written migration in prisma/sql gives `updatedAt` a DB
--   default that Prisma's `@updatedAt` does not model, so a raw INSERT cannot fail on a missing
--   timestamp.
--
-- ORDER: run after 066.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageKind') THEN
    CREATE TYPE "MessageKind" AS ENUM ('ANNOUNCEMENT', 'BIRTHDAY', 'WORK_ANNIVERSARY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessageState') THEN
    CREATE TYPE "MessageState" AS ENUM ('DRAFT', 'SENT', 'MISSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryState') THEN
    CREATE TYPE "DeliveryState" AS ENUM ('PENDING', 'ACCEPTED', 'FAILED');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Message" (
  "id"             TEXT NOT NULL,
  "kind"           "MessageKind" NOT NULL,
  "state"          "MessageState" NOT NULL DEFAULT 'DRAFT',
  "subject"        TEXT NOT NULL,
  "body"           TEXT NOT NULL,
  "ctaLabel"       TEXT,
  "ctaHref"        TEXT,
  "subjectUserId"  TEXT,
  "assignedToId"   TEXT,
  "createdById"    TEXT,
  "sentById"       TEXT,
  "sentAt"         TIMESTAMP(3),
  "missedAt"       TIMESTAMP(3),
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MessageRecipient" (
  "id"             TEXT NOT NULL,
  "messageId"      TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "email"          TEXT NOT NULL,
  "businessUnitId" TEXT,
  "state"          "DeliveryState" NOT NULL DEFAULT 'PENDING',
  "providerId"     TEXT,
  "error"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MessageAudience" (
  "id"        TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "field"     TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAudience_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Occasion" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "kind"         "MessageKind" NOT NULL,
  "occasionYear" INTEGER NOT NULL,
  "occasionDate" TIMESTAMP(3) NOT NULL,
  "years"        INTEGER,
  "messageId"    TEXT,
  "preparedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Occasion_pkey" PRIMARY KEY ("id")
);

-- How far ahead congratulations are prepared. Mirrors verificationLeadDays rather than inventing
-- a second idiom for the same kind of setting.
ALTER TABLE "NotificationSettings"
  ADD COLUMN IF NOT EXISTS "congratsLeadDays" INTEGER NOT NULL DEFAULT 3;

CREATE INDEX  IF NOT EXISTS "Message_state_kind_idx"            ON "Message" ("state", "kind");
CREATE INDEX  IF NOT EXISTS "Message_assignedToId_state_idx"    ON "Message" ("assignedToId", "state");
CREATE INDEX  IF NOT EXISTS "Message_subjectUserId_idx"         ON "Message" ("subjectUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "MessageRecipient_messageId_userId_key" ON "MessageRecipient" ("messageId", "userId");
CREATE INDEX  IF NOT EXISTS "MessageRecipient_messageId_state_idx"        ON "MessageRecipient" ("messageId", "state");
CREATE UNIQUE INDEX IF NOT EXISTS "MessageAudience_messageId_field_value_key" ON "MessageAudience" ("messageId", "field", "value");
CREATE UNIQUE INDEX IF NOT EXISTS "Occasion_userId_kind_occasionYear_key"     ON "Occasion" ("userId", "kind", "occasionYear");
CREATE UNIQUE INDEX IF NOT EXISTS "Occasion_messageId_key"                    ON "Occasion" ("messageId");
CREATE INDEX  IF NOT EXISTS "Occasion_occasionDate_idx"                       ON "Occasion" ("occasionDate");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_subjectUserId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_subjectUserId_fkey"
      FOREIGN KEY ("subjectUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_assignedToId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_createdById_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_sentById_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_sentById_fkey"
      FOREIGN KEY ("sentById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageRecipient_messageId_fkey') THEN
    ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageRecipient_userId_fkey') THEN
    ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageRecipient_businessUnitId_fkey') THEN
    ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_businessUnitId_fkey"
      FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageAudience_messageId_fkey') THEN
    ALTER TABLE "MessageAudience" ADD CONSTRAINT "MessageAudience_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Occasion_userId_fkey') THEN
    ALTER TABLE "Occasion" ADD CONSTRAINT "Occasion_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Occasion_messageId_fkey') THEN
    ALTER TABLE "Occasion" ADD CONSTRAINT "Occasion_messageId_fkey"
      FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
