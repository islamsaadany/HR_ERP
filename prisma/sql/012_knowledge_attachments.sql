-- HR_ERP Knowledge Base: add optional deck (PDF) attachment to a topic/article. Runner-applied, idempotent.
BEGIN;
ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "attachmentType" TEXT;
ALTER TABLE "KnowledgeArticle" ADD COLUMN IF NOT EXISTS "attachmentSize" INTEGER;
COMMIT;
