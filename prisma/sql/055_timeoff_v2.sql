-- 055 — Time-Off v2 (spec 035): public holidays + employee cancellation timestamp.
-- Paste into Neon's SQL editor after 054. Idempotent.

-- HR-managed public holidays: listed dates never count as working days (weekend = Fri+Sat).
CREATE TABLE IF NOT EXISTS "PublicHoliday" (
  "id"        TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PublicHoliday_date_key" ON "PublicHoliday"("date");

-- When a request was cancelled (spec 035). Cancelled + decidedAt set = an approved trip
-- the employee called off before it started.
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
