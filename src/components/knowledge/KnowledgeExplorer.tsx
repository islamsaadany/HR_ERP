"use client";

import { useMemo, useState } from "react";
import { ArticleRenderer } from "./ArticleRenderer";

export type ArticleFull = {
  slug: string;
  title: string;
  category: string;
  summary: string | null;
  body: string;
  readingMinutes: number | null;
};

export function KnowledgeExplorer({ articles }: { articles: ArticleFull[] }) {
  const [q, setQ] = useState("");
  const [activeSlug, setActiveSlug] = useState(articles[0]?.slug ?? "");

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(n) ||
        a.category.toLowerCase().includes(n) ||
        (a.summary ?? "").toLowerCase().includes(n) ||
        a.body.toLowerCase().includes(n)
    );
  }, [articles, q]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ArticleFull[]>();
    for (const a of filtered) {
      if (!map.has(a.category)) {
        map.set(a.category, []);
        order.push(a.category);
      }
      map.get(a.category)!.push(a);
    }
    return order.map((cat) => ({ cat, items: map.get(cat)! }));
  }, [filtered]);

  const active =
    articles.find((a) => a.slug === activeSlug) ?? filtered[0] ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      {/* Left list */}
      <nav className="lg:sticky lg:top-6 h-fit">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />
        {groups.length === 0 ? (
          <p className="mt-5 text-sm text-muted">No articles match.</p>
        ) : (
          groups.map((g) => (
            <div key={g.cat} className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                {g.cat}
              </div>
              <ul className="space-y-0.5">
                {g.items.map((a) => {
                  const on = a.slug === active?.slug;
                  return (
                    <li key={a.slug}>
                      <button
                        type="button"
                        onClick={() => setActiveSlug(a.slug)}
                        className="block w-full py-1.5 text-left text-sm"
                      >
                        <span
                          className={
                            on
                              ? "font-semibold text-navy-800 underline decoration-navy-700 decoration-2 underline-offset-4"
                              : "text-muted hover:text-ink"
                          }
                        >
                          {a.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>

      {/* Right content */}
      <article className="min-w-0 max-w-3xl">
        {active ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gold-600">
              {active.category}
            </div>
            <h1 className="mt-1 font-serif text-3xl text-ink">{active.title}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted">
              {active.readingMinutes ? <span>{active.readingMinutes} min read</span> : null}
            </div>
            {active.summary ? (
              <p className="mt-3 text-lg text-muted">{active.summary}</p>
            ) : null}
            <div className="mt-6">
              <ArticleRenderer body={active.body} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Select an article to read it here.</p>
        )}
      </article>
    </div>
  );
}
