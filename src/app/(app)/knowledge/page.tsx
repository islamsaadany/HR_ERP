import { requireUser, isAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { KnowledgeExplorer } from "@/components/knowledge/KnowledgeExplorer";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const me = await requireUser();

  let articles;
  try {
    articles = await prisma.knowledgeArticle.findMany({
      where: { published: true },
      orderBy: [{ order: "asc" }, { title: "asc" }],
      select: {
        slug: true,
        title: true,
        cluster: true,
        category: true,
        summary: true,
        body: true,
        readingMinutes: true,
        attachmentUrl: true,
        attachmentName: true,
      },
    });
  } catch {
    // The KnowledgeArticle table (005) hasn't been created yet.
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Knowledge Base</p>
        <h1 className="mt-1 font-serif text-3xl text-ink">Knowledge Base</h1>
        <SetupNotice module="Knowledge Base" files="005_knowledge_base.sql" isAdmin={isAdmin(me.role)} />
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Knowledge Base
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Knowledge Base</h1>
      <p className="mt-1 text-muted">Consulting references &amp; reads — pick a topic to start.</p>

      <div className="mt-8">
        {articles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
            No articles yet. HR can add them under Admin → Knowledge Base.
          </div>
        ) : (
          <KnowledgeExplorer articles={articles} />
        )}
      </div>
    </div>
  );
}
