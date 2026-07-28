"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type SectionCard = {
  slug: string;
  title: string;
  summary: string | null;
};

export function HandbookBrowser({ sections }: { sections: SectionCard[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return sections;
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(n) ||
        (s.summary ?? "").toLowerCase().includes(n)
    );
  }, [sections, q]);

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the handbook…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
      />
      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No sections match that search.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <Link
              key={s.slug}
              href={`/handbook/${s.slug}`}
              className="rounded-xl border border-line bg-surface p-4 transition hover:border-navy-300"
            >
              <div className="font-medium text-ink">{s.title}</div>
              {s.summary ? (
                <p className="mt-1 line-clamp-2 text-sm text-muted">{s.summary}</p>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
