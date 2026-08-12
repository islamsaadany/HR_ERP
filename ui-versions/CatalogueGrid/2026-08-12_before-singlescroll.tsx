"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CLAIM_TYPE_LABEL } from "@/lib/benefits/claims";
import { updateCatalogueCell } from "@/app/(app)/admin/benefits/config-actions";

// Serializable row for the unified Benefits Catalogue grid (spec 021).
export type CatalogueGridRow = {
  kind: "guaranteed" | "catalog";
  id: string;
  name: string;
  note: string;
  typeLabel: "Guaranteed" | "Flexible" | "Medical";
  scope: string; // "Personal" | "Family" | ""
  category: string;
  claimType: "NONE" | "NOTE" | "PROOF";
  eligibleFullTime: boolean;
  eligiblePartTime: boolean;
  coverage: string; // display: "Fixed" | "Salary" | "100%" | "80%"
  coverageEditable: boolean;
  coverageRate: number;
  active: boolean;
  statusEditable: boolean;
  order: number;
};

type ColKey = "name" | "type" | "category" | "claimType" | "ft" | "pt" | "coverage" | "status";
type ColDef = { key: ColKey; label: string; sortable: boolean; hideable: boolean };

const COLUMNS: ColDef[] = [
  { key: "name", label: "Benefit", sortable: true, hideable: false },
  { key: "type", label: "Type", sortable: true, hideable: true },
  { key: "category", label: "Category", sortable: true, hideable: true },
  { key: "claimType", label: "Claim requirement", sortable: true, hideable: true },
  { key: "ft", label: "FT", sortable: true, hideable: true },
  { key: "pt", label: "PT", sortable: true, hideable: true },
  { key: "coverage", label: "Coverage", sortable: true, hideable: true },
  { key: "status", label: "Status", sortable: true, hideable: true },
];

const COL_STORAGE_KEY = "benefits:catalogue:columns:v1";
const TYPE_BADGE: Record<string, string> = {
  Guaranteed: "bg-gold-50 text-gold-800",
  Flexible: "bg-navy-50 text-navy-700",
  Medical: "bg-[#efe9f7] text-[#5b3fa0]",
};
const CLAIM_TYPES: ("NONE" | "NOTE" | "PROOF")[] = ["NONE", "NOTE", "PROOF"];

type ColCfg = { key: ColKey; visible: boolean };

export function CatalogueGrid({
  rows,
  categories,
  toolbarExtra,
}: {
  rows: CatalogueGridRow[];
  /** Known category names, for the category cell's suggestions. */
  categories: string[];
  /** Optional control rendered at the right of the toolbar (e.g. an "Add benefit" button). */
  toolbarExtra?: React.ReactNode;
}) {
  const [rowsState, setRowsState] = useState<CatalogueGridRow[]>(rows);
  const [cfg, setCfg] = useState<ColCfg[]>(COLUMNS.map((c) => ({ key: c.key, visible: true })));
  const [editing, setEditing] = useState<{ id: string; key: ColKey } | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const [sort, setSort] = useState<{ key: ColKey; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const [, startTransition] = useTransition();

  const colByKey = useMemo(() => new Map(COLUMNS.map((c) => [c.key, c])), []);

  // Keep local rows in sync when the server sends fresh data (after a revalidate).
  useEffect(() => setRowsState(rows), [rows]);

  // Persisted column order/visibility, merging in any columns added since it was saved.
  useEffect(() => {
    const saved = window.localStorage.getItem(COL_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as ColCfg[];
      const known = new Set(COLUMNS.map((c) => c.key));
      const kept = parsed.filter((c) => known.has(c.key));
      const keptKeys = new Set(kept.map((c) => c.key));
      const appended = COLUMNS.filter((c) => !keptKeys.has(c.key)).map((c) => ({ key: c.key, visible: true }));
      const merged = [...kept, ...appended].map((c) => (c.key === "name" ? { ...c, visible: true } : c));
      if (merged.length) setCfg(merged);
    } catch {
      /* ignore malformed config */
    }
  }, []);

  function persistCfg(next: ColCfg[]) {
    setCfg(next);
    window.localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(next));
  }
  function toggleColumn(key: ColKey) {
    persistCfg(cfg.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }
  function reorder(from: ColKey, to: ColKey) {
    if (from === to) return;
    const next = [...cfg];
    const fromIdx = next.findIndex((c) => c.key === from);
    const toIdx = next.findIndex((c) => c.key === to);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistCfg(next);
  }

  const visibleCols = useMemo(
    () => cfg.filter((c) => c.visible).map((c) => colByKey.get(c.key)!).filter(Boolean),
    [cfg, colByKey]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rowsState;
    return rowsState.filter((r) => `${r.name} ${r.category} ${r.typeLabel}`.toLowerCase().includes(needle));
  }, [rowsState, q]);

  const sorted = useMemo(() => {
    if (!sort) return [...filtered].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    const { key, dir } = sort;
    const val = (r: CatalogueGridRow): string | number => {
      switch (key) {
        case "name": return r.name.toLowerCase();
        case "type": return r.typeLabel;
        case "category": return (r.category || "").toLowerCase();
        case "claimType": return CLAIM_TYPES.indexOf(r.claimType);
        case "ft": return r.eligibleFullTime ? 1 : 0;
        case "pt": return r.eligiblePartTime ? 1 : 0;
        case "coverage": return r.coverageEditable ? r.coverageRate : r.coverage === "Salary" ? -2 : r.coverage === "Fixed" ? -1 : parseInt(r.coverage, 10) || 0;
        case "status": return r.active ? 1 : 0;
        default: return "";
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return c * dir;
    });
  }, [filtered, sort]);

  function onHeaderSort(key: ColKey) {
    if (!colByKey.get(key)?.sortable) return;
    setSort((s) => (s && s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  }

  function commit(row: CatalogueGridRow, key: string, value: string, optimistic: Partial<CatalogueGridRow>) {
    setEditing(null);
    const cellId = `${row.id}:${key}`;
    const original = row;
    setRowsState((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...optimistic } : r)));
    setSavingCell(cellId);
    setErr(null);
    startTransition(async () => {
      const res = await updateCatalogueCell(row.kind, row.id, key, value);
      setSavingCell(null);
      if (!res.ok) {
        setRowsState((rs) => rs.map((r) => (r.id === original.id ? original : r)));
        setErr(res.error);
      }
    });
  }

  const arrow = (key: ColKey) => {
    const isSorted = sort?.key === key;
    return <span className={"ml-1.5 text-[10px] " + (isSorted ? "text-gold-600" : "text-navy-300")}>{isSorted ? (sort!.dir === 1 ? "↑" : "↓") : "↕"}</span>;
  };

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search benefit, category, type…"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
        />
        <div className="relative">
          <button type="button" onClick={() => setColsOpen((o) => !o)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">Columns ▾</button>
          {colsOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-line bg-surface p-2 shadow-lg">
                <p className="px-2 pb-1 text-[11px] uppercase tracking-wide text-muted">Show columns</p>
                {cfg.map((c) => {
                  const col = colByKey.get(c.key);
                  if (!col) return null;
                  return (
                    <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-navy-50">
                      <input type="checkbox" checked={c.visible} disabled={!col.hideable} onChange={() => toggleColumn(c.key)} className="h-4 w-4" />
                      <span className={col.hideable ? "text-ink" : "text-muted"}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
        {toolbarExtra}
      </div>

      {err ? <p className="mt-3 rounded bg-red-50 px-3 py-1 text-xs font-medium text-red-700">{err}</p> : null}

      <datalist id="catalogue-categories">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>

      <div className="mt-3 ff-data-scroll rounded-xl border border-line bg-surface">
        <table className="ff-data-table ff-catalogue text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-3 py-3 text-right font-medium text-muted">#</th>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  draggable
                  onDragStart={() => setDragKey(col.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragKey) reorder(dragKey, col.key); setDragKey(null); }}
                  onClick={() => onHeaderSort(col.key)}
                  title={col.sortable ? "Click to sort · drag to reorder" : "Drag to reorder"}
                  aria-sort={sort?.key === col.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={"cursor-move select-none whitespace-nowrap px-3 py-3 font-medium " + (col.sortable ? "hover:text-navy-700" : "")}
                >
                  {col.label}{col.sortable ? arrow(col.key) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={`${row.kind}_${row.id}`} className={"border-b border-line last:border-b-0 " + (row.active ? "" : "opacity-60")}>
                <td className="px-3 py-2 text-right align-top text-xs tabular-nums text-muted">{i + 1}</td>
                {visibleCols.map((col) => (
                  <td key={col.key} className="px-3 py-2 align-top">
                    <CatCell
                      row={row}
                      colKey={col.key}
                      editing={editing?.id === row.id && editing?.key === col.key}
                      saving={savingCell === `${row.id}:${cellField(col.key)}`}
                      onStartEdit={() => setEditing({ id: row.id, key: col.key })}
                      onCancel={() => setEditing(null)}
                      onCommit={commit}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr><td colSpan={visibleCols.length + 1} className="px-3 py-10 text-center text-sm text-muted">No benefits match this search.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Which server field a column writes (ft/pt/status/coverage map to their real column names).
function cellField(key: ColKey): string {
  if (key === "ft") return "eligibleFullTime";
  if (key === "pt") return "eligiblePartTime";
  if (key === "status") return "active";
  if (key === "coverage") return "coverageRate";
  return key;
}

function CatCell({
  row, colKey, editing, saving, onStartEdit, onCancel, onCommit,
}: {
  row: CatalogueGridRow;
  colKey: ColKey;
  editing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onCommit: (row: CatalogueGridRow, key: string, value: string, optimistic: Partial<CatalogueGridRow>) => void;
}) {
  const dim = saving ? " opacity-50" : "";

  // ── Type: static badge ───────────────────────────────────────────────────
  if (colKey === "type") {
    return (
      <span className={"inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase " + TYPE_BADGE[row.typeLabel] + dim}>
        {row.typeLabel}{row.scope ? " · " + row.scope : ""}
      </span>
    );
  }

  // ── FT / PT: direct checkbox toggle ──────────────────────────────────────
  if (colKey === "ft" || colKey === "pt") {
    const on = colKey === "ft" ? row.eligibleFullTime : row.eligiblePartTime;
    const field = colKey === "ft" ? "eligibleFullTime" : "eligiblePartTime";
    return (
      <input
        type="checkbox"
        checked={on}
        disabled={saving}
        onChange={(e) => onCommit(row, field, String(e.target.checked), colKey === "ft" ? { eligibleFullTime: e.target.checked } : { eligiblePartTime: e.target.checked })}
        className={"h-4 w-4" + dim}
      />
    );
  }

  // ── Status: Visible/Hidden toggle (flexible/medical only) ─────────────────
  if (colKey === "status") {
    if (!row.statusEditable) return <span className={"text-xs italic text-muted" + dim}>Always on</span>;
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => onCommit(row, "active", String(!row.active), { active: !row.active })}
        className={"rounded-full px-2 py-0.5 text-xs font-medium " + (row.active ? "bg-navy-50 text-navy-700" : "bg-gray-100 text-muted") + dim}
      >
        {row.active ? "Visible" : "Hidden"}
      </button>
    );
  }

  // ── Coverage: editable % for flexible; read-only otherwise ────────────────
  if (colKey === "coverage") {
    if (!row.coverageEditable) return <span className={"text-ink" + dim}>{row.coverage}</span>;
    if (editing) {
      return (
        <input
          autoFocus type="number" min={1} max={100} defaultValue={row.coverageRate}
          onBlur={(e) => onCommit(row, "coverageRate", e.target.value, { coverage: `${Math.round(Number(e.target.value)) || row.coverageRate}%`, coverageRate: Math.round(Number(e.target.value)) || row.coverageRate })}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }}
          className="w-20 rounded border border-navy-400 bg-surface px-2 py-1 text-sm focus:outline-none"
        />
      );
    }
    return <button type="button" onClick={onStartEdit} className={"block w-full rounded px-2 py-1 text-left text-sm text-ink hover:bg-navy-50" + dim}>{row.coverage}</button>;
  }

  // ── Claim requirement: editable select ───────────────────────────────────
  if (colKey === "claimType") {
    if (editing) {
      return (
        <select
          autoFocus defaultValue={row.claimType}
          onChange={(e) => onCommit(row, "claimType", e.target.value, { claimType: e.target.value as CatalogueGridRow["claimType"] })}
          onBlur={onCancel}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          className="w-full rounded border border-navy-400 bg-surface px-2 py-1 text-sm focus:outline-none"
        >
          {CLAIM_TYPES.map((t) => <option key={t} value={t}>{CLAIM_TYPE_LABEL[t]}</option>)}
        </select>
      );
    }
    return (
      <button type="button" onClick={onStartEdit} className={"block rounded px-1 py-1 text-left hover:bg-navy-50" + dim}>
        <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">{CLAIM_TYPE_LABEL[row.claimType]}</span>
      </button>
    );
  }

  // ── Category: editable text with suggestions ──────────────────────────────
  if (colKey === "category") {
    if (editing) {
      return (
        <input
          autoFocus list="catalogue-categories" defaultValue={row.category}
          onBlur={(e) => onCommit(row, "category", e.target.value, { category: e.target.value.trim() })}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }}
          className="w-full min-w-[140px] rounded border border-navy-400 bg-surface px-2 py-1 text-sm focus:outline-none"
        />
      );
    }
    return <button type="button" onClick={onStartEdit} className={"block w-full rounded px-2 py-1 text-left text-sm hover:bg-navy-50" + dim}><span className={row.category ? "text-ink" : "text-muted"}>{row.category || "—"}</span></button>;
  }

  // ── Name: editable text (+ description subtitle) ──────────────────────────
  if (editing) {
    return (
      <input
        autoFocus defaultValue={row.name}
        onBlur={(e) => onCommit(row, "name", e.target.value, { name: e.target.value.trim() || row.name })}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") onCancel(); }}
        className="w-full min-w-[160px] rounded border border-navy-400 bg-surface px-2 py-1 text-sm focus:outline-none"
      />
    );
  }
  return (
    <button type="button" onClick={onStartEdit} className={"block w-full rounded px-2 py-1 text-left hover:bg-navy-50" + dim}>
      <span className="font-medium text-ink">{row.name}</span>
      {row.note ? <span className="ml-0 block text-xs text-muted">{row.note}</span> : null}
    </button>
  );
}
