import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteArticle } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage() {
  await requireAdmin();
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: [{ category: "asc" }, { order: "asc" }, { title: "asc" }],
  });

  const groups = new Map<string, typeof articles>();
  for (const a of articles) {
    const list = groups.get(a.category) ?? [];
    list.push(a);
    groups.set(a.category, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Knowledge Base</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Knowledge Base</h1>
        </div>
        <Link href="/admin/knowledge/new" className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          New article
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No articles yet. Use <strong>New article</strong> — copy the Claude prompt, paste the result, save.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {Array.from(groups.entries()).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h2>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                {list.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink">{a.title}</span>
                        {!a.published ? (
                          <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gold-800">Draft</span>
                        ) : null}
                      </div>
                      {a.summary ? <div className="truncate text-xs text-muted">{a.summary}</div> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Link href={`/admin/knowledge/${a.id}`} className="text-sm font-medium text-navy-700 hover:text-navy-900">Edit</Link>
                      <form action={deleteArticle}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-sm text-muted hover:text-red-600">Delete</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
