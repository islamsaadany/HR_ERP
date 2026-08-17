-- HR_ERP — Profile data request campaigns (spec 033, 2026-08-17).
--
-- WHY
--   HR/Finance can now ASK targeted employees to fill or verify specific registry fields.
--   A campaign freezes its audience at launch; each targeted employee carries a per-field
--   state (pending → filled / confirmed / corrected). Answers write directly to "User" —
--   these tables only record who was asked, for what, and what happened (the tracker).
--
-- SAFETY
--   Purely additive: one enum + three new tables, nothing existing is read or changed.
--
-- ORDER: run after 053.

DO $$ BEGIN
  CREATE TYPE "DataRequestFieldStatus" AS ENUM ('PENDING', 'FILLED', 'CONFIRMED', 'CORRECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DataRequestCampaign" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "fields" text[] NOT NULL,
  "audience" text NOT NULL,
  "createdById" text REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" timestamp(3)
);
CREATE INDEX IF NOT EXISTS "DataRequestCampaign_closedAt_idx" ON "DataRequestCampaign"("closedAt");

CREATE TABLE IF NOT EXISTS "DataRequestTarget" (
  "id" text PRIMARY KEY,
  "campaignId" text NOT NULL REFERENCES "DataRequestCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataRequestTarget_campaignId_userId_key" ON "DataRequestTarget"("campaignId", "userId");
CREATE INDEX IF NOT EXISTS "DataRequestTarget_userId_idx" ON "DataRequestTarget"("userId");

CREATE TABLE IF NOT EXISTS "DataRequestFieldState" (
  "id" text PRIMARY KEY,
  "targetId" text NOT NULL REFERENCES "DataRequestTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "field" text NOT NULL,
  "status" "DataRequestFieldStatus" NOT NULL DEFAULT 'PENDING',
  "value" text,
  "answeredAt" timestamp(3)
);
CREATE UNIQUE INDEX IF NOT EXISTS "DataRequestFieldState_targetId_field_key" ON "DataRequestFieldState"("targetId", "field");
