-- HR_ERP — Finance: petty cash & payback requests (spec 039, 2026-08-24).
--
-- WHY
--   The company's petty cash lives in a shared workbook (NEW_MARCOM_Expenses.xlsx): sixteen
--   period tabs, three different column layouts, receipts named as filenames that live
--   somewhere else, and a bottom-line "Amount to reimburse" whose SIGN FLIPS between tabs —
--   `March` computes spent − float (3,444.54 owed to the custodian) while `JUL-AUG` computes
--   float − spent (−4,617.16) for the same situation. Nobody can say what the company owes the
--   custodian right now. These tables move that into the platform, with the balance derived in
--   one place and stated in words.
--
-- MONEY
--   Every amount is NUMERIC(10,2) EGP so the ledger is readable to anyone querying Neon
--   directly. TypeScript reads them ONLY through src/lib/finance/money.ts, which does the
--   arithmetic in integer piastres — a closing balance out by 0.01 destroys trust in the whole
--   screen, and 0.1 + 0.2 !== 0.3 in every JS runtime.
--
-- WHAT IS NOT HERE
--   No stored balance column. The balance is derived from fundings and float-paid lines by
--   src/lib/finance/pettycash.ts, so it can never drift from the lines that explain it.
--
-- SAFETY
--   Nine new tables and five new enum types. NOTHING existing is altered — no column is added
--   to any existing table — so a running deployment cannot be disturbed by this file. Fully
--   idempotent: every CREATE is guarded, every constraint is added only when absent, and the
--   seed rows use ON CONFLICT DO NOTHING so a re-run never resurrects a value an admin has
--   since archived.
--
-- THE `updatedAt` DIFF (expected, same as 060/064)
--   `prisma migrate diff` will report `ALTER COLUMN "updatedAt" DROP DEFAULT` for these tables.
--   That is deliberate and matches the existing migrations: the DB default lets a raw INSERT
--   (by hand, or by a seed) satisfy NOT NULL, while Prisma's `@updatedAt` always writes the
--   column itself. Nothing to reconcile.
--
-- ORDER: run after 066.

-- ─── Enum types ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "PettyCashAccountStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PettyCashPeriodStatus" AS ENUM ('OPEN', 'SUBMITTED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PettyCashPaymentMethod" AS ENUM ('FLOAT', 'COMPANY_TRANSFER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "PettyCashFundingType" AS ENUM ('TOP_UP', 'RETURN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Spec 040 will insert 'PAYMENT_SUBMITTED' between APPROVED and PAID. Adding a member to an
-- existing enum is an ALTER TYPE, which is why the order here is deliberate and documented.
DO $$ BEGIN
  CREATE TYPE "PaybackStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Classification lists ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ExpenseSection" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseSection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseSection_name_key" ON "ExpenseSection" ("name");

CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_name_key" ON "ExpenseCategory" ("name");

-- ─── Petty cash ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PettyCashAccount" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "status"      "PettyCashAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "custodianId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PettyCashAccount_name_key" ON "PettyCashAccount" ("name");
CREATE INDEX IF NOT EXISTS "PettyCashAccount_custodianId_idx" ON "PettyCashAccount" ("custodianId");
CREATE INDEX IF NOT EXISTS "PettyCashAccount_status_idx" ON "PettyCashAccount" ("status");

CREATE TABLE IF NOT EXISTS "PettyCashPeriod" (
  "id"                        TEXT NOT NULL,
  "accountId"                 TEXT NOT NULL,
  "label"                     TEXT NOT NULL,
  "startDate"                 TIMESTAMP(3) NOT NULL,
  "endDate"                   TIMESTAMP(3) NOT NULL,
  "budget"                    NUMERIC(10,2),
  "openingBalance"            NUMERIC(10,2) NOT NULL DEFAULT 0,
  "status"                    "PettyCashPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "submittedAt"               TIMESTAMP(3),
  "submittedById"             TEXT,
  "closedAt"                  TIMESTAMP(3),
  "closedById"                TEXT,
  "missingEvidenceAckAt"      TIMESTAMP(3),
  "missingEvidenceAckById"    TEXT,
  "missingEvidenceAckNote"    TEXT,
  "missingEvidenceAckLineIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "reopenedAt"                TIMESTAMP(3),
  "reopenedById"              TEXT,
  "reopenReason"              TEXT,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashPeriod_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PettyCashPeriod_accountId_label_key"
  ON "PettyCashPeriod" ("accountId", "label");
CREATE INDEX IF NOT EXISTS "PettyCashPeriod_accountId_startDate_idx"
  ON "PettyCashPeriod" ("accountId", "startDate");
CREATE INDEX IF NOT EXISTS "PettyCashPeriod_status_idx" ON "PettyCashPeriod" ("status");

-- AT MOST ONE OPEN PERIOD PER ACCOUNT. Prisma cannot express a partial unique index, so it
-- lives here. It is the backstop, not the user-facing rule: the server action checks under a
-- row lock first so the operator sees a sentence rather than a constraint error.
CREATE UNIQUE INDEX IF NOT EXISTS "PettyCashPeriod_one_open_per_account"
  ON "PettyCashPeriod" ("accountId") WHERE "status" = 'OPEN';

CREATE TABLE IF NOT EXISTS "PettyCashFunding" (
  "id"           TEXT NOT NULL,
  "accountId"    TEXT NOT NULL,
  "periodId"     TEXT,
  "type"         "PettyCashFundingType" NOT NULL,
  "date"         TIMESTAMP(3) NOT NULL,
  "amount"       NUMERIC(10,2) NOT NULL,
  "reference"    TEXT,
  "note"         TEXT,
  "recordedById" TEXT,
  "paymentRunId" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashFunding_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PettyCashFunding_accountId_date_idx"
  ON "PettyCashFunding" ("accountId", "date");
CREATE INDEX IF NOT EXISTS "PettyCashFunding_periodId_idx" ON "PettyCashFunding" ("periodId");

CREATE TABLE IF NOT EXISTS "PettyCashLine" (
  "id"             TEXT NOT NULL,
  "periodId"       TEXT NOT NULL,
  "datePaid"       TIMESTAMP(3) NOT NULL,
  "sectionId"      TEXT NOT NULL,
  "categoryId"     TEXT,
  "description"    TEXT NOT NULL,
  "method"         "PettyCashPaymentMethod" NOT NULL,
  "paymentDetails" TEXT,
  "payee"          TEXT,
  "amount"         NUMERIC(10,2) NOT NULL,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PettyCashLine_periodId_idx" ON "PettyCashLine" ("periodId");
CREATE INDEX IF NOT EXISTS "PettyCashLine_sectionId_idx" ON "PettyCashLine" ("sectionId");
CREATE INDEX IF NOT EXISTS "PettyCashLine_categoryId_idx" ON "PettyCashLine" ("categoryId");
CREATE INDEX IF NOT EXISTS "PettyCashLine_datePaid_idx" ON "PettyCashLine" ("datePaid");

CREATE TABLE IF NOT EXISTS "PettyCashLineDeletion" (
  "id"          TEXT NOT NULL,
  "periodId"    TEXT NOT NULL,
  "snapshot"    JSONB NOT NULL,
  "deletedById" TEXT,
  "deletedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashLineDeletion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PettyCashLineDeletion_periodId_idx"
  ON "PettyCashLineDeletion" ("periodId");

-- ─── Payback requests ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "PaybackRequest" (
  "id"                TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  "amount"            NUMERIC(10,2) NOT NULL,
  "datePaid"          TIMESTAMP(3) NOT NULL,
  "categoryId"        TEXT,
  "description"       TEXT NOT NULL,
  "payee"             TEXT,
  "status"            "PaybackStatus" NOT NULL DEFAULT 'SUBMITTED',
  "submittedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById"       TEXT,
  "decidedAt"         TIMESTAMP(3),
  "decisionReason"    TEXT,
  "paidById"          TEXT,
  "paidAt"            TIMESTAMP(3),
  "transferDate"      TIMESTAMP(3),
  "amountTransferred" NUMERIC(10,2),
  "paymentReference"  TEXT,
  "paymentRunId"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaybackRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PaybackRequest_userId_idx" ON "PaybackRequest" ("userId");
CREATE INDEX IF NOT EXISTS "PaybackRequest_status_idx" ON "PaybackRequest" ("status");

-- ─── Evidence ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ExpenseEvidence" (
  "id"               TEXT NOT NULL,
  "blobUrl"          TEXT NOT NULL,
  "fileName"         TEXT NOT NULL,
  "contentType"      TEXT NOT NULL,
  "sizeBytes"        INTEGER NOT NULL,
  "uploadedById"     TEXT,
  "pettyCashLineId"  TEXT,
  "paybackRequestId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseEvidence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ExpenseEvidence_pettyCashLineId_idx"
  ON "ExpenseEvidence" ("pettyCashLineId");
CREATE INDEX IF NOT EXISTS "ExpenseEvidence_paybackRequestId_idx"
  ON "ExpenseEvidence" ("paybackRequestId");

-- EXACTLY ONE PARENT. A file belonging to both records, or to neither, is an orphan the
-- serving route could not decide access for — and the access decision is the whole protection
-- on a receipt. Prisma cannot express this, so it is enforced here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ExpenseEvidence_one_parent') THEN
    ALTER TABLE "ExpenseEvidence" ADD CONSTRAINT "ExpenseEvidence_one_parent"
      CHECK (("pettyCashLineId" IS NULL) <> ("paybackRequestId" IS NULL));
  END IF;
END $$;

-- ─── Foreign keys ──────────────────────────────────────────────────────────

DO $$
DECLARE
  fk RECORD;
BEGIN
  FOR fk IN
    SELECT * FROM (VALUES
      ('PettyCashAccount_custodianId_fkey',        'PettyCashAccount',      'custodianId',            'User',             'RESTRICT'),
      ('PettyCashAccount_createdById_fkey',        'PettyCashAccount',      'createdById',            'User',             'SET NULL'),
      ('PettyCashPeriod_accountId_fkey',           'PettyCashPeriod',       'accountId',              'PettyCashAccount', 'CASCADE'),
      ('PettyCashPeriod_submittedById_fkey',       'PettyCashPeriod',       'submittedById',          'User',             'SET NULL'),
      ('PettyCashPeriod_closedById_fkey',          'PettyCashPeriod',       'closedById',             'User',             'SET NULL'),
      ('PettyCashPeriod_missingEvidenceAckById_fkey', 'PettyCashPeriod',    'missingEvidenceAckById', 'User',             'SET NULL'),
      ('PettyCashPeriod_reopenedById_fkey',        'PettyCashPeriod',       'reopenedById',           'User',             'SET NULL'),
      ('PettyCashFunding_accountId_fkey',          'PettyCashFunding',      'accountId',              'PettyCashAccount', 'CASCADE'),
      ('PettyCashFunding_periodId_fkey',           'PettyCashFunding',      'periodId',               'PettyCashPeriod',  'SET NULL'),
      ('PettyCashFunding_recordedById_fkey',       'PettyCashFunding',      'recordedById',           'User',             'SET NULL'),
      ('PettyCashLine_periodId_fkey',              'PettyCashLine',         'periodId',               'PettyCashPeriod',  'CASCADE'),
      ('PettyCashLine_sectionId_fkey',             'PettyCashLine',         'sectionId',              'ExpenseSection',   'RESTRICT'),
      ('PettyCashLine_categoryId_fkey',            'PettyCashLine',         'categoryId',             'ExpenseCategory',  'SET NULL'),
      ('PettyCashLine_createdById_fkey',           'PettyCashLine',         'createdById',            'User',             'SET NULL'),
      ('PettyCashLineDeletion_deletedById_fkey',   'PettyCashLineDeletion', 'deletedById',            'User',             'SET NULL'),
      ('PaybackRequest_userId_fkey',               'PaybackRequest',        'userId',                 'User',             'CASCADE'),
      ('PaybackRequest_categoryId_fkey',           'PaybackRequest',        'categoryId',             'ExpenseCategory',  'SET NULL'),
      ('PaybackRequest_decidedById_fkey',          'PaybackRequest',        'decidedById',            'User',             'SET NULL'),
      ('PaybackRequest_paidById_fkey',             'PaybackRequest',        'paidById',               'User',             'SET NULL'),
      ('ExpenseEvidence_uploadedById_fkey',        'ExpenseEvidence',       'uploadedById',           'User',             'SET NULL'),
      ('ExpenseEvidence_pettyCashLineId_fkey',     'ExpenseEvidence',       'pettyCashLineId',        'PettyCashLine',    'CASCADE'),
      ('ExpenseEvidence_paybackRequestId_fkey',    'ExpenseEvidence',       'paybackRequestId',       'PaybackRequest',   'CASCADE')
    ) AS t(conname, tbl, col, ref, on_delete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.conname) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I("id") ON DELETE %s ON UPDATE CASCADE',
        fk.tbl, fk.conname, fk.col, fk.ref, fk.on_delete
      );
    END IF;
  END LOOP;
END $$;

-- ─── Seed the classification lists ─────────────────────────────────────────
--
-- These are the operator's OWN words, lifted from the workbook and normalised to sentence case
-- (it carries `office supply`, `Office supply` and ` Stationary` as separate strings, which is
-- what an unmanaged free-text column does over two years). Seeding means the feature is usable
-- the moment it deploys. ON CONFLICT DO NOTHING so a re-run adds nothing and never resurrects
-- a value an admin has since archived.

INSERT INTO "ExpenseSection" ("id", "name", "sortOrder") VALUES
  ('sec_marketing', 'Marketing', 10),
  ('sec_community', 'Community', 20),
  ('sec_team',      'Team',      30)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "ExpenseCategory" ("id", "name", "sortOrder") VALUES
  ('cat_office_supply',     'Office supply',     10),
  ('cat_media_coverage',    'Media coverage',    20),
  ('cat_printings',         'Printings',         30),
  ('cat_transportation',    'Transportation',    40),
  ('cat_catering',          'Catering',          50),
  ('cat_venue',             'Venue',             60),
  ('cat_booking',           'Booking',           70),
  ('cat_gifts',             'Gifts',             80),
  ('cat_logistics',         'Logistics',         90),
  ('cat_tools',             'Tools',             100),
  ('cat_assets',            'Assets',            110),
  ('cat_stationery',        'Stationery',        120),
  ('cat_employer_branding', 'Employer branding', 130),
  ('cat_social_media',      'Social media',      140),
  ('cat_team',              'Team',              150)
ON CONFLICT ("name") DO NOTHING;
