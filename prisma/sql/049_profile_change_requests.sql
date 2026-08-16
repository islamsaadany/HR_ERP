-- HR_ERP — Profile change requests (spec 029).
--
-- WHY
--   My Profile is read-only, so an employee who spots a stale emergency contact messages HR and
--   HR retypes it. This gives the correction a route through the product: the employee proposes,
--   HR decides field by field, and approving IS the edit — nothing is re-keyed by hand.
--
-- SHAPE
--   The decision lives on the FIELD, not the request, because one request can be part approved
--   and part declined. A request is "open" while any of its fields is still PENDING; there is no
--   request-level status column to drift out of step with the fields.
--
--   Values are stored as text (a date as ISO yyyy-mm-dd, an enum as its member name) and parsed
--   on approval, so adding a requestable field later is a registry entry rather than a migration.
--   The CURRENT value is deliberately NOT stored — it is read at review time, so approving can
--   never silently revert an edit HR made while the request sat in the queue.
--
-- SAFETY
--   Purely additive: one enum, two tables. Nothing existing is read or changed, and no data is
--   backfilled. Re-running is a no-op.
--
-- ORDER: run after 048.

DO $$ BEGIN
  CREATE TYPE "ProfileFieldStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ProfileChangeRequest" (
  id          text PRIMARY KEY,
  "userId"    text NOT NULL,
  reason      text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ProfileChangeRequest_userId_idx" ON "ProfileChangeRequest"("userId");

DO $$ BEGIN
  ALTER TABLE "ProfileChangeRequest" ADD CONSTRAINT "ProfileChangeRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ProfileChangeField" (
  id               text PRIMARY KEY,
  "requestId"      text NOT NULL,
  field            text NOT NULL,
  "requestedValue" text NOT NULL,
  status           "ProfileFieldStatus" NOT NULL DEFAULT 'PENDING',
  "decisionReason" text,
  "decidedById"    text,
  "decidedAt"      timestamp(3),
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A field appears at most once per request, so two rows can never propose different values for
-- the same column.
CREATE UNIQUE INDEX IF NOT EXISTS "ProfileChangeField_requestId_field_key"
  ON "ProfileChangeField"("requestId", field);
CREATE INDEX IF NOT EXISTS "ProfileChangeField_status_idx" ON "ProfileChangeField"(status);

DO $$ BEGIN
  ALTER TABLE "ProfileChangeField" ADD CONSTRAINT "ProfileChangeField_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "ProfileChangeRequest"(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "ProfileChangeField" ADD CONSTRAINT "ProfileChangeField_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
