-- HR_ERP — Performance reviews & 1:1s (spec 040, 2026-08-24).
--
-- WHAT
--   Nine tables and four enums for a quarterly review that is filled across the quarter, the
--   ad-hoc 1:1s that feed it, a private journal, and a per-employee Gallup strengths profile.
--
-- WHY THE PAIR IS STORED ON EVERY RECORD
--   `ReviewSheet` and `OneOnOne` carry `employeeId` + `managerId` and are authorised against those
--   two ids — NOT against `User.reportsToId` as it stands today. This is the deliberate opposite
--   of the Time-Off rule (approvals resolve against the CURRENT org chart, on purpose): a leave
--   request must reach whoever can approve it today, but a review belongs to the two people who
--   had it, so a new manager must never inherit the previous manager's conversations.
--
-- WHY `JournalEntry` JOINS TO NOTHING
--   It has no relation to any sheet, pair or manager. There is no join by which another person's
--   entry can be reached, so leaking one would have to be written deliberately rather than by
--   forgetting a filter.
--
-- WHY THERE IS NO CYCLE TABLE
--   A quarter is derived from the calendar (`src/lib/reviews/quarters.ts`). Nobody opens or closes
--   one — this module has no operator and no admin screen — and a stored row would drift from the
--   calendar it is meant to mirror.
--
-- SAFETY
--   Nine new tables and four new enums. Nothing existing is altered; no column is added to "User"
--   (the Prisma relations are back-relations only) and there is no back-fill. With no rows,
--   behaviour is exactly what it is today. Fully idempotent — it may be retried by the deploy-time
--   runner.
--
-- THE `updatedAt` DIFF: the new tables carry their own `updatedAt` with a CURRENT_TIMESTAMP
--   default, set by Prisma on write; no trigger and no existing table touched.
--
-- ORDER: run after 066.

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewJournalSection') THEN
    CREATE TYPE "ReviewJournalSection" AS ENUM ('WENT_WELL','DIDNT_GO_WELL','LEARNING','BLOCKER','EXPECTATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewItemSource') THEN
    CREATE TYPE "ReviewItemSource" AS ENUM ('TYPED','JOURNAL','ONE_ON_ONE','STRENGTH');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StrengthsDomain') THEN
    CREATE TYPE "StrengthsDomain" AS ENUM ('EXECUTING','INFLUENCING','RELATIONSHIP_BUILDING','STRATEGIC_THINKING');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StrengthsProfileSource') THEN
    CREATE TYPE "StrengthsProfileSource" AS ENUM ('PARSED','MANUAL');
  END IF;
END
$$;

-- ── ReviewSheet ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReviewSheet" (
  "id"                     TEXT NOT NULL,
  "year"                   INTEGER NOT NULL,
  "quarter"                INTEGER NOT NULL,
  "employeeId"             TEXT NOT NULL,
  "managerId"              TEXT NOT NULL,
  "employeeSubmittedAt"    TIMESTAMP(3),
  "managerSubmittedAt"     TIMESTAMP(3),
  "employeeMetConfirmedAt" TIMESTAMP(3),
  "managerMetConfirmedAt"  TIMESTAMP(3),
  -- Stamped only when all four timestamps above are present. Visible and frozen
  -- are the same state, deliberately.
  "openedAt"               TIMESTAMP(3),
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewSheet_pkey" PRIMARY KEY ("id")
);

-- A mid-quarter manager change produces a SECOND sheet rather than a collision:
-- it is a different pair, and each pair keeps its own conversation.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewSheet_year_quarter_employeeId_managerId_key"
  ON "ReviewSheet" ("year","quarter","employeeId","managerId");
CREATE INDEX IF NOT EXISTS "ReviewSheet_employeeId_year_quarter_idx"
  ON "ReviewSheet" ("employeeId","year","quarter");
CREATE INDEX IF NOT EXISTS "ReviewSheet_managerId_year_quarter_idx"
  ON "ReviewSheet" ("managerId","year","quarter");

-- ── ReviewSheetItem ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReviewSheetItem" (
  "id"          TEXT NOT NULL,
  "sheetId"     TEXT NOT NULL,
  "authorId"    TEXT NOT NULL,
  "questionKey" TEXT NOT NULL,
  "position"    INTEGER NOT NULL,
  -- Always a COPY. Editing or deleting the journal entry it came from, or
  -- replacing the author's strengths profile, cannot reach it.
  "body"        TEXT NOT NULL,
  "sourceKind"  "ReviewItemSource" NOT NULL DEFAULT 'TYPED',
  "sourceId"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewSheetItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReviewSheetItem_sheetId_authorId_idx"
  ON "ReviewSheetItem" ("sheetId","authorId");

-- Re-promoting the same journal entry or 1:1 outcome onto the same answer is a
-- no-op rather than a duplicate. PARTIAL, so ordinary typed items (sourceId NULL)
-- are unconstrained. Prisma cannot express this, so it lives here.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewSheetItem_source_unique"
  ON "ReviewSheetItem" ("sheetId","authorId","questionKey","sourceKind","sourceId")
  WHERE "sourceId" IS NOT NULL;

-- ── ReviewOutcome ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ReviewOutcome" (
  "id"                  TEXT NOT NULL,
  "sheetId"             TEXT NOT NULL,
  "priorities"          TEXT NOT NULL,
  "risks"               TEXT NOT NULL,
  "successDefinition"   TEXT NOT NULL,
  "employeeCommitments" TEXT NOT NULL,
  "managerCommitments"  TEXT NOT NULL,
  "authoredById"        TEXT NOT NULL,
  "employeeAckAt"       TIMESTAMP(3),
  "managerAckAt"        TIMESTAMP(3),
  -- Only a final outcome carries forward to the next quarter.
  "finalAt"             TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReviewOutcome_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReviewOutcome_sheetId_key" ON "ReviewOutcome" ("sheetId");

-- ── JournalEntry ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "JournalEntry" (
  "id"         TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  -- The day it happened, not the day it was typed.
  "occurredOn" TIMESTAMP(3) NOT NULL,
  "section"    "ReviewJournalSection",
  "body"       TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "JournalEntry_authorId_occurredOn_idx"
  ON "JournalEntry" ("authorId","occurredOn");

-- ── OneOnOne ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OneOnOne" (
  "id"            TEXT NOT NULL,
  "employeeId"    TEXT NOT NULL,
  "managerId"     TEXT NOT NULL,
  "heldOn"        TIMESTAMP(3) NOT NULL,
  "createdById"   TEXT NOT NULL,
  "outcome"       TEXT,
  "employeeAckAt" TIMESTAMP(3),
  "managerAckAt"  TIMESTAMP(3),
  "finalAt"       TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OneOnOne_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OneOnOne_employeeId_heldOn_idx" ON "OneOnOne" ("employeeId","heldOn");
CREATE INDEX IF NOT EXISTS "OneOnOne_managerId_heldOn_idx"  ON "OneOnOne" ("managerId","heldOn");

CREATE TABLE IF NOT EXISTS "OneOnOneNote" (
  "id"         TEXT NOT NULL,
  "oneOnOneId" TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  "body"       TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OneOnOneNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OneOnOneNote_oneOnOneId_idx" ON "OneOnOneNote" ("oneOnOneId");

-- ── Strengths ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "StrengthsTheme" (
  "code"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "domain"    "StrengthsDomain" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "StrengthsTheme_pkey" PRIMARY KEY ("code")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StrengthsTheme_name_key" ON "StrengthsTheme" ("name");

CREATE TABLE IF NOT EXISTS "StrengthsProfile" (
  "id"             TEXT NOT NULL,
  "employeeId"     TEXT NOT NULL,
  "source"         "StrengthsProfileSource" NOT NULL DEFAULT 'PARSED',
  "assessmentDate" TIMESTAMP(3),
  -- The name as PRINTED in the report, shown at confirmation so a report uploaded
  -- against the wrong person is caught. Never matched automatically: extraction
  -- kerning produced "ISLAM SA ADANY" in a real sample.
  "printedName"    TEXT,
  "blobUrl"        TEXT,
  "fileName"       TEXT,
  "confirmedById"  TEXT NOT NULL,
  "confirmedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StrengthsProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StrengthsProfile_employeeId_key" ON "StrengthsProfile" ("employeeId");

CREATE TABLE IF NOT EXISTS "StrengthsProfileTheme" (
  "id"        TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "rank"      INTEGER NOT NULL,
  "themeCode" TEXT NOT NULL,
  CONSTRAINT "StrengthsProfileTheme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StrengthsProfileTheme_profileId_rank_key"
  ON "StrengthsProfileTheme" ("profileId","rank");
CREATE UNIQUE INDEX IF NOT EXISTS "StrengthsProfileTheme_profileId_themeCode_key"
  ON "StrengthsProfileTheme" ("profileId","themeCode");
CREATE INDEX IF NOT EXISTS "StrengthsProfileTheme_profileId_idx"
  ON "StrengthsProfileTheme" ("profileId");

-- ── Foreign keys ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewSheet_employeeId_fkey') THEN
    ALTER TABLE "ReviewSheet" ADD CONSTRAINT "ReviewSheet_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewSheet_managerId_fkey') THEN
    ALTER TABLE "ReviewSheet" ADD CONSTRAINT "ReviewSheet_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewSheetItem_sheetId_fkey') THEN
    ALTER TABLE "ReviewSheetItem" ADD CONSTRAINT "ReviewSheetItem_sheetId_fkey"
      FOREIGN KEY ("sheetId") REFERENCES "ReviewSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewSheetItem_authorId_fkey') THEN
    ALTER TABLE "ReviewSheetItem" ADD CONSTRAINT "ReviewSheetItem_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewOutcome_sheetId_fkey') THEN
    ALTER TABLE "ReviewOutcome" ADD CONSTRAINT "ReviewOutcome_sheetId_fkey"
      FOREIGN KEY ("sheetId") REFERENCES "ReviewSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReviewOutcome_authoredById_fkey') THEN
    ALTER TABLE "ReviewOutcome" ADD CONSTRAINT "ReviewOutcome_authoredById_fkey"
      FOREIGN KEY ("authoredById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JournalEntry_authorId_fkey') THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOne_employeeId_fkey') THEN
    ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOne_managerId_fkey') THEN
    ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOne_createdById_fkey') THEN
    ALTER TABLE "OneOnOne" ADD CONSTRAINT "OneOnOne_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneNote_oneOnOneId_fkey') THEN
    ALTER TABLE "OneOnOneNote" ADD CONSTRAINT "OneOnOneNote_oneOnOneId_fkey"
      FOREIGN KEY ("oneOnOneId") REFERENCES "OneOnOne" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OneOnOneNote_authorId_fkey') THEN
    ALTER TABLE "OneOnOneNote" ADD CONSTRAINT "OneOnOneNote_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StrengthsProfile_employeeId_fkey') THEN
    ALTER TABLE "StrengthsProfile" ADD CONSTRAINT "StrengthsProfile_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StrengthsProfile_confirmedById_fkey') THEN
    ALTER TABLE "StrengthsProfile" ADD CONSTRAINT "StrengthsProfile_confirmedById_fkey"
      FOREIGN KEY ("confirmedById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StrengthsProfileTheme_profileId_fkey') THEN
    ALTER TABLE "StrengthsProfileTheme" ADD CONSTRAINT "StrengthsProfileTheme_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "StrengthsProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StrengthsProfileTheme_themeCode_fkey') THEN
    ALTER TABLE "StrengthsProfileTheme" ADD CONSTRAINT "StrengthsProfileTheme_themeCode_fkey"
      FOREIGN KEY ("themeCode") REFERENCES "StrengthsTheme" ("code") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- ── The 34 CliftonStrengths themes ───────────────────────────────────────────
-- Reference data, seeded here rather than by a screen. `name` is the exact
-- spelling Gallup prints, which is what the PDF parser matches against and what
-- a sheet item stores as its snapshot. Upserted, so a re-run corrects a row
-- rather than failing.
INSERT INTO "StrengthsTheme" ("code","name","domain","sortOrder") VALUES
  ('ACHIEVER','Achiever','EXECUTING',1),
  ('ARRANGER','Arranger','EXECUTING',2),
  ('BELIEF','Belief','EXECUTING',3),
  ('CONSISTENCY','Consistency','EXECUTING',4),
  ('DELIBERATIVE','Deliberative','EXECUTING',5),
  ('DISCIPLINE','Discipline','EXECUTING',6),
  ('FOCUS','Focus','EXECUTING',7),
  ('RESPONSIBILITY','Responsibility','EXECUTING',8),
  ('RESTORATIVE','Restorative','EXECUTING',9),
  ('ACTIVATOR','Activator','INFLUENCING',10),
  ('COMMAND','Command','INFLUENCING',11),
  ('COMMUNICATION','Communication','INFLUENCING',12),
  ('COMPETITION','Competition','INFLUENCING',13),
  ('MAXIMIZER','Maximizer','INFLUENCING',14),
  ('SELF_ASSURANCE','Self-Assurance','INFLUENCING',15),
  ('SIGNIFICANCE','Significance','INFLUENCING',16),
  ('WOO','Woo','INFLUENCING',17),
  ('ADAPTABILITY','Adaptability','RELATIONSHIP_BUILDING',18),
  ('CONNECTEDNESS','Connectedness','RELATIONSHIP_BUILDING',19),
  ('DEVELOPER','Developer','RELATIONSHIP_BUILDING',20),
  ('EMPATHY','Empathy','RELATIONSHIP_BUILDING',21),
  ('HARMONY','Harmony','RELATIONSHIP_BUILDING',22),
  ('INCLUDER','Includer','RELATIONSHIP_BUILDING',23),
  ('INDIVIDUALIZATION','Individualization','RELATIONSHIP_BUILDING',24),
  ('POSITIVITY','Positivity','RELATIONSHIP_BUILDING',25),
  ('RELATOR','Relator','RELATIONSHIP_BUILDING',26),
  ('ANALYTICAL','Analytical','STRATEGIC_THINKING',27),
  ('CONTEXT','Context','STRATEGIC_THINKING',28),
  ('FUTURISTIC','Futuristic','STRATEGIC_THINKING',29),
  ('IDEATION','Ideation','STRATEGIC_THINKING',30),
  ('INPUT','Input','STRATEGIC_THINKING',31),
  ('INTELLECTION','Intellection','STRATEGIC_THINKING',32),
  ('LEARNER','Learner','STRATEGIC_THINKING',33),
  ('STRATEGIC','Strategic','STRATEGIC_THINKING',34)
ON CONFLICT ("code") DO UPDATE
  SET "name" = EXCLUDED."name",
      "domain" = EXCLUDED."domain",
      "sortOrder" = EXCLUDED."sortOrder";
