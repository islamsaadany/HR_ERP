-- 029 — Backfill: make stored tenure band + status match the new derivation
-- (spec: tenure band is auto-calculated from the hire date, and status is driven
-- entirely by the end date). No schema change — this only re-syncs existing rows
-- so modules that read the stored columns (benefits pool ceiling, directory,
-- time-off manager checks) agree with what the registry now displays.
--
-- Run once in the Neon SQL editor. Review the diagnostics first.
--
-- ⚠ STATUS: after this runs, any employee currently marked "Left" WITHOUT an end
--   date becomes "Active" (status is now derived from the end date). If someone
--   should stay Left, give them an end date instead. Inspect them first:
--
--     SELECT id, name, email, status, "endDate"
--     FROM "User"
--     WHERE status = 'LEFT' AND "endDate" IS NULL;
--
-- ⚠ TENURE: bands are computed as of "now" and will drift as people cross year
--   thresholds; re-run this backfill periodically (or after big date edits) until
--   the benefits module derives tenure at read time (tracked follow-up).

-- Status ← end date (end date present ⇒ LEFT, else ACTIVE)
UPDATE "User"
SET status = CASE WHEN "endDate" IS NOT NULL THEN 'LEFT'::"EmployeeStatus"
                  ELSE 'ACTIVE'::"EmployeeStatus" END;

-- Tenure band ← hire date. Years = seconds since hire / (365.25 * 86400).
UPDATE "User"
SET "tenureBand" = CASE
  WHEN "startDate" IS NULL THEN NULL
  WHEN EXTRACT(EPOCH FROM (now() - "startDate")) / 31557600.0 < 0    THEN NULL
  WHEN EXTRACT(EPOCH FROM (now() - "startDate")) / 31557600.0 < 0.5  THEN NULL
  WHEN EXTRACT(EPOCH FROM (now() - "startDate")) / 31557600.0 < 2    THEN 'BAND_6MO_2Y'::"TenureBand"
  WHEN EXTRACT(EPOCH FROM (now() - "startDate")) / 31557600.0 < 4    THEN 'BAND_2_4Y'::"TenureBand"
  WHEN EXTRACT(EPOCH FROM (now() - "startDate")) / 31557600.0 < 7    THEN 'BAND_4_7Y'::"TenureBand"
  ELSE 'BAND_7_10Y'::"TenureBand"  -- 7–10y and anything beyond is capped at the top band
END;
