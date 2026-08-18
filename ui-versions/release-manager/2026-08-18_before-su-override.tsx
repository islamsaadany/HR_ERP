"use client";

import { useMemo, useState, useTransition } from "react";
import { formatEGP } from "@/lib/labels";
import { useRouter } from "next/navigation";
import { setReleased } from "@/app/(app)/admin/benefits/release-actions";

export type ReleaseBenefit = { id: string; label: string };
export type ReleaseRow = {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  employmentType: string;
  tenure: string; // band label ("" if unset)
  startDate: string;
  phone: string;
  manager: string;
  status: string; // employee status label
  amount: number | null; // band-derived allowance; null = needs attention (see `attention`)
  attention: string; // when amount is null, the specific reason ("" otherwise)
  released: boolean;
  releasedAt: string; // YYYY-MM-DD or ""
  // A recorded claim for this benefit: "approved" (HR back-filled, awaiting Finance
  // payment) or "reimbursed" (Finance confirmed). "" when there is none.
  claimState: "requested" | "approved" | "reimbursed" | "";
  claimDate: string; // YYYY-MM-DD or ""
};

// Column catalogue. `anchor` columns are always in the sheet; the rest are toggleable.
// Salary and personal fields (DOB/marital/dependants) are deliberately absent.
const COLUMNS = [
  { key: "rowNum", label: "#", anchor: true, def: true },
  { key: "name", label: "Employee", anchor: false, def: true },
  { key: "tenure", label: "Tenure", anchor: false, def: true },
  { key: "amount", label: "Allowance value (EGP)", anchor: true, def: true },
  { key: "status", label: "Status", anchor: false, def: true },
  { key: "email", label: "Email", anchor: false, def: false },
  { key: "department", label: "Department", anchor: false, def: false },
  { key: "title", label: "Title", anchor: false, def: false },
  { key: "employmentType", label: "Employment type", anchor: false, def: false },
  { key: "startDate", label: "Start date", anchor: false, def: false },
  { key: "phone", label: "Phone", anchor: false, def: false },
  { key: "manager", label: "Manager", anchor: false, def: false },
] as const;

const csvCell = (v: string | number | null | undefined): string => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Blank (not "EGP 0") when a band amount isn't set for this employee — the Status column
// carries the reason. Formatting itself is the shared one.
const egp = (n: number | null) => (n == null ? "" : formatEGP(n));
// Short employment-type code for the Type column / CSV.
const typeCode = (label: string) =>
  label === "Full-time" ? "FT" : label === "Part-time" ? "PT" : "";
const statusText = (r: ReleaseRow) =>
  r.amount == null
    ? r.attention || "no allowance"
    : r.released
    ? `Released — ${r.releasedAt}`
    : r.claimState === "reimbursed"
    ? `Reimbursed — ${r.claimDate}`
    : r.claimState === "approved"
    ? "Approved — awaiting payment"
    : r.claimState === "requested"
    ? "Claim submitted — in review"
    : "Not released";

/** A row that already received (or reserved) this benefit via a claim can't be released on top. */
const blockedByClaim = (r: ReleaseRow) => !r.released && r.claimState !== "";

export function ReleaseManager({
  benefits,
  selectedBenefitId,
  benefitName,
  planYearName,
  rows,
}: {
  benefits: ReleaseBenefit[];
  selectedBenefitId: string | null;
  benefitName: string;
  planYearName: string;
  rows: ReleaseRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<Set<string>>(
    new Set(COLUMNS.filter((c) => c.def && !c.anchor).map((c) => c.key))
  );
  const [msg, setMsg] = useState<string | null>(null);

  // Rows that can actually be released (active + resolvable amount + not already served by
  // a claim this cycle — releasing on top would pay the person twice; 2026-08-18).
  const releasable = useMemo(() => rows.filter((r) => r.amount != null && !blockedByClaim(r)), [rows]);
  const total = useMemo(() => rows.reduce((s, r) => s + (r.amount ?? 0), 0), [rows]);
  const releasedCount = rows.filter((r) => r.released).length;
  const reimbursedCount = rows.filter((r) => !r.released && r.claimState === "reimbursed").length;
  const awaitingCount = rows.filter((r) => !r.released && r.claimState === "approved").length;
  const requestedCount = rows.filter((r) => !r.released && r.claimState === "requested").length;

  const activeCols = COLUMNS.filter((c) => c.anchor || cols.has(c.key));

  function cellValue(key: string, r: ReleaseRow, i: number): string | number {
    switch (key) {
      case "rowNum": return i + 1;
      case "name": return r.name;
      case "tenure": return r.tenure;
      case "amount": return r.amount ?? "";
      case "status": return statusText(r);
      case "email": return r.email;
      case "department": return r.department;
      case "title": return r.title;
      case "employmentType": return r.employmentType;
      case "startDate": return r.startDate;
      case "phone": return r.phone;
      case "manager": return r.manager;
      default: return "";
    }
  }

  function downloadCsv() {
    const header = activeCols.map((c) => c.label);
    const lines = [header.map(csvCell).join(",")];
    rows.forEach((r, i) => lines.push(activeCols.map((c) => csvCell(cellValue(c.key, r, i))).join(",")));
    const csv = lines.join("\r\n") + "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(benefitName || "benefit").replace(/[^\w.-]+/g, "_")}-${planYearName.replace(/[^\w.-]+/g, "_")}-release.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function mark(released: boolean) {
    const ids = [...selected];
    if (!selectedBenefitId || ids.length === 0) return;
    startTransition(async () => {
      const res = await setReleased(selectedBenefitId, ids, released);
      if (res.ok) {
        setSelected(new Set());
        const skipped = res.skipped ?? 0;
        setMsg(
          released
            ? skipped > 0
              ? `Marked ${ids.length - skipped} as released · ${skipped} skipped — already received this benefit via a claim this cycle.`
              : `Marked ${ids.length} as released.`
            : `Marked ${ids.length} as not released.`
        );
        router.refresh();
      } else {
        setMsg(res.error ?? "Something went wrong.");
      }
    });
  }

  const allReleasableSelected = releasable.length > 0 && releasable.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allReleasableSelected ? new Set() : new Set(releasable.map((r) => r.id)));
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const btn = "rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50";

  return (
    <div className="mt-6 space-y-6">
      {/* Benefit picker */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="release-benefit" className="block text-xs font-medium uppercase tracking-wide text-muted mb-1">Benefit to release</label>
          <select
            id="release-benefit"
            value={selectedBenefitId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              router.push(v ? `/admin/benefits/release?benefit=${v}` : "/admin/benefits/release");
            }}
            className="w-80 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="">— choose a benefit —</option>
            {benefits.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted">Plan year: <span className="font-medium text-ink">{planYearName}</span> · salary-based benefits (Loans) aren&apos;t listed.</p>
      </div>

      {msg ? <div className="rounded-lg bg-navy-50 px-4 py-2 text-sm text-navy-800">{msg}</div> : null}

      {!selectedBenefitId ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Choose a benefit to see the applicable team, mark releases, and download the sheet.
        </div>
      ) : (
        <>
          {/* Column picker */}
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Columns to download</h3>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-navy-600 hover:text-navy-800" onClick={() => setCols(new Set(COLUMNS.filter((c) => !c.anchor).map((c) => c.key)))}>Select all</button>
                <span className="text-line">·</span>
                <button type="button" className="text-navy-600 hover:text-navy-800" onClick={() => setCols(new Set())}>Select none</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {COLUMNS.map((c) =>
                c.anchor ? (
                  <span key={c.key} className="rounded-full bg-navy-50 px-3 py-1 text-xs font-medium text-navy-700" title="Always included">{c.label}</span>
                ) : (
                  <label key={c.key} className={"cursor-pointer rounded-full border px-3 py-1 text-xs " + (cols.has(c.key) ? "border-navy-300 bg-navy-50 text-navy-800" : "border-line text-muted")}>
                    <input type="checkbox" className="sr-only" checked={cols.has(c.key)} onChange={() => setCols((s) => { const n = new Set(s); n.has(c.key) ? n.delete(c.key) : n.add(c.key); return n; })} />
                    {c.label}
                  </label>
                )
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending || selected.size === 0} onClick={() => mark(true)} className={btn + " bg-navy-800 text-white hover:bg-navy-700"}>
              Mark {selected.size || ""} released
            </button>
            <button type="button" disabled={pending || selected.size === 0} onClick={() => mark(false)} className={btn + " border border-line text-navy-700 hover:bg-navy-50"}>
              Mark not released
            </button>
            <button type="button" onClick={downloadCsv} className={btn + " border border-line text-ink hover:bg-paper ml-auto"}>
              Download CSV
            </button>
          </div>

          {/* Employee table */}
          <div className="ff-data-scroll rounded-xl border border-line bg-surface">
            <table className="ff-data-table text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-3 py-2"><input type="checkbox" checked={allReleasableSelected} onChange={toggleAll} aria-label="Select all" /></th>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Tenure</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Allowance</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-sm italic text-muted">No applicable active employees for this benefit.</td></tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={r.amount == null || blockedByClaim(r)}
                          title={blockedByClaim(r) ? "Already received via a claim this cycle — can't be released again" : undefined}
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Select ${r.name}`}
                        />
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted">{i + 1}</td>
                      <td className="px-3 py-2 text-ink">{r.name}</td>
                      <td className="px-3 py-2 text-muted">{r.tenure || "—"}</td>
                      <td className="px-3 py-2">
                        {typeCode(r.employmentType) ? (
                          <span
                            className={
                              "inline-block min-w-[30px] rounded-full px-2 py-0.5 text-center text-[11px] font-bold tracking-wide " +
                              (r.employmentType === "Part-time"
                                ? "bg-gold-100 text-gold-800"
                                : "bg-navy-50 text-navy-700")
                            }
                          >
                            {typeCode(r.employmentType)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink">{egp(r.amount)}</td>
                      <td className="px-3 py-2">
                        {r.amount == null ? (
                          <span className="text-xs font-medium text-gold-700">{r.attention || "no allowance"}</span>
                        ) : r.released ? (
                          <span className="text-xs font-semibold text-navy-700">Released — {r.releasedAt}</span>
                        ) : r.claimState === "reimbursed" ? (
                          <span className="text-xs font-semibold text-green-700">Reimbursed — {r.claimDate}</span>
                        ) : r.claimState === "approved" ? (
                          <span className="text-xs font-semibold text-blue-700">Approved — awaiting payment</span>
                        ) : r.claimState === "requested" ? (
                          <span className="text-xs font-semibold text-gold-700">Claim submitted — in review</span>
                        ) : (
                          <span className="text-xs font-semibold text-red-700">Not released</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {rows.length > 0 ? (
                <tfoot>
                  <tr className="border-t border-line bg-surface text-sm">
                    <td colSpan={5} className="px-3 py-2 text-right font-medium text-muted">
                      Total · {rows.length} employees · {releasedCount} released{reimbursedCount ? ` · ${reimbursedCount} reimbursed` : ""}{awaitingCount ? ` · ${awaitingCount} awaiting payment` : ""}{requestedCount ? ` · ${requestedCount} claim in review` : ""}
                    </td>
                    <td className="px-3 py-2 text-right font-serif text-navy-800 tabular-nums">{egp(total)}</td>
                    <td className="px-3 py-2" />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
