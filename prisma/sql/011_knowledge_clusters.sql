-- HR_ERP Knowledge Base: add cluster level (Cluster -> Topic -> Article). Runner-applied, idempotent.
BEGIN;
ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "cluster" TEXT;
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='What is Strategy Consulting', "order"=0, "updatedAt"=now() WHERE slug='strategy-consulting-intro';
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='What is Strategy Consulting', "order"=1, "updatedAt"=now() WHERE slug='why-clients-hire-consultants';
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='What is Strategy Consulting', "order"=2, "updatedAt"=now() WHERE slug='consulting-scopes-and-types';
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='What is Strategy Consulting', "order"=3, "updatedAt"=now() WHERE slug='consulting-domains';
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='The Consultant''s Craft', "order"=100, "updatedAt"=now() WHERE slug='consultant-essential-skills';
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='The Consultant''s Craft', "order"=101, "updatedAt"=now() WHERE slug='consultant-6-core-pillars';
UPDATE "KnowledgeArticle" SET cluster='Consulting', category='The Consultant''s Craft', "order"=102, "updatedAt"=now() WHERE slug='golden-rules-questions-answers';
UPDATE "KnowledgeArticle" SET cluster='AI in Consulting', category='AI-Strategy Consulting', "order"=10000, "updatedAt"=now() WHERE slug='ai-strategy-consulting-intro';
UPDATE "KnowledgeArticle" SET cluster='Managing Assignments', category='Engagement Management', "order"=20000, "updatedAt"=now() WHERE slug='assignment-phases-overview';
UPDATE "KnowledgeArticle" SET cluster='Managing Assignments', category='Stakeholder Management', "order"=20100, "updatedAt"=now() WHERE slug='stakeholder-management';
UPDATE "KnowledgeArticle" SET cluster='Managing Assignments', category='Political Management', "order"=20200, "updatedAt"=now() WHERE slug='political-management';
UPDATE "KnowledgeArticle" SET cluster='Managing Assignments', category='Influence & Power', "order"=20300, "updatedAt"=now() WHERE slug='influence-and-power';
UPDATE "KnowledgeArticle" SET cluster='Managing Assignments', category='SMO Practices', "order"=20400, "updatedAt"=now() WHERE slug='smo-practices';
UPDATE "KnowledgeArticle" SET cluster='Personal Development', category='Personal Development', "order"=30000, "updatedAt"=now() WHERE slug='personal-development';
COMMIT;
