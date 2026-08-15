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
  businessUnitId: string | null;
  businessUnit: string | null;
};

type SortKey = "title" | "department";
type SortDir = "asc" | "desc";

/** Filter value meaning "don't filter by business unit". */
const ALL_UNITS = "";

export function DirectoryBrowser({
  people,
  departments: managed = [],
  myBusinessUnitId = null,
}: {
  people: DirEntry[];
  /** Managed department list (spec 014); unioned with values present on the people shown. */
  departments?: string[];
  /**
   * The viewer's own business unit (spec 024) — pre-selected so the directory
   * opens on their own company. Null (no unit set) opens on everyone.
   */
  myBusinessUnitId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  // Business-unit filter, defaulted to the viewer's own unit.
  const [unit, setUnit] = useState<string>(myBusinessUnitId ?? ALL_UNITS);
  // Alphabetical sort on the Title / Department columns (click a header to toggle).
  // Null = natural order (as delivered by the server: by name).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const departments = useMemo(() => {
    const set = new Set<string>(managed);
    for (const p of people) if (p.department) set.add(p.department);
    return Array.from(set).sort();
  }, [people, managed]);

  // Units present among the people shown. With fewer than two there is nothing
  // to choose between, so the filter is hidden entirely.
  const units = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of people) if (p.businessUnitId && p.businessUnit) map.set(p.businessUnitId, p.businessUnit);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [people]);
  const showUnitFilter = units.length > 1;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = people.filter((p) => {
      if (showUnitFilter && unit !== ALL_UNITS && p.businessUnitId !== unit) return false;
      if (dept && p.department !== dept) return false;
      if (needle && !p.name.toLowerCase().includes(needle)) return false;
      return true;
    });

    if (!sortKey) return rows;

    // Alphabetical A→Z / Z→A on the chosen column; blanks always sort last.
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = (a[sortKey] ?? "").trim();
      const bv = (b[sortKey] ?? "").trim();
      if (!av && !bv) return 0;
      if (!av) return 1;
      if (!bv) return -1;
      return av.localeCompare(bv, undefined, { sensitivity: "base" }) * dir;
    });
  }, [people, q, dept, unit, showUnitFilter, sortKey, sortDir]);

  return (
    // Full-height flex column (desktop) so the table below fills the leftover
    // space and is the only scroller; mobile keeps normal flow.
    <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name…"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
        />
        {showUnitFilter ? (
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            aria-label="Business unit"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
          >
            <option value={ALL_UNITS}>All business units</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : null}
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value)}
          aria-label="Department"
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
        <div className="mt-4 ff-data-scroll rounded-xl border border-line bg-surface md:flex-1 md:min-h-0 md:!max-h-none">
          <table className="ff-data-table text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <SortableHeader
                  label="Title"
                  active={sortKey === "title"}
                  dir={sortDir}
                  onClick={() => toggleSort("title")}
                />
                <SortableHeader
                  label="Department"
                  active={sortKey === "department"}
                  dir={sortDir}
                  onClick={() => toggleSort("department")}
                />
                <th className="px-4 py-3 font-medium">Business unit</th>
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
                  <td className="px-4 py-3 text-muted">{p.businessUnit ?? "—"}</td>
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

/**
 * A clickable column header that sorts the table alphabetically (A→Z / Z→A).
 *
 * Colors are set explicitly on the button because the shared header row paints
 * white text on navy (`.ff-data-table thead th`) — a muted/navy button would
 * repaint itself dark-on-dark and read as a greyed-out header. Inactive is the
 * same white as every other header; the active column is gold.
 */
function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={onClick}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        className={
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase tracking-wide transition hover:text-gold-200 " +
          (active ? "text-gold-300" : "text-white")
        }
      >
        {label}
        <span className={active ? "text-gold-300" : "text-navy-300"} aria-hidden="true">
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
