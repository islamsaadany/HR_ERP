import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { ArticleForm } from "@/components/knowledge/ArticleForm";
import { createArticle } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  await requireAdmin();
  return (
    <div>
      <Link href="/admin/knowledge" className="text-sm text-muted hover:text-ink">← Knowledge Base</Link>
      <h1 className="mt-2 font-serif text-3xl text-ink">New article</h1>
      <p className="mt-1 text-muted">Generate with the Claude prompt, paste, review, and publish.</p>
      <div className="mt-6">
        <ArticleForm action={createArticle} submitLabel="Create article" />
      </div>
    </div>
  );
}
