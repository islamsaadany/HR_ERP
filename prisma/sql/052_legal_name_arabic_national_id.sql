-- HR_ERP — Arabic legal name + national ID on the employee record (2026-08-17, follow-up to 051).
--
-- WHY
--   The legal name is now captured in BOTH scripts: "legalName" holds the English form (as on
--   the passport/ID) and "legalNameAr" the Arabic form exactly as on the national ID. Anything
--   already saved in "legalName" simply stays as the English one. "nationalId" adds the national
--   ID number, self-edited by the employee from the My Documents card. All three follow the same
--   rules: employee-edited directly (no HR review), HR-correctable on the admin form, never
--   shown in the Team Directory, and nothing money-related reads them.
--
-- SAFETY
--   Purely additive: two nullable text columns, no backfill, nothing existing is read or changed.
--
-- ORDER: run after 051.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "legalNameAr" text;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nationalId" text;
