import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ArticleForm } from "@/components/knowledge/ArticleForm";
import { BackLink } from "@/components/admin/BackLink";
import { updateArticle } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const a = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!a) notFound();

  const boundAction = updateArticle.bind(null, a.id);

  return (
    <div>
      <BackLink href="/admin/knowledge" label="Knowledge Base" />
      <h1 className="font-serif text-3xl text-ink">Edit article</h1>
      <div className="mt-6">
        <ArticleForm
          action={boundAction}
          submitLabel="Save changes"
          initial={{
            title: a.title,
            cluster: a.cluster ?? "",
            category: a.category,
            summary: a.summary ?? "",
            body: a.body,
            readingMinutes: a.readingMinutes != null ? String(a.readingMinutes) : "",
            order: a.order,
            published: a.published,
            attachmentUrl: a.attachmentUrl ?? "",
            attachmentName: a.attachmentName ?? "",
          }}
        />
      </div>
    </div>
  );
}
