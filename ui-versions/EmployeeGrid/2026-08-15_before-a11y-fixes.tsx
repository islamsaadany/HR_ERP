"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  EMPLOYMENT_TYPE_LABEL,
  TENURE_BAND_LABEL,
  TENURE_BAND_ORDER,
  MARITAL_STATUS_LABEL,
  STATUS_LABEL,
  ROLE_LABEL,
  tenureBandDisplay,
} from "@/lib/labels";
import { updateEmployeeField } from "@/app/(app)/admin/employees/actions";
import { saveEmployeeColumns } from "@/app/(app)/admin/employees/grid-prefs-actions";
import { deriveTenureBand, statusFromEndDate } from "@/lib/tenure";

// Serializable row shape passed from the server page (dates as YYYY-MM-DD).
export type GridRow = {
  id: string;
  name: string;
  email: string;
  title: string;
  department: string;
  phone: string;
  employmentType: "" | "FULL_TIME" | "PART_TIME";
  tenureBand: "" | "BAND_6MO_2Y" | "BAND_2_4Y" | "BAND_4_7Y" | "BAND_7_10Y";
  startDate: string;
  endDate: string;
  monthlySalary: string;
  dateOfBirth: string;
  maritalStatus: "" | "SINGLE" | "MARRIED" | "DIVORCED" | "WIDOWED";
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  status: "ACTIVE" | "LEFT";
  role: "EMPLOYEE" | "HR_ADMIN" | "SUPER_USER" | "FINANCE";
  reportsToId: string;
  reportsToName: string;
  businessUnitId: string;
  employeeId: string;
};

type ColType = "text" | "email" | "date" | "select" | "manager";
type Option = { value: string; label: string };
type Col = {
  key: keyof GridRow & string;
  label: string;
  type: ColType;
  options?: Option[];
  editable: boolean;
  hideable: boolean;
};

const COL_STORAGE_KEY = "employees:grid:columns:v1";
const FILTERS_STORAGE_KEY = "employees:grid:filters:v1";

// Columns whose header title is clickable to sort the table (A→Z, then Z→A).
const SORTABLE_KEYS = new Set<string>([
  "name",
  "employeeId",
  "department",
  "employmentType",
  "status",
  "monthlySalary",
  "startDate",
]);

// Default column order + which start visible (the rest are toggled on via "Columns").
const DEFAULT_VISIBLE = new Set([
  "name",
  "email",
  "title",
  "department",
  "employmentType",
  "status",
  "role",
]);

export type ColCfg = { key: string; visible: boolean };

const blank = (label = "—"): Option => ({ value: "", label });

/**
 * Merge a saved column layout with the current column set: keep saved columns
 * that still exist (in their saved order + visibility), append any columns added
 * since the layout was saved, and keep Name always visible.
 */
function mergeCfg(saved: ColCfg[], defaultCfg: ColCfg[], knownKeys: Set<string>): ColCfg[] {
  const kept = saved.filter((c) => knownKeys.has(c.key));
  const keptKeys = new Set(kept.map((c) => c.key));
  const appended = defaultCfg.filter((c) => !keptKeys.has(c.key));
  return [...kept, ...appended].map((c) => (c.key === "name" ? { ...c, visible: true } : c));
}

export function EmployeeGrid({
  rows,
  managers,
  departments,
  businessUnits,
  canEditRole,
  canSeeSalary,
  initialColumns,
}: {
  rows: GridRow[];
  managers: { id: string; name: string }[];
  departments: string[];
  businessUnits: { id: string; name: string }[];
  canEditRole: boolean;
  /** Salary is confidential — hidden entirely (column + inline edit) unless the actor is a Super User. */
  canSeeSalary: boolean;
  /** This admin's saved column layout (account-level, cross-device). Null = none saved. */
  initialColumns?: ColCfg[] | null;
}) {
  const columns: Col[] = useMemo(() => {
    const managerOptions: Option[] = [
      blank("— none —"),
      ...managers.map((m) => ({ value: m.id, label: m.name })),
    ];
    return ([
      { key: "name", label: "Name", type: "text", editable: false, hideable: false },
      { key: "email", label: "Email", type: "email", editable: true, hideable: true },
      { key: "employeeId", label: "Employee ID", type: "text", editable: true, hideable: true },
      { key: "title", label: "Title", type: "text", editable: true, hideable: true },
      {
        key: "department",
        label: "Department",
        type: "select",
        options: [blank(), ...departments.map((d) => ({ value: d, label: d }))],
        editable: true,
        hideable: true,
      },
      {
        key: "businessUnitId",
        label: "Business Unit",
        type: "select",
        options: [blank(), ...businessUnits.map((b) => ({ value: b.id, label: b.name }))],
        editable: true,
        hideable: true,
      },
      { key: "phone", label: "Phone", type: "text", editable: true, hideable: true },
      {
        key: "employmentType",
        label: "Type",
        type: "select",
        options: [
          blank(),
          { value: "FULL_TIME", label: EMPLOYMENT_TYPE_LABEL.FULL_TIME },
          { value: "PART_TIME", label: EMPLOYMENT_TYPE_LABEL.PART_TIME },
        ],
        editable: true,
        hideable: true,
      },
      {
        key: "tenureBand",
        label: "Tenure",
        type: "select",
        options: [blank(), ...TENURE_BAND_ORDER.map((b) => ({ value: b, label: TENURE_BAND_LABEL[b] }))],
        // Derived from the hire date — not editable.
        editable: false,
        hideable: true,
      },
      { key: "startDate", label: "Start date", type: "date", editable: true, hideable: true },
      { key: "endDate", label: "End date", type: "date", editable: true, hideable: true },
      { key: "monthlySalary", label: "Monthly salary", type: "text", editable: true, hideable: true },
      { key: "dateOfBirth", label: "Date of birth", type: "date", editable: true, hideable: true },
      {
        key: "maritalStatus",
        label: "Marital status",
        type: "select",
        options: [
          blank(),
          { value: "SINGLE", label: MARITAL_STATUS_LABEL.SINGLE },
          { value: "MARRIED", label: MARITAL_STATUS_LABEL.MARRIED },
          { value: "DIVORCED", label: MARITAL_STATUS_LABEL.DIVORCED },
          { value: "WIDOWED", label: MARITAL_STATUS_LABEL.WIDOWED },
        ],
        editable: true,
        hideable: true,
      },
      { key: "emergencyContactName", label: "Emergency name", type: "text", editable: true, hideable: true },
      { key: "emergencyContactRelationship", label: "Emergency relationship", type: "text", editable: true, hideable: true },
      { key: "emergencyContactPhone", label: "Emergency phone", type: "text", editable: true, hideable: true },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "ACTIVE", label: STATUS_LABEL.ACTIVE },
          { value: "LEFT", label: STATUS_LABEL.LEFT },
        ],
        // Derived from the end date (an end date ⇒ Left) — not editable.
        editable: false,
        hideable: true,
      },
      {
        key: "role",
        label: "Role",
        type: "select",
        options: [
          { value: "EMPLOYEE", label: ROLE_LABEL.EMPLOYEE },
          { value: "HR_ADMIN", label: ROLE_LABEL.HR_ADMIN },
          { value: "FINANCE", label: ROLE_LABEL.FINANCE },
          { value: "SUPER_USER", label: ROLE_LABEL.SUPER_USER },
        ],
        editable: canEditRole,
        hideable: true,
      },
      {
        key: "reportsToId",
        label: "Manager",
        type: "manager",
        options: managerOptions,
        editable: true,
        hideable: true,
      },
    ] as Col[]).filter((c) => canSeeSalary || c.key !== "monthlySalary");
  }, [departments, businessUnits, managers, canEditRole, canSeeSalary]);

  const colByKey = useMemo(
    () => new Map<string, Col>(columns.map((c) => [c.key, c])),
    [columns]
  );
  const defaultCfg: ColCfg[] = useMemo(
    () => columns.map((c) => ({ key: c.key, visible: DEFAULT_VISIBLE.has(c.key) })),
    [columns]
  );

  const knownKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);
  // Seed from the account-level layout when present (SSR-safe: it's a prop, so the
  // server and client first render agree — no flash, no hydration mismatch). When
  // absent, start from defaults and let the mount effect apply the localStorage cache.
  const [cfg, setCfg] = useState<ColCfg[]>(() =>
    initialColumns && initialColumns.length
      ? mergeCfg(initialColumns, defaultCfg, new Set(columns.map((c) => c.key)))
      : defaultCfg
  );
  const [rowsState, setRowsState] = useState<GridRow[]>(rows);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  // Active sort: which column and which direction (1 = A→Z, -1 = Z→A). null = server order.
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [, startTransition] = useTransition();

  // Filters
  const [q, setQ] = useState("");
  const [fDept, setFDept] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fRole, setFRole] = useState("");
  const [fBu, setFBu] = useState("");

  // Load persisted filter selections once on mount (loaded in an effect, not a
  // useState initializer, to avoid a server/client hydration mismatch).
  useEffect(() => {
    const saved = window.localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!saved) return;
    try {
      const f = JSON.parse(saved) as Record<string, string>;
      if (f.q) setQ(f.q);
      if (f.fDept) setFDept(f.fDept);
      if (f.fStatus) setFStatus(f.fStatus);
      if (f.fType) setFType(f.fType);
      if (f.fRole) setFRole(f.fRole);
      if (f.fBu) setFBu(f.fBu);
    } catch {
      /* ignore malformed filters */
    }
  }, []);

  // Persist on each change (write the full set so one localStorage key holds it all).
  function persistFilters(next: {
    q: string;
    fDept: string;
    fStatus: string;
    fType: string;
    fRole: string;
    fBu: string;
  }) {
    window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
  }
  const onQ = (v: string) => { setQ(v); persistFilters({ q: v, fDept, fStatus, fType, fRole, fBu }); };
  const onDept = (v: string) => { setFDept(v); persistFilters({ q, fDept: v, fStatus, fType, fRole, fBu }); };
  const onStatus = (v: string) => { setFStatus(v); persistFilters({ q, fDept, fStatus: v, fType, fRole, fBu }); };
  const onType = (v: string) => { setFType(v); persistFilters({ q, fDept, fStatus, fType: v, fRole, fBu }); };
  const onRole = (v: string) => { setFRole(v); persistFilters({ q, fDept, fStatus, fType, fRole: v, fBu }); };
  const onBu = (v: string) => { setFBu(v); persistFilters({ q, fDept, fStatus, fType, fRole, fBu: v }); };

  // Fall back to the localStorage cache only when there's no account-level layout
  // (a fresh browser before the first save, or an un-migrated DB). The account
  // layout, when present, already seeded state above and is the source of truth.
  useEffect(() => {
    if (initialColumns && initialColumns.length) return;
    const saved = window.localStorage.getItem(COL_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as ColCfg[];
      const merged = mergeCfg(parsed, defaultCfg, knownKeys);
      if (merged.length) setCfg(merged);
    } catch {
      /* ignore malformed config */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persistCfg(next: ColCfg[]) {
    setCfg(next);
    // Instant same-browser cache…
    try {
      window.localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled → account save still runs below */
    }
    // …and account-level so it follows the user across devices. Fire-and-forget:
    // cosmetic, so a failed save never blocks or disrupts the grid.
    void saveEmployeeColumns(next).catch(() => {});
  }

  function toggleColumn(key: string) {
    persistCfg(cfg.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }

  // Show/hide every hideable column at once. Non-hideable columns (e.g. Name)
  // always stay visible.
  function setAllColumns(visible: boolean) {
    persistCfg(
      cfg.map((c) => {
        const col = colByKey.get(c.key);
        return col && !col.hideable ? { ...c, visible: true } : { ...c, visible };
      })
    );
  }

  function reorder(from: string, to: string) {
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
    return rowsState.filter((r) => {
      if (fDept && r.department !== fDept) return false;
      if (fStatus && r.status !== fStatus) return false;
      if (fType && r.employmentType !== fType) return false;
      if (fRole && r.role !== fRole) return false;
      if (fBu && r.businessUnitId !== fBu) return false;
      if (needle) {
        const hay = `${r.name} ${r.email} ${r.title}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rowsState, q, fDept, fStatus, fType, fRole, fBu]);

  // Sort is a view-only layer over the filtered rows — it never changes data,
  // and it re-runs whenever filters or the sort selection change.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const { key, dir } = sort;
    const col = colByKey.get(key);
    const valueOf = (row: GridRow): string | number => {
      if (key === "monthlySalary") return parseFloat(row.monthlySalary) || 0;
      if (key === "startDate") return row.startDate || ""; // ISO YYYY-MM-DD sorts chronologically
      if (col?.type === "select") {
        const raw = row[key as keyof GridRow] as string;
        return col.options?.find((o) => o.value === raw)?.label || "";
      }
      return ((row[key as keyof GridRow] as string) || "").toLowerCase();
    };
    return [...filtered].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const c =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return c * dir;
    });
  }, [filtered, sort, colByKey]);

  function onHeaderSort(key: string) {
    if (!SORTABLE_KEYS.has(key)) return;
    setSort((s) =>
      s && s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }
    );
  }

  function applyLocal(row: GridRow, key: string, value: string): GridRow {
    if (key === "reportsToId") {
      const name = managers.find((m) => m.id === value)?.name ?? "";
      return { ...row, reportsToId: value, reportsToName: name };
    }
    // Editing a date recomputes the read-only column it drives, so the grid
    // reflects the change instantly (the server persists the same derivation).
    if (key === "startDate") {
      const band = deriveTenureBand(value ? new Date(value) : null).band ?? "";
      return { ...row, startDate: value, tenureBand: band as GridRow["tenureBand"] };
    }
    if (key === "endDate") {
      return { ...row, endDate: value, status: statusFromEndDate(value ? new Date(value) : null) };
    }
    return { ...row, [key]: value } as GridRow;
  }

  function commit(row: GridRow, key: keyof GridRow & string, value: string) {
    setEditing(null);
    if (value === (row[key] as string)) return; // no change
    const cellId = `${row.id}:${key}`;
    const original = row;
    setRowsState((rs) => rs.map((r) => (r.id === row.id ? applyLocal(r, key, value) : r)));
    setSavingCell(cellId);
    setErr(null);
    startTransition(async () => {
      const res = await updateEmployeeField(row.id, key, value);
      setSavingCell(null);
      if (!res.ok) {
        setRowsState((rs) => rs.map((r) => (r.id === original.id ? original : r)));
        setErr(res.error);
      }
    });
  }

  return (
    // Full-height flex column (desktop) so the scroll box below fills the
    // leftover space and becomes the only scroller; mobile keeps normal flow.
    <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      {/* Toolbar: filters + columns */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Search name, email, title…"
          className="min-w-[200px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
        />
        <FilterSelect value={fDept} onChange={onDept} allLabel="All departments">
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </FilterSelect>
        <FilterSelect value={fType} onChange={onType} allLabel="All types">
          <option value="FULL_TIME">{EMPLOYMENT_TYPE_LABEL.FULL_TIME}</option>
          <option value="PART_TIME">{EMPLOYMENT_TYPE_LABEL.PART_TIME}</option>
        </FilterSelect>
        <FilterSelect value={fStatus} onChange={onStatus} allLabel="All statuses">
          <option value="ACTIVE">{STATUS_LABEL.ACTIVE}</option>
          <option value="LEFT">{STATUS_LABEL.LEFT}</option>
        </FilterSelect>
        <FilterSelect value={fRole} onChange={onRole} allLabel="All roles">
          <option value="EMPLOYEE">{ROLE_LABEL.EMPLOYEE}</option>
          <option value="HR_ADMIN">{ROLE_LABEL.HR_ADMIN}</option>
          <option value="SUPER_USER">{ROLE_LABEL.SUPER_USER}</option>
        </FilterSelect>
        {businessUnits.length > 0 ? (
          <FilterSelect value={fBu} onChange={onBu} allLabel="All business units">
            {businessUnits.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </FilterSelect>
        ) : null}

        <div className="relative">
          <button
            type="button"
            onClick={() => setColsOpen((o) => !o)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
          >
            Columns ▾
          </button>
          {colsOpen ? (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setColsOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-line bg-surface p-2 shadow-lg">
                <div className="flex items-center justify-between px-2 pb-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted">Show columns</p>
                  <div className="flex items-center gap-1 text-[11px] font-medium">
                    <button
                      type="button"
                      onClick={() => setAllColumns(true)}
                      className="rounded px-1.5 py-0.5 text-navy-700 hover:bg-navy-50"
                    >
                      All
                    </button>
                    <span className="text-line" aria-hidden="true">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllColumns(false)}
                      className="rounded px-1.5 py-0.5 text-navy-700 hover:bg-navy-50"
                    >
                      None
                    </button>
                  </div>
                </div>
                {cfg.map((c) => {
                  const col = colByKey.get(c.key);
                  if (!col) return null;
                  return (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-navy-50"
                    >
                      <input
                        type="checkbox"
                        checked={c.visible}
                        disabled={!col.hideable}
                        onChange={() => toggleColumn(c.key)}
                        className="h-4 w-4"
                      />
                      <span className={col.hideable ? "text-ink" : "text-muted"}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-muted">
          {filtered.length} of {rowsState.length} · click a cell to edit · click a header to sort · drag a header to reorder
        </p>
        {err ? (
          <p className="rounded bg-red-50 px-3 py-1 text-xs font-medium text-red-700">{err}</p>
        ) : null}
      </div>

      <div className="mt-3 ff-data-scroll rounded-xl border border-line bg-surface md:flex-1 md:min-h-0 md:!max-h-none">
        <table className="ff-data-table text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              {visibleCols.map((col) => {
                const isSortable = SORTABLE_KEYS.has(col.key);
                const isSorted = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    draggable
                    onDragStart={() => setDragKey(col.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragKey) reorder(dragKey, col.key);
                      setDragKey(null);
                    }}
                    onClick={() => onHeaderSort(col.key)}
                    title={isSortable ? "Click to sort · drag to reorder" : "Drag to reorder"}
                    aria-sort={isSorted ? (sort!.dir === 1 ? "ascending" : "descending") : undefined}
                    className={
                      "cursor-move select-none whitespace-nowrap px-3 py-3 font-medium " +
                      (isSortable ? "hover:text-navy-700" : "")
                    }
                  >
                    {col.label}
                    {isSortable ? (
                      <span
                        className={
                          "ml-1.5 text-[10px] " + (isSorted ? "text-gold-600" : "text-navy-300")
                        }
                      >
                        {isSorted ? (sort!.dir === 1 ? "↑" : "↓") : "↕"}
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                {visibleCols.map((col) => {
                  const cellId = `${row.id}:${col.key}`;
                  const isEditing = editing?.id === row.id && editing?.key === col.key;
                  const saving = savingCell === cellId;
                  // Name is not editable — it links straight to the profile
                  // (replacing the old duplicate "Open" action column).
                  if (col.key === "name") {
                    return (
                      <td key={col.key} className="px-3 py-2 align-top">
                        <Link
                          href={`/admin/employees/${row.id}`}
                          className="block whitespace-nowrap rounded px-2 py-1 text-sm font-medium text-navy-700 hover:bg-navy-50 hover:text-navy-900 hover:underline"
                        >
                          {row.name || "—"}
                        </Link>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className="px-3 py-2 align-top">
                      <Cell
                        row={row}
                        col={col}
                        isEditing={isEditing}
                        saving={saving}
                        onStartEdit={() => col.editable && setEditing({ id: row.id, key: col.key })}
                        onCommit={(v) => commit(row, col.key, v)}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length} className="px-3 py-10 text-center text-sm text-muted">
                  No employees match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
    >
      <option value="">{allLabel}</option>
      {children}
    </select>
  );
}

function fmtDate(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}

function displayValue(row: GridRow, col: Col): string {
  const raw = row[col.key] as string;
  if (col.type === "date") return fmtDate(raw);
  if (col.type === "manager") return row.reportsToName || "—";
  // Tenure is derived from the hire date; show "< 6 months" for a sub-6-month hire
  // (consistent with the profile, edit form, and release list) rather than a bare "—".
  if (col.key === "tenureBand") return tenureBandDisplay(row.startDate ? new Date(row.startDate) : null);
  if (col.type === "select") {
    return col.options?.find((o) => o.value === raw)?.label || "—";
  }
  return raw || "—";
}

function Cell({
  row,
  col,
  isEditing,
  saving,
  onStartEdit,
  onCommit,
  onCancel,
}: {
  row: GridRow;
  col: Col;
  isEditing: boolean;
  saving: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const raw = row[col.key] as string;

  if (isEditing) {
    if (col.type === "select" || col.type === "manager") {
      const options =
        col.type === "manager"
          ? (col.options ?? []).filter((o) => o.value !== row.id) // can't report to self
          : col.options ?? [];
      return (
        <select
          autoFocus
          defaultValue={raw}
          onChange={(e) => onCommit(e.target.value)}
          onBlur={onCancel}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
          className="w-full rounded border border-navy-400 bg-surface px-2 py-1 text-sm focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        autoFocus
        type={col.type === "date" ? "date" : col.type === "email" ? "email" : "text"}
        defaultValue={raw}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") onCancel();
        }}
        className="w-full min-w-[120px] rounded border border-navy-400 bg-surface px-2 py-1 text-sm focus:outline-none"
      />
    );
  }

  const content = displayValue(row, col);
  const isRole = col.key === "role";
  const isStatus = col.key === "status";
  return (
    <button
      type="button"
      onClick={onStartEdit}
      disabled={!col.editable}
      className={
        "block w-full whitespace-nowrap rounded px-2 py-1 text-left text-sm " +
        (col.editable ? "cursor-text hover:bg-navy-50" : "cursor-default") +
        (saving ? " opacity-50" : "")
      }
    >
      {isStatus ? (
        <span
          className={
            "rounded-full px-2 py-0.5 text-xs " +
            (raw === "ACTIVE" ? "bg-navy-50 text-navy-700" : "bg-gray-100 text-muted")
          }
        >
          {content}
        </span>
      ) : isRole && raw !== "EMPLOYEE" ? (
        <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-800">
          {content}
        </span>
      ) : (
        <span className={content === "—" ? "text-muted" : "text-ink"}>{content}</span>
      )}
    </button>
  );
}
