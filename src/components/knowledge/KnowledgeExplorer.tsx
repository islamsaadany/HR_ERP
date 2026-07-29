"use client";

import { useMemo, useState } from "react";
import { ArticleRenderer } from "./ArticleRenderer";

export type ArticleFull = {
  slug: string;
  title: string;
  cluster: string | null;
  category: string;
  summary: string | null;
  body: string;
  readingMinutes: number | null;
};

function Chevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={"shrink-0 transition-transform " + (open ? "" : "-rotate-90") + " " + className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function KnowledgeExplorer({ articles }: { articles: ArticleFull[] }) {
  const [q, setQ] = useState("");
  const [activeSlug, setActiveSlug] = useState(articles[0]?.slug ?? "");

  const searching = q.trim().length > 0;

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(n) ||
        (a.cluster ?? "").toLowerCase().includes(n) ||
        a.category.toLowerCase().includes(n) ||
        (a.summary ?? "").toLowerCase().includes(n) ||
        a.body.toLowerCase().includes(n)
    );
  }, [articles, q]);

  // Group into Cluster -> Topic -> Articles, order following each item's first article.
  const clusters = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, Map<string, ArticleFull[]>>();
    for (const a of filtered) {
      const ck = a.cluster ?? "Other";
      if (!map.has(ck)) {
        map.set(ck, new Map());
        order.push(ck);
      }
      const topics = map.get(ck)!;
      if (!topics.has(a.category)) topics.set(a.category, []);
      topics.get(a.category)!.push(a);
    }
    return order.map((ck) => ({
      cluster: ck,
      topics: Array.from(map.get(ck)!.entries()).map(([topic, items]) => ({ topic, items })),
      count: Array.from(map.get(ck)!.values()).reduce((n, l) => n + l.length, 0),
    }));
  }, [filtered]);

  const active = articles.find((a) => a.slug === activeSlug) ?? filtered[0] ?? null;

  const activeIndex = active ? filtered.findIndex((a) => a.slug === active.slug) : -1;
  const nextArticle = activeIndex >= 0 && activeIndex < filtered.length - 1 ? filtered[activeIndex + 1] : null;

  // Expanded clusters/topics — default to the active article's cluster + topic.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const a = articles[0];
    return new Set(a ? [`c:${a.cluster ?? "Other"}`, `t:${a.cluster ?? "Other"}|${a.category}`] : []);
  });
  const toggle = (k: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const clusterOpen = (c: string) => searching || expanded.has(`c:${c}`);
  const topicOpen = (c: string, t: string) => searching || expanded.has(`t:${c}|${t}`);

  function openArticle(a: ArticleFull, scroll = false) {
    setActiveSlug(a.slug);
    const ck = a.cluster ?? "Other";
    setExpanded((prev) => new Set(prev).add(`c:${ck}`).add(`t:${ck}|${a.category}`));
    if (scroll && typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* Left nav: Cluster -> Topic -> Article */}
      <nav className="lg:sticky lg:top-6 h-fit">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search articles…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />
        {clusters.length === 0 ? (
          <p className="mt-5 text-sm text-muted">No articles match.</p>
        ) : (
          <div className="mt-4 space-y-1">
            {clusters.map((cl) => {
              const cOpen = clusterOpen(cl.cluster);
              return (
                <div key={cl.cluster}>
                  {/* Cluster header */}
                  <button
                    type="button"
                    onClick={() => toggle(`c:${cl.cluster}`)}
                    className="flex w-full items-center gap-2 rounded-md py-2 text-left hover:bg-navy-50/60"
                  >
                    <Chevron open={cOpen} className="h-4 w-4 text-navy-400" />
                    <span className="text-sm font-semibold text-navy-900">{cl.cluster}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted">{cl.count}</span>
                  </button>

                  {cOpen ? (
                    <div className="ml-2 border-l border-line pl-2">
                      {cl.topics.map((tp) => {
                        const tOpen = topicOpen(cl.cluster, tp.topic);
                        return (
                          <div key={tp.topic}>
                            {/* Topic header */}
                            <button
                              type="button"
                              onClick={() => toggle(`t:${cl.cluster}|${tp.topic}`)}
                              className="flex w-full items-center gap-1.5 rounded-md py-1.5 text-left"
                            >
                              <Chevron open={tOpen} className="h-3.5 w-3.5 text-navy-300" />
                              <span className="text-[13px] font-medium text-navy-700">{tp.topic}</span>
                              <span className="ml-auto text-[11px] tabular-nums text-muted/70">{tp.items.length}</span>
                            </button>

                            {tOpen ? (
                              <ul className="mb-1 ml-2 space-y-0.5 border-l border-line pl-3">
                                {tp.items.map((a) => {
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
              {active.cluster ? `${active.cluster} · ${active.category}` : active.category}
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
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-gold-600">Next</span>
                    <span className="mt-0.5 block truncate text-sm font-medium text-ink">{nextArticle.title}</span>
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
