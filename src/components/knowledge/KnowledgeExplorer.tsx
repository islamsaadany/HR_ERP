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
  // Topics (categories) expanded in the left nav. Default: the active article's topic.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([articles[0]?.category].filter(Boolean) as string[])
  );

  const searching = q.trim().length > 0;

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

  // Group by category, preserving the incoming order (page sorts by `order`, so a
  // topic sorts by its lowest-ordered article and articles sort within it).
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

  const active = articles.find((a) => a.slug === activeSlug) ?? filtered[0] ?? null;

  // The next article in reading order (used by the "Next" button at the end of a read).
  const activeIndex = active ? filtered.findIndex((a) => a.slug === active.slug) : -1;
  const nextArticle = activeIndex >= 0 && activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

  function toggle(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function openArticle(a: ArticleFull, scroll = false) {
    setActiveSlug(a.slug);
    setExpanded((prev) => new Set(prev).add(a.category));
    if (scroll && typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const isOpen = (cat: string) => searching || expanded.has(cat);

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
          <div className="mt-4 space-y-1">
            {groups.map((g) => {
              const open = isOpen(g.cat);
              return (
                <div key={g.cat}>
                  {/* Topic header (collapsible, navy title) */}
                  <button
                    type="button"
                    onClick={() => toggle(g.cat)}
                    className="flex w-full items-center gap-2 rounded-md py-2 text-left hover:bg-navy-50/60"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={"h-4 w-4 shrink-0 text-navy-400 transition-transform " + (open ? "" : "-rotate-90")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <span className="text-sm font-semibold text-navy-800">{g.cat}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted">{g.items.length}</span>
                  </button>

                  {/* Topic elements */}
                  {open ? (
                    <ul className="mb-1 space-y-0.5 border-l border-line pl-3 ml-2">
                      {g.items.map((a) => {
                        const on = a.slug === active?.slug;
                        return (
                          <li key={a.slug}>
                            <button
                              type="button"
                              onClick={() => openArticle(a)}
                              className="block w-full py-1.5 text-left text-sm"
                            >
                              <span
                                className={
                                  on
                                    ? "text-ink underline underline-offset-4"
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
                  ) : null}
                </div>
              );
            })}
          </div>
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
            {active.summary ? <p className="mt-3 text-lg text-muted">{active.summary}</p> : null}
            <div className="mt-6">
              <ArticleRenderer body={active.body} />
            </div>

            {nextArticle ? (
              <div className="mt-10 border-t border-line pt-5">
                <button
                  type="button"
                  onClick={() => openArticle(nextArticle, true)}
                  className="group flex w-full items-center justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-4 text-left transition hover:border-navy-300 sm:w-auto sm:min-w-[280px]"
                >
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-600">
                      Next
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium text-ink">
                      {nextArticle.title}
                    </span>
                    <span className="block truncate text-xs text-muted">{nextArticle.category}</span>
                  </span>
                  <span className="shrink-0 text-navy-400 transition-transform group-hover:translate-x-0.5">→</span>
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">Select an article to read it here.</p>
        )}
      </article>
    </div>
  );
}
