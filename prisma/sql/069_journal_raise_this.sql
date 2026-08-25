-- HR_ERP — Flagging a journal note to raise (spec 040 addendum, 2026-08-25).
--
-- WHAT
--   Two columns. `JournalEntry.raiseIt` marks a note as something to bring to a
--   conversation; `OneOnOneNote.sourceKind`/`sourceId` let a note record that it
--   came from a journal entry, exactly as `ReviewSheetItem` already does.
--
-- WHY NOT A SEPARATE "INCIDENTS" TABLE
--   Because then there are two places to write the same thing, and the person
--   has to remember which one they used. The journal already IS "record an issue
--   as it happens"; what was missing was a way to say "raise this" and a place
--   for it to wait.
--
-- WHY "CARRIED" IS NOT A COLUMN
--   Whether a flagged note has been raised is DERIVED: an entry is carried when a
--   ReviewSheetItem or OneOnOneNote references it. A stored `raisedAt` would be a
--   second source of truth that could disagree with the thing it points at — the
--   same trap as a count computed separately from the rule it describes
--   (`audienceReachByRule`, 2026-08-22).
--
-- SAFETY
--   Two additive columns with defaults, on tables introduced by 068 in the same
--   release. No back-fill: existing rows default to raiseIt = false and TYPED,
--   which is exactly today's behaviour. Fully idempotent.
--
-- ORDER: run after 068.

ALTER TABLE "JournalEntry"
  ADD COLUMN IF NOT EXISTS "raiseIt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OneOnOneNote"
  ADD COLUMN IF NOT EXISTS "sourceKind" "ReviewItemSource" NOT NULL DEFAULT 'TYPED';

ALTER TABLE "OneOnOneNote"
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

-- Flagged notes are read as a small queue per person; the index keeps that a
-- lookup rather than a scan once a journal has a year of entries in it.
CREATE INDEX IF NOT EXISTS "JournalEntry_authorId_raiseIt_idx"
  ON "JournalEntry" ("authorId", "raiseIt");

-- Raising the same journal entry twice into the same 1:1 is a no-op rather than a
-- duplicate note. PARTIAL, so ordinary typed notes (sourceId NULL) are
-- unconstrained — the same shape as ReviewSheetItem_source_unique in 068.
CREATE UNIQUE INDEX IF NOT EXISTS "OneOnOneNote_source_unique"
  ON "OneOnOneNote" ("oneOnOneId", "authorId", "sourceKind", "sourceId")
  WHERE "sourceId" IS NOT NULL;
