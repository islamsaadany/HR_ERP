"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportRow, ReportChip } from "@/lib/benefits/report";
import { formatNumber } from "@/lib/labels";

/**
 * The benefits reporting table (spec 034; mockup signed off 2026-08-18): summary tiles
 * that always equal the VISIBLE table's sums, a sortable/filterable per-employee table,
 * and a row-click popup with the person's full cycle story. Read-only throughout —
 * every figure arrives precomputed by the server report builder (lib/benefits/report),
 * this component only filters, sorts and presents.
 */

const CHIP_CLASS: Record<ReportChip, string> = {
  ACTIVE: "border border-green-200 bg-green-50 text-green-700",
  PENDING: "border border-gold-300 bg-gold-100 text-gold-800",
  NO_ACTIVITY: "border border-line bg-paper text-muted",
  NO_POOL: "border border-line bg-paper text-muted",
  EXHAUSTED: "border border-red-200 bg-red-50 text-red-700",
  // Over the ceiling is a stronger state than exhausted — solid, not tinted.
  OVER_POOL: "border border-red-300 bg-red-100 font-semibold text-red-800",
};

function chipLabel(r: ReportRow): string {
  switch (r.chip) {
    case "NO_POOL":
      return `No pool${r.noPoolReason ? ` — ${r.noPoolReason}` : ""}`;
    case "NO_ACTIVITY":
      return "No activity";
    case "ACTIVE":
      return "Active";
    case "PENDING":
      return `Pending review (${r.pendingCount})`;
    case "EXHAUSTED":
      return "Pool exhausted";
    case "OVER_POOL":
      // Name the size of the hole, not just its existence — "over pool" alone sends the
      // operator hunting for the number that is already right here.
      return `Over pool by ${formatNumber(Math.abs(r.remaining ?? 0))}`;
  }
}

const CLAIM_CHIP: Record<string, string> = {
  SUBMITTED: "border border-gold-300 bg-gold-100 text-gold-800",
  APPROVED: "border border-green-200 bg-green-50 text-green-700",
  REIMBURSED: "border border-green-200 bg-green-50 text-green-700",
  REJECTED: "border border-red-200 bg-red-50 text-red-700",
};
const CLAIM_LABEL: Record<string, string> = {
  SUBMITTED: "Pending",
  APPROVED: "Approved",
  REIMBURSED: "Reimbursed",
  REJECTED: "Rejected",
};

/** "—" for a null/zero money cell — the mockup's convention for "nothing here". */
function money(n: number | null): string {
  if (n == null) return "—";
  return n === 0 ? "—" : formatNumber(n);
}

type SortKey = "name" | "ceiling" | "medical" | "flexUsed" | "pending" | "remaining" | "guaranteed";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "PENDING", label: "Pending review" },
  { value: "ACTIVE", label: "Active" },
  { value: "EXHAUSTED", label: "Pool exhausted" },
  { value: "NO_ACTIVITY", label: "No activity" },
  { value: "NO_POOL", label: "No pool" },
];

export function BenefitsReportTable({
  rows,
  cycleName,
  departments,
  cycles,
  selectedCycleId,
}: {
  rows: ReportRow[];
  cycleName: string;
  departments: string[];
  cycles: { id: string; label: string }[];
  selectedCycleId: string;
}) {
  const router = useRouter();
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [includeLeavers, setIncludeLeavers] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [openRow, setOpenRow] = useState<ReportRow | null>(null);

  // Close the popup with Escape — the house modal behaviour.
  useEffect(() => {
    if (!openRow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openRow]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (includeLeavers || !r.left) &&
        (!department || r.department === department) &&
        (!status || r.chip === status) &&
        (!q || r.name.toLowerCase().includes(q) || (r.email ?? "").toLowerCase().includes(q))
    );
    const val = (r: ReportRow): number | string =>
      sort.key === "name" ? r.name.toLowerCase() : (r[sort.key] ?? -1);
    return filtered.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return -sort.dir;
      if (av > bv) return sort.dir;
      return a.name.localeCompare(b.name);
    });
  }, [rows, department, status, search, includeLeavers, sort]);

  // FR-004: the tiles ARE the visible table's column sums — same array, no second query.
  const tiles = useMemo(() => {
    const sum = (f: (r: ReportRow) => number) => visible.reduce((n, r) => n + f(r), 0);
    const ceilings = sum((r) => r.ceiling ?? 0);
    const used = sum((r) => r.medical + r.flexUsed);
    return {
      ceilings,
      pooled: visible.filter((r) => r.ceiling != null).length,
      medical: sum((r) => r.medical),
      flexUsed: sum((r) => r.flexUsed),
      pending: sum((r) => r.pending),
      remaining: sum((r) => r.remaining ?? 0),
      remainingPct: ceilings > 0 ? Math.round(((ceilings - used) / ceilings) * 100) : null,
      guaranteed: sum((r) => r.guaranteed),
    };
  }, [visible]);

  const sortableTh = (key: SortKey, label: string, moneyCol = true) => (
    <th
      className={`cursor-pointer select-none bg-navy-800 px-3 py-2.5 font-semibold text-white ${moneyCol ? "text-right" : "text-left"}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((-s.dir) as 1 | -1) : key === "name" ? 1 : -1 }))}
      title="Sort"
    >
      {label}
      <span className={`ml-1 text-[10px] ${sort.key === key ? "text-gold-300" : "text-navy-300"}`}>
        {sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
      </span>
    </th>
  );

  const inputCls =
    "rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-navy-500 focus:outline-none";

  // SC-003: the Excel carries the CURRENT filter, so the same filters ride the export URL
  // and the route re-applies them server-side.
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ cycle: selectedCycleId });
    if (department) params.set("department", department);
    if (status) params.set("status", status);
    if (search.trim()) params.set("q", search.trim());
    if (includeLeavers) params.set("leavers", "1");
    return `/api/admin/benefits/report/export?${params.toString()}`;
  }, [selectedCycleId, department, status, search, includeLeavers]);

  return (
    <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <select
          value={selectedCycleId}
          onChange={(e) => router.push(`/admin/benefits/report?cycle=${e.target.value}`)}
          className={`${inputCls} font-medium`}
          aria-label="Benefits cycle"
        >
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name…"
          className={`${inputCls} min-w-[170px]`}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeLeavers}
            onChange={(e) => setIncludeLeavers(e.target.checked)}
            className="accent-navy-700"
          />
          Include leavers
        </label>
        <span className="flex-1" />
        <a
          href={exportHref}
          className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
        >
          Download Excel
        </a>
      </div>

      {/* ── Summary tiles — always the visible table's sums (FR-004) ──────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { k: "Pool ceilings", v: tiles.ceilings, s: `${tiles.pooled} ${tiles.pooled === 1 ? "employee" : "employees"} with a pool` },
          { k: "Medical charged", v: tiles.medical, s: "this cycle's share" },
          { k: "Flexible used", v: tiles.flexUsed, s: tiles.pending > 0 ? `incl. ${formatNumber(tiles.pending)} pending` : "nothing pending" },
          { k: "Remaining", v: tiles.remaining, s: tiles.remainingPct != null ? `${tiles.remainingPct}% of ceilings` : "—" },
          { k: "Guaranteed paid", v: tiles.guaranteed, s: "own budget — not pool" },
        ].map((t) => (
          <div key={t.k} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t.k}</div>
            <div className="mt-1 font-serif text-2xl text-ink tabular-nums">{formatNumber(t.v)}</div>
            <div className="mt-0.5 text-[11px] text-muted">{t.s}</div>
          </div>
        ))}
      </div>

      {/* ── The table ─────────────────────────────────────────────────── */}
      {/* The ONE scroller on this page (house pattern, same as the registry and catalogue):
          `ff-data-scroll` + `ff-data-table` give the sticky navy header and frozen first
          column, and md:flex-1/!max-h-none hand the height to the flex column so the table
          fills the viewport instead of a guessed 70vh. */}
      <div className="mt-4 ff-data-scroll rounded-xl border border-line bg-surface md:flex-1 md:min-h-0 md:!max-h-none">
        <table className="ff-data-table w-full min-w-[860px] text-sm">
          <thead>
            <tr>
              {sortableTh("name", "Employee", false)}
              {sortableTh("ceiling", "Pool ceiling")}
              {sortableTh("medical", "Medical")}
              {sortableTh("flexUsed", "Flex used")}
              {sortableTh("pending", "Pending")}
              {sortableTh("remaining", "Remaining")}
              {sortableTh("guaranteed", "Guaranteed")}
              <th className="bg-navy-800 px-3 py-2.5 text-left font-semibold text-white">Utilization</th>
              <th className="bg-navy-800 px-3 py-2.5 text-left font-semibold text-white">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  No employees match these filters.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr
                  key={r.userId}
                  onClick={() => setOpenRow(r)}
                  className="cursor-pointer border-b border-line last:border-b-0 hover:bg-navy-50/60"
                >
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink">
                      {r.name}
                      {r.left ? (
                        <span className="ml-2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-bold text-muted">Left</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted">{r.department ?? "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">
                    {r.ceiling != null ? formatNumber(r.ceiling) : "—"}
                    {r.prorated ? (
                      <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[9px] font-bold text-gold-800">prorated</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{money(r.medical)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{money(r.flexUsed)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{money(r.pending)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink">
                    {r.remaining != null ? formatNumber(r.remaining) : "—"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-ink">{money(r.guaranteed)}</td>
                  <td className="px-3 py-3">
                    {r.utilization != null ? (
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-navy-50">
                        <div
                          className="h-full rounded-full bg-navy-700"
                          style={{ width: `${Math.min(100, Math.round(r.utilization * 100))}%` }}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CHIP_CLASS[r.chip]}`}>
                      {chipLabel(r)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {visible.length > 0 ? (
            <tfoot>
              {/* Totals for the rows currently shown — the same figures as the tiles above, so
                  filtering the table moves both together. */}
              <tr className="sticky bottom-0 z-[3] border-t-2 border-navy-200 bg-paper font-bold text-ink">
                <td className="px-3 py-3 !bg-paper">
                  Total · {visible.length} {visible.length === 1 ? "person" : "people"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNumber(tiles.ceilings)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tiles.medical)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tiles.flexUsed)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tiles.pending)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNumber(tiles.remaining)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{money(tiles.guaranteed)}</td>
                <td className="px-3 py-3 text-[11px] font-semibold text-muted">
                  {tiles.remainingPct != null ? `${100 - tiles.remainingPct}% used` : ""}
                </td>
                <td className="px-3 py-3" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        {visible.length} of {rows.filter((r) => includeLeavers || !r.left).length} people shown · figures match each
        employee&apos;s own Benefits page (pending claims already reserve pool money; guaranteed benefits never draw
        from the pool). Click a row for the full story.
      </p>

      {/* ── The person popup (FR-006) ─────────────────────────────────── */}
      {openRow ? <PersonPopup row={openRow} cycleName={cycleName} onClose={() => setOpenRow(null)} /> : null}
    </div>
  );
}

function PersonPopup({ row, cycleName, onClose }: { row: ReportRow; cycleName: string; onClose: () => void }) {
  const d = row.detail;
  const flexClaims = d.claims.filter((c) => c.kind === "flex");
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/50 p-4 backdrop-blur-[2px] md:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${row.name} — benefits report`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl text-ink">{row.name}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {[row.department, row.contract !== "—" ? row.contract : null, cycleName].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-navy-300 hover:text-navy-700"
          >
            ✕ Close
          </button>
        </div>

        {/* Pool */}
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-gold-700">Pool</p>
        {row.ceiling != null ? (
          <div className="mt-1 text-sm">
            <Kv
              label={`Ceiling (${row.contract}${row.prorated && row.proratedFrom != null ? ` — prorated from ${formatNumber(row.proratedFrom)}` : ` · ${d.cycleMonths}-month cycle`})`}
              value={formatNumber(row.ceiling)}
            />
            <Kv label="Medical — this cycle's charge" value={money(row.medical)} />
            <Kv label="Flexible claims (incl. pending)" value={money(row.flexUsed)} />
            <div className="flex items-center justify-between gap-3 border-b-2 border-navy-100 py-1.5">
              <span className="font-semibold text-ink">Remaining</span>
              <span className="font-semibold tabular-nums text-ink">{formatNumber(row.remaining ?? 0)}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Per-benefit cap this cycle: {d.cap != null ? formatNumber(d.cap) : "—"}
              {d.flexCapEnabled ? " (50% of the pool)" : " (50% cap off — the pool is the only limit)"} · medical is
              exempt from the cap.
            </p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No pool{row.noPoolReason ? ` — ${row.noPoolReason}` : ""}.</p>
        )}

        {/* Medical */}
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-gold-700">Medical</p>
        {d.medical ? (
          <div className="mt-1 text-sm">
            <Kv
              label={`${d.medical.termLabel ? `Policy term ${d.medical.termLabel} · ` : ""}committed ${d.medical.committedAt}`}
              value={`${formatNumber(d.medical.premium)} total`}
            />
            <Kv
              label={`Covers: ${d.medical.people.map((p) => `${p.label} (${p.ageAtCommit})`).join(" · ") || "—"}`}
              value={`${formatNumber(d.medical.cycleCharge)} this cycle`}
            />
            {d.medical.carriedForward > 0 ? (
              <Kv label="Carried to the next cycle" value={formatNumber(d.medical.carriedForward)} />
            ) : null}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No medical commitment this cycle.</p>
        )}

        {/* Guaranteed */}
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-gold-700">
          Guaranteed (own budget — not pool)
        </p>
        {d.guaranteedItems.length > 0 ? (
          <div className="mt-1 text-sm">
            {d.guaranteedItems.map((g, i) => (
              <Kv
                key={i}
                label={`${g.name} · ${g.kind === "release" ? "released" : "claimed"} ${g.date}${
                  g.status && g.status !== "REIMBURSED" ? ` · ${CLAIM_LABEL[g.status] ?? g.status}` : ""
                }`}
                value={formatNumber(g.amount)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">Nothing released or claimed.</p>
        )}

        {/* Flexible claims */}
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-gold-700">Flexible claims</p>
        {flexClaims.length > 0 ? (
          <div className="mt-1 text-sm">
            {flexClaims.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                <span className="min-w-0 text-muted">
                  {c.date} · <span className="text-ink">{c.benefit}</span>
                  {c.receipt != null ? ` · receipt ${formatNumber(c.receipt)} → covered ${formatNumber(c.covered)}` : ""}
                  {c.clamped ? (
                    <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 py-0.5 text-[9px] font-bold text-gold-800">clamped</span>
                  ) : null}
                  <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${CLAIM_CHIP[c.status] ?? ""}`}>
                    {CLAIM_LABEL[c.status] ?? c.status}
                  </span>
                  {c.decisionNote ? <span className="ml-1.5 text-xs italic">“{c.decisionNote}”</span> : null}
                  {c.proofHref ? (
                    <a
                      href={c.proofHref}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1.5 font-medium text-navy-600 underline hover:text-navy-800"
                    >
                      proof
                    </a>
                  ) : null}
                </span>
                <span className={`tabular-nums ${c.status === "REJECTED" ? "text-muted line-through" : "font-semibold text-ink"}`}>
                  {formatNumber(c.covered)}
                </span>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-muted">Rejected claims are history only — they never count in the pool.</p>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No flexible claims this cycle.</p>
        )}
      </div>
    </div>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5">
      <span className="min-w-0 text-muted">{label}</span>
      <span className="whitespace-nowrap tabular-nums font-medium text-ink">{value}</span>
    </div>
  );
}
