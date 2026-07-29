import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { deleteArticle, reorderKnowledge } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  published: boolean;
};

function ArrowButton({
  fields,
  dir,
  disabled,
}: {
  fields: Record<string, string>;
  dir: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={reorderKnowledge}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input type="hidden" name="dir" value={dir} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={dir === "up" ? "Move up" : "Move down"}
        className="grid h-6 w-6 place-items-center rounded border border-line text-muted hover:bg-navy-50 disabled:opacity-30"
      >
        {dir === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

export default async function AdminKnowledgePage() {
  await requireAdmin();
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: [{ order: "asc" }, { title: "asc" }],
  });

  // Group by category preserving order (topic order = its lowest-ordered article).
  const order: string[] = [];
  const byCat = new Map<string, Row[]>();
  for (const a of articles) {
    if (!byCat.has(a.category)) {
      byCat.set(a.category, []);
      order.push(a.category);
    }
    byCat.get(a.category)!.push(a);
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
        <>
          <p className="mt-4 text-xs text-muted">Use the arrows to arrange topics and the articles inside them. The order here is what employees see.</p>
          <div className="mt-3 space-y-6">
            {order.map((cat, ti) => {
              const list = byCat.get(cat)!;
              return (
                <section key={cat}>
                  <div className="flex items-center gap-2 border-b border-line pb-2">
                    <div className="flex flex-col gap-0.5">
                      <ArrowButton fields={{ kind: "topic", category: cat }} dir="up" disabled={ti === 0} />
                      <ArrowButton fields={{ kind: "topic", category: cat }} dir="down" disabled={ti === order.length - 1} />
                    </div>
                    <h2 className="text-sm font-semibold text-navy-800">{cat}</h2>
                    <span className="text-xs text-muted">· {list.length}</span>
                  </div>
                  <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                    {list.map((a, ai) => (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <ArrowButton fields={{ kind: "article", id: a.id }} dir="up" disabled={ai === 0} />
                          <ArrowButton fields={{ kind: "article", id: a.id }} dir="down" disabled={ai === list.length - 1} />
                        </div>
                        <div className="min-w-0 flex-1">
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
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
