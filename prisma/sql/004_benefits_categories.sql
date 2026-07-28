-- HR_ERP benefits catalog → categorized full set (ported from benefitsselector_3.html).
-- Run this on a database that already applied 000 + 003 (the earlier 4-item catalog).
-- Idempotent: adds the category column, updates existing rows, inserts the new items.
BEGIN;

ALTER TABLE "BenefitCatalogItem" ADD COLUMN IF NOT EXISTS "category" TEXT;

-- Upsert the full catalog. Existing rows (medical/gym/mobile/schooling) get their
-- category/name/order refreshed; the new items are inserted.
INSERT INTO "BenefitCatalogItem" (id,key,name,description,category,"isMedical","order",active) VALUES
  ('cat_medical','medical','Personal medical insurance','Cover for you. Add spouse and children as separate options.','Health & protection',true,0,true),
  ('cat_checkup','checkup','Annual health check-up','Preventive screening.','Health & protection',false,1,true),
  ('cat_gym','gym','Gym membership','Annual fitness subscription.','Wellbeing',false,2,true),
  ('cat_coaching','coaching','Coaching / therapy','Mental health & personal coaching.','Wellbeing',false,3,true),
  ('cat_sports','sports','Sports expenses','Equipment, classes, activities.','Wellbeing',false,4,true),
  ('cat_schooling','schooling','Schooling / education','Children''s school fees.','Life & family',false,5,true),
  ('cat_childcare','childcare','Childcare / nursery','Daycare & nursery support.','Life & family',false,6,true),
  ('cat_caregiver','caregiver','Caregiver support','Elder & dependant care.','Life & family',false,7,true),
  ('cat_learning','learning','Personal learning','Courses, languages, books, hobbies.','Personal growth',false,8,true),
  ('cat_mobile','mobile','Mobile device','Phone & device costs.','Lifestyle & flexibility',false,9,true),
  ('cat_homeoffice','homeoffice','Home-office setup','Desk, chair, internet.','Lifestyle & flexibility',false,10,true)
ON CONFLICT (key) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  "isMedical" = EXCLUDED."isMedical",
  "order"     = EXCLUDED."order",
  active      = EXCLUDED.active;

COMMIT;
