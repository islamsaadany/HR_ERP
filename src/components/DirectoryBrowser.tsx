"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";

type ViewMode = "cards" | "list";
const VIEW_KEY = "directory:view";

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
  const [view, setView] = useState<ViewMode>("cards");

  // Remember the chosen view across visits (read-only preference, client-only).
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "cards" || saved === "list") setView(saved);
  }, []);
  function chooseView(v: ViewMode) {
    setView(v);
    window.localStorage.setItem(VIEW_KEY, v);
  }

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

        {/* View toggle — cards or list (read-only) */}
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(["cards", "list"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => chooseView(v)}
              aria-pressed={view === v}
              className={
                "px-3 py-2 text-sm font-medium capitalize transition " +
                (view === v
                  ? "bg-navy-800 text-white"
                  : "bg-surface text-navy-700 hover:bg-navy-50")
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        {filtered.length} {filtered.length === 1 ? "person" : "people"}
      </p>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No one matches that search.
        </div>
      ) : view === "cards" ? (
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
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Phone</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0 hover:bg-navy-50/40">
                  <td className="px-4 py-3">
                    <Link href={`/directory/${p.id}`} className="flex items-center gap-3">
                      <Avatar name={p.name} photoUrl={p.photoUrl} />
                      <span className="font-medium text-navy-700 hover:text-navy-900">{p.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{p.title ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{p.department ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">
                    <a href={`mailto:${p.email}`} className="hover:text-navy-700">{p.email}</a>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {p.phone ? <a href={`tel:${p.phone}`} className="hover:text-navy-700">{p.phone}</a> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
