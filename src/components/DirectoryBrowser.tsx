"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";

export type DirEntry = {
  id: string;
  name: string;
  title: string | null;
  department: string | null;
  email: string;
  phone: string | null;
  photoUrl: string | null;
};

export function DirectoryBrowser({ people }: { people: DirEntry[] }) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");

  const departments = useMemo(
    () =>
      Array.from(new Set(people.map((p) => p.department).filter(Boolean))).sort() as string[],
    [people]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => {
      if (dept && p.department !== dept) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [people, q, dept]);

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <p className="mt-3 text-xs text-muted">
        {filtered.length} {filtered.length === 1 ? "person" : "people"}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No one matches that search.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/directory/${p.id}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-navy-300"
            >
              <Avatar name={p.name} photoUrl={p.photoUrl} />
              <div className="min-w-0">
                <div className="truncate font-medium text-ink">{p.name}</div>
                <div className="truncate text-sm text-muted">{p.title ?? "—"}</div>
                <div className="truncate text-xs text-muted">{p.department ?? ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
