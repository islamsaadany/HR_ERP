"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type SectionFull = {
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  actionLabel: string | null;
  actionHref: string | null;
};
export type ResourceItem = {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
};

export function HandbookExplorer({
  sections,
  resources,
}: {
  sections: SectionFull[];
  resources: ResourceItem[];
}) {
  const [q, setQ] = useState("");
  const [activeSlug, setActiveSlug] = useState(sections[0]?.slug ?? "");

  const filteredSections = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return sections;
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(n) ||
        (s.summary ?? "").toLowerCase().includes(n) ||
        s.body.toLowerCase().includes(n)
    );
  }, [sections, q]);

  const resourceGroups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ResourceItem[]>();
    for (const r of resources) {
      if (!map.has(r.category)) {
        map.set(r.category, []);
        order.push(r.category);
      }
      map.get(r.category)!.push(r);
    }
    return order.map((cat) => ({ cat, items: map.get(cat)! }));
  }, [resources]);

  const active =
    sections.find((s) => s.slug === activeSlug) ?? filteredSections[0] ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
      {/* Left list */}
      <nav className="lg:sticky lg:top-6 h-fit">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Handbook
          </div>
          {filteredSections.length === 0 ? (
            <p className="text-sm text-muted">No sections match.</p>
          ) : (
            <ul className="space-y-0.5">
              {filteredSections.map((s) => {
                const on = s.slug === active?.slug;
                return (
                  <li key={s.slug}>
                    <button
                      type="button"
                      onClick={() => setActiveSlug(s.slug)}
                      className="block w-full py-1.5 text-left text-sm"
                    >
                      <span
                        className={
                          on
                            ? "font-semibold text-navy-800 underline decoration-navy-700 decoration-2 underline-offset-4"
                            : "text-muted hover:text-ink"
                        }
                      >
                        {s.title}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {resourceGroups.length > 0 ? (
          <div className="mt-6">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Resources
            </div>
            {resourceGroups.map((g) => (
              <div key={g.cat} className="mb-3">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted/70">
                  {g.cat}
                </div>
                <ul className="space-y-0.5">
                  {g.items.map((r) => (
                    <li key={r.id}>
                      <a
                        href={`/api/resources/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 py-1.5 text-sm text-navy-700 hover:underline"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
                        </svg>
                        {r.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </nav>

      {/* Right content */}
      <article className="min-w-0 max-w-3xl">
        {active ? (
          <>
            <h1 className="font-serif text-3xl text-ink">{active.title}</h1>
            {active.summary ? (
              <p className="mt-2 text-lg text-muted">{active.summary}</p>
            ) : null}
            <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
              {active.body || "Content coming soon."}
            </div>
            {active.actionHref && active.actionLabel ? (
              <div className="mt-6">
                <Link
                  href={active.actionHref}
                  className="inline-flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
                >
                  {active.actionLabel} <span aria-hidden>→</span>
                </Link>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">Select a section to read it here.</p>
        )}
      </article>
    </div>
  );
}
