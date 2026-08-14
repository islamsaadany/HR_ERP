-- HR_ERP — Demo persona for live product walk-throughs ("demo mode").
--
-- Seeds ONE fake employee (Ahmed Ali) + family so you can sign in as them and
-- present the employee experience (Profile, Benefits, Time-off, Directory…)
-- without ever showing your own real salary, pool, or personal data.
--
-- HOW TO USE (see also the cleanup file below):
--   1. Paste this whole file into the Neon SQL editor and run it.
--   2. During the meeting: sign OUT of your account, then sign IN as
--        email:    ahmed.ali@forefront.consulting
--        password: Demo2026!
--      You now see the app as Ahmed — all numbers are fake. Open Benefits as
--      this user (NOT via the admin screens) and everything is invented data.
--   3. After the meeting, run 038_remove_demo_persona.sql to delete him.
--
-- All figures below are invented. Idempotent: re-running updates the same rows.
-- The password hash is scrypt (app format); it verifies "Demo2026!".
BEGIN;

INSERT INTO "User" (
  "id", "email", "name", "phone", "department", "title",
  "role", "passwordHash", "mustChangePassword",
  "employmentType", "tenureBand", "startDate", "endDate", "status", "monthlySalary",
  "dateOfBirth", "maritalStatus",
  "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone",
  "createdAt", "updatedAt"
) VALUES (
  'demo-ahmed-ali',
  'ahmed.ali@forefront.consulting',
  'Ahmed Ali',
  '+20 100 555 0100',
  'Consulting',
  'Strategy Specialist',
  'EMPLOYEE',
  'scrypt$df6e64cda3c23cbc9b455888d117ea7c$6c1e9168d3b93f34ecc004d9606252c7f1fd35356c7b5dd91a8c01f6f2a03671cbb44e520667c5ca6900f60cc4838d58d43903a9d66b0cba6d5d475dafa973eb',
  false,
  'FULL_TIME',
  'BAND_2_4Y',
  DATE '2023-02-01',      -- ~3.5 years of service -> 2-4y band
  NULL,
  'ACTIVE',
  25000,                  -- fake monthly salary (drives the Loans ceiling)
  DATE '1989-05-10',      -- Ahmed's DOB (medical age band)
  'MARRIED',
  'Layla Ali',            -- emergency contact (fake)
  'Spouse',
  '+20 100 555 0101',
  now(), now()
)
ON CONFLICT ("email") DO UPDATE SET
  "name" = EXCLUDED."name",
  "phone" = EXCLUDED."phone",
  "department" = EXCLUDED."department",
  "title" = EXCLUDED."title",
  "role" = EXCLUDED."role",
  "passwordHash" = EXCLUDED."passwordHash",
  "mustChangePassword" = EXCLUDED."mustChangePassword",
  "employmentType" = EXCLUDED."employmentType",
  "tenureBand" = EXCLUDED."tenureBand",
  "startDate" = EXCLUDED."startDate",
  "endDate" = EXCLUDED."endDate",
  "status" = EXCLUDED."status",
  "monthlySalary" = EXCLUDED."monthlySalary",
  "dateOfBirth" = EXCLUDED."dateOfBirth",
  "maritalStatus" = EXCLUDED."maritalStatus",
  "emergencyContactName" = EXCLUDED."emergencyContactName",
  "emergencyContactRelationship" = EXCLUDED."emergencyContactRelationship",
  "emergencyContactPhone" = EXCLUDED."emergencyContactPhone",
  "updatedAt" = now();

-- Family (a spouse + one child), both with DOBs so the medical modal can price
-- them. Keyed to the demo user id resolved from the email above.
INSERT INTO "Dependant" ("id", "userId", "name", "dateOfBirth", "kind", "createdAt")
SELECT 'demo-ahmed-ali-spouse', u."id", 'Layla Ali', DATE '1992-03-15', 'SPOUSE', now()
FROM "User" u WHERE u."email" = 'ahmed.ali@forefront.consulting'
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name", "dateOfBirth" = EXCLUDED."dateOfBirth", "kind" = EXCLUDED."kind";

INSERT INTO "Dependant" ("id", "userId", "name", "dateOfBirth", "kind", "createdAt")
SELECT 'demo-ahmed-ali-child', u."id", 'Yousef Ali', DATE '2016-09-20', 'CHILD', now()
FROM "User" u WHERE u."email" = 'ahmed.ali@forefront.consulting'
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name", "dateOfBirth" = EXCLUDED."dateOfBirth", "kind" = EXCLUDED."kind";

COMMIT;
