-- HR_ERP — module release switch: per-module on/off flags. Idempotent, runner-applied.
BEGIN;
CREATE TABLE IF NOT EXISTS "ModuleFlag" (
  "key"       text PRIMARY KEY,
  "enabled"   boolean NOT NULL DEFAULT true,
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
COMMIT;
