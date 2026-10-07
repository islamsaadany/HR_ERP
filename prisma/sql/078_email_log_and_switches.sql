-- HR_ERP — Who gets which email, and is it working (2026-10-07).
--
-- WHY
--   Admin → Notifications had one switch for every email and a plain test message. Nobody could
--   see which emails the platform sends, who receives each one, or whether the last one actually
--   went — "she never got the email" could only be answered from a server log. The CEO asked for
--   a place to see who gets what, with a tick per email and a way to test each one.
--
-- WHAT THIS DOES
--   • `NotificationSettings.disabledEmails` — the emails switched OFF one by one. The OFF set, so
--     an email added to the product later starts ON, as every email did before switches existed.
--   • `EmailLog` — one row per email the platform tried to send, and what happened to it. The
--     page's "last sent" column and its health check read this. Samples are not recorded.
--
-- IDEMPOTENT: every statement is guarded, so a replay is a no-op. Nothing here touches existing
-- rows — the new column's default is the empty set, which means "everything on", which is what
-- every database meant until today.

BEGIN;

ALTER TABLE "NotificationSettings"
  ADD COLUMN IF NOT EXISTS "disabledEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

DO $outcome$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailOutcome') THEN
    CREATE TYPE "EmailOutcome" AS ENUM ('SENT', 'REFUSED', 'NO_ADDRESS', 'FAILED');
  END IF;
END
$outcome$;

CREATE TABLE IF NOT EXISTS "EmailLog" (
  "id"         TEXT           NOT NULL,
  "kind"       TEXT           NOT NULL,
  "recipient"  TEXT,
  "subject"    TEXT           NOT NULL,
  "outcome"    "EmailOutcome" NOT NULL,
  "error"      TEXT,
  "providerId" TEXT,
  "batchId"    TEXT,
  "createdAt"  TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EmailLog_kind_createdAt_idx" ON "EmailLog" ("kind", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx"      ON "EmailLog" ("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_batchId_idx"        ON "EmailLog" ("batchId");

COMMIT;
