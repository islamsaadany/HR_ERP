-- 078 — Learning tracks (spec 043, 2026-09-16)
--
-- A track is a named, ordered path of published courses handed to a person or a group. Being on a
-- track GRANTS its courses, which makes it the fifth access route; the rule that decides it lives
-- in src/lib/learning/access.ts and nothing else may read these rows to decide access.
--
-- IDEMPOTENT: every statement is guarded, because apply-sql.mjs may retry a file and because a
-- second run has to be watched rather than assumed. Re-running this against a database that
-- already holds tracks, assignments and sent reminders must change nothing and lose nothing.
--
-- NOTE ON THE CHECK CONSTRAINTS: a step carries at most ONE kind of deadline — a period in days
-- from when that person joined the track, or a fixed calendar date. Two on one step have no
-- meaning and the resolver would have to pick between them arbitrarily, so the database refuses
-- it rather than leaving it to every write path to remember. Same shape as the ExpenseEvidence
-- blob/external check (2026-08-25).

-- ── LearningTrack ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LearningTrack" (
  "id"          TEXT PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LearningTrack_name_key" ON "LearningTrack"("name");

DO $$ BEGIN
  ALTER TABLE "LearningTrack"
    ADD CONSTRAINT "LearningTrack_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningTrack"
    ADD CONSTRAINT "LearningTrack_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── LearningTrackStep ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LearningTrackStep" (
  "id"        TEXT PRIMARY KEY,
  "trackId"   TEXT NOT NULL,
  "courseId"  TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "dueDays"   INTEGER,
  "dueOn"     DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LearningTrackStep_trackId_courseId_key"
  ON "LearningTrackStep"("trackId", "courseId");
CREATE INDEX IF NOT EXISTS "LearningTrackStep_trackId_idx"  ON "LearningTrackStep"("trackId");
CREATE INDEX IF NOT EXISTS "LearningTrackStep_courseId_idx" ON "LearningTrackStep"("courseId");

DO $$ BEGIN
  ALTER TABLE "LearningTrackStep"
    ADD CONSTRAINT "LearningTrackStep_trackId_fkey"
    FOREIGN KEY ("trackId") REFERENCES "LearningTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningTrackStep"
    ADD CONSTRAINT "LearningTrackStep_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- At most one kind of deadline. Not "at least one" — most steps have none.
DO $$ BEGIN
  ALTER TABLE "LearningTrackStep"
    ADD CONSTRAINT "LearningTrackStep_one_deadline_kind"
    CHECK ("dueDays" IS NULL OR "dueOn" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A period must be a real period. Zero would mean "due the day you were given it", which is a
-- deadline nobody can meet; negative is meaningless.
DO $$ BEGIN
  ALTER TABLE "LearningTrackStep"
    ADD CONSTRAINT "LearningTrackStep_dueDays_positive"
    CHECK ("dueDays" IS NULL OR "dueDays" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── LearningTrackAssignment ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LearningTrackAssignment" (
  "id"           TEXT PRIMARY KEY,
  "trackId"      TEXT NOT NULL,
  "userId"       TEXT,
  "groupId"      TEXT,
  "assignedById" TEXT,
  "assignedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"    TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "LearningTrackAssignment_trackId_userId_key"
  ON "LearningTrackAssignment"("trackId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "LearningTrackAssignment_trackId_groupId_key"
  ON "LearningTrackAssignment"("trackId", "groupId");
CREATE INDEX IF NOT EXISTS "LearningTrackAssignment_trackId_revokedAt_idx"
  ON "LearningTrackAssignment"("trackId", "revokedAt");
CREATE INDEX IF NOT EXISTS "LearningTrackAssignment_userId_idx"  ON "LearningTrackAssignment"("userId");
CREATE INDEX IF NOT EXISTS "LearningTrackAssignment_groupId_idx" ON "LearningTrackAssignment"("groupId");

DO $$ BEGIN
  ALTER TABLE "LearningTrackAssignment"
    ADD CONSTRAINT "LearningTrackAssignment_trackId_fkey"
    FOREIGN KEY ("trackId") REFERENCES "LearningTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningTrackAssignment"
    ADD CONSTRAINT "LearningTrackAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningTrackAssignment"
    ADD CONSTRAINT "LearningTrackAssignment_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "LearnerGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Exactly one subject: a person OR a group, never both and never neither. A row with neither
-- would be an assignment to nobody that still reads as "assigned".
DO $$ BEGIN
  ALTER TABLE "LearningTrackAssignment"
    ADD CONSTRAINT "LearningTrackAssignment_one_subject"
    CHECK (("userId" IS NULL) <> ("groupId" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── LearningPersonalStep ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "LearningPersonalStep" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "courseId"  TEXT NOT NULL,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "dueDays"   INTEGER,
  "dueOn"     DATE,
  "addedById" TEXT,
  "addedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LearningPersonalStep_userId_courseId_key"
  ON "LearningPersonalStep"("userId", "courseId");
CREATE INDEX IF NOT EXISTS "LearningPersonalStep_userId_removedAt_idx"
  ON "LearningPersonalStep"("userId", "removedAt");

DO $$ BEGIN
  ALTER TABLE "LearningPersonalStep"
    ADD CONSTRAINT "LearningPersonalStep_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningPersonalStep"
    ADD CONSTRAINT "LearningPersonalStep_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningPersonalStep"
    ADD CONSTRAINT "LearningPersonalStep_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningPersonalStep"
    ADD CONSTRAINT "LearningPersonalStep_one_deadline_kind"
    CHECK ("dueDays" IS NULL OR "dueOn" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "LearningPersonalStep"
    ADD CONSTRAINT "LearningPersonalStep_dueDays_positive"
    CHECK ("dueDays" IS NULL OR "dueDays" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── LearningReminderLog ────────────────────────────────────────────────
-- One row per person per course per DAY, written only after a successful send. The unique index
-- is what makes "a job that runs twice cannot email twice" true; the check before sending is the
-- courtesy. Same shape as ConfirmationReminderLog (spec 041), which has been doing this job since
-- August.
CREATE TABLE IF NOT EXISTS "LearningReminderLog" (
  "id"        TEXT PRIMARY KEY,
  "userId"    TEXT NOT NULL,
  "courseId"  TEXT NOT NULL,
  "sentOn"    DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "LearningReminderLog_userId_courseId_sentOn_key"
  ON "LearningReminderLog"("userId", "courseId", "sentOn");
CREATE INDEX IF NOT EXISTS "LearningReminderLog_userId_idx" ON "LearningReminderLog"("userId");

-- ── LearningSettings ───────────────────────────────────────────────────
-- Singleton. Its own table rather than a column on NotificationSettings: that record is surfaced
-- at Admin → Notifications, a screen a learning manager cannot open, so the person meant to be
-- able to pull this brake could not reach it.
--
-- There is deliberately NO cadence column. The reminder bound is a const in
-- src/lib/learning/deadlines.ts, because a bound in a settings box is a decision nobody made.
CREATE TABLE IF NOT EXISTS "LearningSettings" (
  "id"                       TEXT PRIMARY KEY DEFAULT 'singleton',
  "deadlineRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
  "remindersDisabledById"    TEXT,
  "remindersDisabledAt"      TIMESTAMP(3),
  "updatedAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "LearningSettings"
    ADD CONSTRAINT "LearningSettings_remindersDisabledById_fkey"
    FOREIGN KEY ("remindersDisabledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The singleton row itself. ON CONFLICT DO NOTHING so a replay never resets a switch somebody has
-- deliberately turned on — the whole point of the row is that its value is somebody's decision.
INSERT INTO "LearningSettings" ("id", "deadlineRemindersEnabled", "updatedAt")
VALUES ('singleton', false, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
