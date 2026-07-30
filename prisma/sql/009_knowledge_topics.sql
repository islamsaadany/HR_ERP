-- HR_ERP Knowledge Base reclustered into topics + placeholder topics. Runner-applied, idempotent.
BEGIN;
UPDATE "KnowledgeArticle" SET category='What is Strategy Consulting', "order"=0, "updatedAt"=now() WHERE slug='strategy-consulting-intro';
UPDATE "KnowledgeArticle" SET category='What is Strategy Consulting', "order"=1, "updatedAt"=now() WHERE slug='why-clients-hire-consultants';
UPDATE "KnowledgeArticle" SET category='What is Strategy Consulting', "order"=2, "updatedAt"=now() WHERE slug='consulting-scopes-and-types';
UPDATE "KnowledgeArticle" SET category='What is Strategy Consulting', "order"=3, "updatedAt"=now() WHERE slug='consulting-domains';
UPDATE "KnowledgeArticle" SET category='The Consultant''s Craft', "order"=10, "updatedAt"=now() WHERE slug='consultant-essential-skills';
UPDATE "KnowledgeArticle" SET category='The Consultant''s Craft', "order"=11, "updatedAt"=now() WHERE slug='consultant-6-core-pillars';
UPDATE "KnowledgeArticle" SET category='The Consultant''s Craft', "order"=12, "updatedAt"=now() WHERE slug='golden-rules-questions-answers';
UPDATE "KnowledgeArticle" SET category='AI-Strategy Consulting', "order"=20, "updatedAt"=now() WHERE slug='ai-strategy-consulting-intro';
UPDATE "KnowledgeArticle" SET category='Engagement Management', "order"=30, "updatedAt"=now() WHERE slug='assignment-phases-overview';
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_stakeholder','stakeholder-management','Stakeholder Management','Stakeholder Management','Stakeholder Management — coming soon.','> [!NOTE] Content coming soon — this topic will be added by HR.',1,true,40,now()) ON CONFLICT (slug) DO UPDATE SET category=EXCLUDED.category, "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_political','political-management','Political Management','Political Management','Political Management — coming soon.','> [!NOTE] Content coming soon — this topic will be added by HR.',1,true,50,now()) ON CONFLICT (slug) DO UPDATE SET category=EXCLUDED.category, "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_influence','influence-and-power','Influence & Power','Influence & Power','Influence & Power — coming soon.','> [!NOTE] Content coming soon — this topic will be added by HR.',1,true,60,now()) ON CONFLICT (slug) DO UPDATE SET category=EXCLUDED.category, "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_smo','smo-practices','SMO Practices','SMO Practices','SMO Practices — coming soon.','> [!NOTE] Content coming soon — this topic will be added by HR.',1,true,70,now()) ON CONFLICT (slug) DO UPDATE SET category=EXCLUDED.category, "order"=EXCLUDED."order", "updatedAt"=now();
INSERT INTO "KnowledgeArticle" (id,slug,title,category,summary,body,"readingMinutes",published,"order","updatedAt") VALUES ('ka_persdev','personal-development','Personal Development','Personal Development','Personal Development — coming soon.','Your personal development path.

## Key takeaways
- Internal LMS courses.
- Commitments to courses on external platforms.

> [!NOTE] Detailed content coming soon.',1,true,80,now()) ON CONFLICT (slug) DO UPDATE SET category=EXCLUDED.category, "order"=EXCLUDED."order", "updatedAt"=now();
COMMIT;
