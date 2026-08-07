-- Migration 021: force a password change after a temporary password is issued.
-- Idempotent — safe to run more than once.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
