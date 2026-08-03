-- HR_ERP Incentive Scheme (super-user only) — per-cycle input tables. Runner-applied, idempotent.
BEGIN;

CREATE TABLE IF NOT EXISTS "IncentiveCycle" (
  "id"            text PRIMARY KEY,
  "label"         text NOT NULL UNIQUE,
  "status"        text NOT NULL DEFAULT 'draft',
  "revenue"       double precision,
  "deliveryCost"  double precision,
  "totalExpenses" double precision,
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "IncentivePerson" (
  "id"               text PRIMARY KEY,
  "cycleId"          text NOT NULL REFERENCES "IncentiveCycle"("id") ON DELETE CASCADE,
  "name"             text NOT NULL,
  "role"             text,
  "netMonthlySalary" double precision NOT NULL,
  "startDate"        timestamp(3),
  "eligibleToLead"   boolean NOT NULL DEFAULT true,
  "utilization"      double precision
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncentivePerson_cycleId_name_key" ON "IncentivePerson" ("cycleId", "name");
CREATE INDEX IF NOT EXISTS "IncentivePerson_cycleId_idx" ON "IncentivePerson" ("cycleId");

CREATE TABLE IF NOT EXISTS "IncentiveAssignment" (
  "id"         text PRIMARY KEY,
  "cycleId"    text NOT NULL REFERENCES "IncentiveCycle"("id") ON DELETE CASCADE,
  "client"     text NOT NULL,
  "type"       text NOT NULL,
  "lead"       text NOT NULL,
  "bd"         text NOT NULL,
  "leadSource" text,
  "revenue"    double precision,
  "directCost" double precision,
  "vendorCost" double precision NOT NULL DEFAULT 0,
  "markupPct"  double precision NOT NULL DEFAULT 0,
  "startDate"  timestamp(3),
  "closeDate"  timestamp(3),
  "status"     text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncentiveAssignment_cycleId_client_key" ON "IncentiveAssignment" ("cycleId", "client");
CREATE INDEX IF NOT EXISTS "IncentiveAssignment_cycleId_idx" ON "IncentiveAssignment" ("cycleId");

CREATE TABLE IF NOT EXISTS "IncentiveContribution" (
  "id"      text PRIMARY KEY,
  "cycleId" text NOT NULL REFERENCES "IncentiveCycle"("id") ON DELETE CASCADE,
  "client"  text NOT NULL,
  "person"  text NOT NULL,
  "share"   double precision NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "IncentiveContribution_cycleId_client_person_key" ON "IncentiveContribution" ("cycleId", "client", "person");
CREATE INDEX IF NOT EXISTS "IncentiveContribution_cycleId_idx" ON "IncentiveContribution" ("cycleId");

COMMIT;
