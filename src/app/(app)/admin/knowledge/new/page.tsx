import { requireAdmin } from "@/lib/roles";
import { ArticleForm } from "@/components/knowledge/ArticleForm";
import { BackLink } from "@/components/admin/BackLink";
import { createArticle } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  await requireAdmin();
  return (
    <div>
      <BackLink href="/admin/knowledge" label="Knowledge Base" />
      <h1 className="font-serif text-3xl text-ink">New article</h1>
      <p className="mt-1 text-muted">Generate with the Claude prompt, paste, review, and publish.</p>
      <div className="mt-6">
        <ArticleForm action={createArticle} submitLabel="Create article" />
      </div>
    </div>
  );
}
