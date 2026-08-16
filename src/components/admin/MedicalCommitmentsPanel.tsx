"use client";

import React, { useMemo, useState } from "react";
import { formatEGP as egp } from "@/lib/labels";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import { sumMedicalPremium, type Band } from "@/lib/benefits/rates";
import {
  editMedicalCommitment,
  removeMedicalCommitment,
  repriceAllCommitments,
} from "@/app/(app)/admin/benefits/actions";

/**
 * Medical commitments — the management view (mockup signed off 2026-08-16,
 * `design-mockups/medical-commitments/2026-08-16_management-view.html`).
 *
 * Replaces a list that expanded every commitment permanently: with 30+ people the
 * per-cycle charge box repeated 30 times, so the three rows that actually needed a
 * decision read exactly like the twenty-seven that didn't. Every figure and every
 * wording from that list is kept — they move behind the row you open.
 *
 * The client re-prices for PREVIEW only, with the same pure `rates.ts` helpers the
 * server uses; `editMedicalCommitment` remains the only thing that writes a premium.
 */

/** One covered person as snapshotted at commit (spec 023). */
export type CoveredPerson = { label: string; ageAtCommit: number; premiumEGP: number };

/** A dependant HR can tick on/off, with the DOB needed to price the preview. */
export type ManageDependant = { id: string; label: string; dobISO: string; covered: boolean };

export type MedicalCharge = {
  id: string;
  cycleName: string;
  months: number;
  amount: number;
  status: "APPLIED" | "SCHEDULED" | "CANCELLED";
};

export type MedicalRow = {
  id: string;
  userName: string;
  /** "You", "You +2" — the count reads at a glance; the names live in Manage. */
  coverShort: string;
  /** "spouse, 1 child" — empty when nobody else is covered. */
  coverDetail: string;
  premium: number;
  /** What this cycle's pool absorbs (spec 027). */
  thisCycle: number;
  /** Premium not yet charged to any cycle — it falls after this one ends. */
  carriesOver: number;
  /** Charged beyond what the cover costs. Zero unless something went wrong. */
  overCharged: number;
  committedAt: string;
  termLabel: string | null;
  termEndLabel: string | null;
  monthsInCycle: number;
  monthsTotal: number;
  cancelled: boolean;
  frozen: boolean;
  charges: MedicalCharge[];
  coveredPeople: CoveredPerson[];
  dependants: ManageDependant[];
  employeeDobISO: string | null;
  /** Their pool ceiling — the premium is capped at it. Null when none is configured. */
  ceiling: number | null;
};

export type NotCommittedRow = {
  id: string;
  name: string;
  contract: string;
  ceiling: number | null;
  /** Why they can't commit yet, or null when they simply haven't. */
  blockedReason: string | null;
};

type Filter = "all" | "attention" | "carrying" | "frozen" | "family" | "pending";
type SortKey = "userName" | "premium" | "thisCycle" | "carriesOver" | "committedAt";
type Expanded = { id: string; view: "charges" | "manage" } | null;

const CHARGE_STATUS_LABEL = { APPLIED: "Applied", SCHEDULED: "On cycle open", CANCELLED: "Not charged" } as const;
const CHARGE_STATUS_CLASS = {
  APPLIED: "border-green-200 bg-green-50 text-green-700",
  SCHEDULED: "border-navy-100 bg-navy-50 text-navy-700",
  CANCELLED: "border-line bg-paper text-muted",
} as const;

/** The one state worth showing in the list — worst first, so a row never reads better than it is. */
function chargeState(r: MedicalRow): { label: string; cls: string; attention: boolean } {
  if (r.overCharged > 0)
    return { label: `Over-charged ${egp(r.overCharged)}`, cls: "border-red-200 bg-red-50 text-red-700", attention: true };
  if (r.cancelled)
    return { label: "Cover ended", cls: "border-gold-300 bg-gold-50 text-gold-800", attention: true };
  if (r.frozen)
    return { label: "Part in a closed cycle", cls: "border-line bg-paper text-muted", attention: true };
  if (r.carriesOver > 0)
    return { label: `Split · ${r.monthsInCycle} of ${r.monthsTotal} mo`, cls: "border-navy-100 bg-navy-50 text-navy-700", attention: false };
  return { label: "Fully charged", cls: "border-green-200 bg-green-50 text-green-700", attention: false };
}

const TILE = "rounded-xl border border-line bg-surface px-4 py-3";
const TILE_K = "text-[10px] font-bold uppercase tracking-[0.09em] text-muted";
const TILE_V = "mt-1 font-serif text-2xl tabular-nums text-navy-800";
const TILE_S = "mt-0.5 text-xs text-muted";
const TH = "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide";
const TD = "whitespace-nowrap px-3 py-2 align-middle";

export function MedicalCommitmentsPanel({
  rows,
  notCommitted,
  eligibleCount,
  planYearId,
  planYearName,
  exportHref,
  rateBands,
}: {
  rows: MedicalRow[];
  notCommitted: NotCommittedRow[];
  eligibleCount: number;
  planYearId: string | null;
  planYearName: string | null;
  exportHref: string | null;
  rateBands: Band[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "committedAt", dir: -1 });
  const [expanded, setExpanded] = useState<Expanded>(null);

  const states = useMemo(() => new Map(rows.map((r) => [r.id, chargeState(r)])), [rows]);

  const totals = useMemo(() => {
    const premium = rows.reduce((n, r) => n + r.premium, 0);
    const attention = rows.filter((r) => states.get(r.id)?.attention).length;
    const carrying = rows.filter((r) => r.carriesOver > 0).length;
    const frozen = rows.filter((r) => r.frozen).length;
    const family = rows.filter((r) => r.coveredPeople.length > 1).length;
    return { premium, attention, carrying, frozen, family };
  }, [rows, states]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = rows.filter((r) => {
      if (q && !r.userName.toLowerCase().includes(q)) return false;
      if (filter === "attention") return !!states.get(r.id)?.attention;
      if (filter === "carrying") return r.carriesOver > 0;
      if (filter === "frozen") return r.frozen;
      if (filter === "family") return r.coveredPeople.length > 1;
      return true;
    });
    const dir = sort.dir;
    return [...matched].sort((a, b) => {
      const k = sort.key;
      if (k === "userName" || k === "committedAt") {
        return a[k].localeCompare(b[k]) * dir || a.userName.localeCompare(b.userName);
      }
      return (a[k] - b[k]) * dir || a.userName.localeCompare(b.userName);
    });
  }, [rows, states, filter, query, sort]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "userName" ? 1 : -1 }));

  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  const chip = (id: Filter, label: string, count: number, alert = false) => (
    <button
      type="button"
      onClick={() => setFilter(id)}
      aria-pressed={filter === id}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (filter === id
          ? "border-navy-800 bg-navy-800 text-white"
          : alert
            ? "border-gold-300 bg-gold-50 text-gold-800 hover:bg-gold-100"
            : "border-line bg-surface text-muted hover:bg-navy-50")
      }
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-75">{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      {/* ── Rail: counts first, money last ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={TILE}>
          <div className={TILE_K}>Eligible</div>
          <div className={TILE_V}>{eligibleCount}</div>
          <div className={TILE_S}>active employees this cycle</div>
        </div>
        <div className={TILE}>
          <div className={TILE_K}>Committed</div>
          <div className={TILE_V}>{rows.length}</div>
          <div className={TILE_S}>
            {notCommitted.length > 0 ? `${notCommitted.length} still to commit` : "everyone eligible"}
          </div>
        </div>
        <div className={TILE + " !border-gold-300 !bg-gold-50"}>
          <div className={TILE_K + " !text-gold-800"}>Needs attention</div>
          <div className={TILE_V + " !text-gold-800"}>{totals.attention}</div>
          <div className={TILE_S + " !text-gold-800"}>
            {totals.attention === 0 ? "nothing outstanding" : "over-charged · cover ended"}
          </div>
        </div>
        <div className={TILE + " !border-navy-900 !bg-navy-900"}>
          <div className={TILE_K + " !text-gold-300"}>Committed premium</div>
          <div className={TILE_V + " !text-white"}>{totals.premium.toLocaleString("en-US")}</div>
          <div className={TILE_S + " !text-navy-200"}>EGP · everyone committed so far</div>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">
            Medical commitments {planYearName ? `· ${planYearName}` : ""}
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {planYearId && rows.length > 0 ? (
              <form action={repriceAllCommitments}>
                <input type="hidden" name="planYearId" value={planYearId} />
                <ConfirmSubmitButton
                  message={`Re-price all ${rows.length} medical commitments against today's rate card? Cover stays exactly as it is — only the price is recalculated.`}
                  className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                >
                  Re-price all
                </ConfirmSubmitButton>
              </form>
            ) : null}
            {exportHref ? (
              <a
                href={exportHref}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
              >
                Export CSV
              </a>
            ) : null}
          </div>
        </div>

        <p className="mb-3 text-xs text-muted">
          Medical is the one committed benefit — locked to the employee after they commit. Open a row for its
          per-cycle split, or <strong className="font-semibold text-ink">Manage</strong> to change who is covered
          (recomputes the premium, capped at their pool) or remove the commitment so they can re-commit.
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {chip("all", "All", rows.length)}
          {chip("attention", "Needs attention", totals.attention, true)}
          {chip("carrying", "Carrying over", totals.carrying)}
          {chip("frozen", "Closed-cycle charges", totals.frozen)}
          {chip("family", "Family cover", totals.family)}
          {chip("pending", "Not committed", notCommitted.length)}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee…"
            className="ml-auto min-w-[200px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>

        {filter === "pending" ? (
          <NotCommittedTable rows={notCommitted} query={query} />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No medical commitments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 text-white">
                  <th className={TH}>
                    <button type="button" onClick={() => onSort("userName")} className="font-bold uppercase hover:text-gold-200">
                      Employee{arrow("userName")}
                    </button>
                  </th>
                  <th className={TH}>Cover</th>
                  <th className={TH + " text-right"}>
                    <button type="button" onClick={() => onSort("premium")} className="font-bold uppercase hover:text-gold-200">
                      Annual cost{arrow("premium")}
                    </button>
                  </th>
                  <th className={TH + " text-right"}>
                    <button type="button" onClick={() => onSort("thisCycle")} className="font-bold uppercase hover:text-gold-200">
                      From {planYearName ?? "this"} pool{arrow("thisCycle")}
                    </button>
                  </th>
                  <th className={TH + " text-right"}>
                    <button type="button" onClick={() => onSort("carriesOver")} className="font-bold uppercase hover:text-gold-200">
                      Carries over{arrow("carriesOver")}
                    </button>
                  </th>
                  <th className={TH}>Charge state</th>
                  <th className={TH + " text-right"}>
                    <button type="button" onClick={() => onSort("committedAt")} className="font-bold uppercase hover:text-gold-200">
                      Committed{arrow("committedAt")}
                    </button>
                  </th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                      No commitments match this filter.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => {
                    const st = states.get(r.id)!;
                    const open = expanded?.id === r.id;
                    return (
                      <React.Fragment key={r.id}>
                        <tr className={"border-t border-line align-middle " + (open ? "bg-navy-50" : "hover:bg-navy-50")}>
                          <td className={TD + " font-semibold text-ink"}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded(open && expanded?.view === "charges" ? null : { id: r.id, view: "charges" })
                              }
                              className="text-left font-semibold text-ink hover:text-navy-700"
                            >
                              <span className="mr-1.5 text-[11px] text-navy-400">
                                {open && expanded?.view === "charges" ? "▾" : "▸"}
                              </span>
                              {r.userName}
                            </button>
                          </td>
                          <td className={TD + " text-muted"}>
                            <span className="font-semibold text-ink">{r.coverShort}</span>
                            {r.coverDetail ? ` · ${r.coverDetail}` : ""}
                          </td>
                          <td className={TD + " text-right tabular-nums text-ink"}>{egp(r.premium)}</td>
                          <td className={TD + " text-right tabular-nums text-ink"}>{egp(r.thisCycle)}</td>
                          <td className={TD + " text-right tabular-nums text-muted"}>
                            {r.carriesOver > 0 ? egp(r.carriesOver) : "—"}
                          </td>
                          <td className={TD}>
                            <span className={"rounded-full border px-2 py-0.5 text-[11px] font-bold " + st.cls}>
                              {st.label}
                            </span>
                          </td>
                          <td className={TD + " text-right text-muted"}>{r.committedAt}</td>
                          <td className={TD + " text-right"}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded(open && expanded?.view === "manage" ? null : { id: r.id, view: "manage" })
                              }
                              className="rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                        {open ? (
                          <tr className="border-t-0 bg-navy-50">
                            <td colSpan={8} className="p-0">
                              {expanded?.view === "charges" ? (
                                <ChargesDetail row={r} planYearName={planYearName} />
                              ) : (
                                <ManagePanel row={r} rateBands={rateBands} onClose={() => setExpanded(null)} />
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * The per-cycle split (spec 027) — unchanged in content from the old always-open box,
 * including the four sentences that explain a carry-over, an over-charge, a cancelled
 * charge and a frozen one. The total row still only appears when there is more than one
 * cycle to add up.
 */
function ChargesDetail({ row, planYearName }: { row: MedicalRow; planYearName: string | null }) {
  const chargeTotal = row.charges.reduce((n, c) => n + c.amount, 0);
  return (
    <div className="px-3 pb-4">
      <div className="rounded-lg border border-line bg-paper p-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          Charged to{row.termLabel ? ` · policy term ${row.termLabel}` : ""}
        </p>
        {row.charges.length === 0 ? (
          <p className="text-xs text-muted">Not split across any cycle yet.</p>
        ) : (
          <>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left uppercase text-muted">
                  <th className="py-1 pr-4 font-medium">Benefits cycle</th>
                  <th className="py-1 pr-4 text-right font-medium">Months</th>
                  <th className="py-1 pr-4 text-right font-medium">From that cycle&apos;s pool</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {row.charges.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="py-1 pr-4 text-ink">{c.cycleName}</td>
                    <td className="py-1 pr-4 text-right tabular-nums text-muted">{c.months}</td>
                    <td className="py-1 pr-4 text-right tabular-nums text-ink">{egp(c.amount)}</td>
                    <td className="py-1">
                      <span className={"rounded-full border px-2 py-0.5 text-[10px] font-bold " + CHARGE_STATUS_CLASS[c.status]}>
                        {CHARGE_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {row.charges.length > 1 ? (
                  <tr className="border-t border-line font-semibold">
                    <td className="py-1 pr-4 text-ink">Total</td>
                    <td className="py-1 pr-4 text-right tabular-nums text-muted">
                      {row.charges.reduce((n, c) => n + c.months, 0)}
                    </td>
                    <td className={"py-1 pr-4 text-right tabular-nums " + (row.overCharged > 0 ? "text-red-600" : "text-ink")}>
                      {egp(chargeTotal)}
                    </td>
                    <td className="py-1" />
                  </tr>
                ) : null}
              </tbody>
            </table>
            {row.overCharged > 0 ? (
              <p className="mt-2 text-[11px] font-semibold text-red-600">
                Charged {egp(chargeTotal)} — more than the {egp(row.premium)} this cover costs. Settle it with the
                insurer; a closed cycle can&apos;t be un-charged.
              </p>
            ) : row.carriesOver > 0 ? (
              <p className="mt-2 text-[11px] text-muted">
                <b className="font-semibold text-ink">{egp(row.carriesOver)}</b> of this cover falls after{" "}
                {planYearName ?? "this cycle"} ends. It&apos;s charged to the next cycle when you open it.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-muted">Fully charged.</p>
            )}
            {row.cancelled ? (
              <p className="mt-2 rounded-lg border border-gold-300 bg-gold-50 px-2.5 py-1.5 text-[11px] text-gold-800">
                <strong className="text-navy-800">Cover ended before that cycle.</strong> The charge was never applied to
                a pool, and the premium paid in advance for cover after the leave date is recovered from the insurer —
                nothing is owed and nothing is written off.
                {row.termEndLabel
                  ? ` Recoverable to ${row.termEndLabel}, starting from the leave date — which may sit inside an already-applied charge above.`
                  : ""}
              </p>
            ) : null}
            {row.frozen ? (
              <p className="mt-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-muted">
                Part of this is charged to a closed cycle. That amount stays as it is — it has already been drawn from a
                pool that is now shut, so changing dates or re-pricing never rewrites it.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Cover & re-price. The dependant checkboxes used to sit live in every row of the list,
 * one click from a premium rewrite; here they are behind Manage, and the panel shows the
 * working (each person's age → band → contribution) plus what the change would do to the
 * premium BEFORE it is applied.
 */
function ManagePanel({ row, rateBands, onClose }: { row: MedicalRow; rateBands: Band[]; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(row.dependants.filter((d) => d.covered).map((d) => d.id))
  );

  // Preview only — the SAME pure function the server prices with (`sumMedicalPremium`,
  // cents truncated per person), then capped at the pool ceiling exactly as
  // `repriceCommitment` does. The employee's DOB is the one that can be missing; the server
  // refuses the whole re-price without it, so say so rather than show a number that can't happen.
  const priced = useMemo(() => {
    const coveredDeps = row.dependants.filter((d) => checked.has(d.id));
    if (!row.employeeDobISO) {
      return { byDependant: new Map<string, number>(), employeeLine: null, sum: 0, capped: 0, missingDob: true };
    }
    const people = [
      { dob: new Date(row.employeeDobISO) },
      ...coveredDeps.map((d) => ({ dob: new Date(d.dobISO) })),
    ];
    const { annualEGP, lines } = sumMedicalPremium(people, rateBands, new Date());
    const byDependant = new Map(coveredDeps.map((d, i) => [d.id, lines[i + 1].premiumEGP]));
    const ages = new Map(coveredDeps.map((d, i) => [d.id, lines[i + 1].ageAtCommit]));
    return {
      byDependant,
      ages,
      employeeLine: lines[0],
      sum: annualEGP,
      capped: row.ceiling != null ? Math.min(annualEGP, row.ceiling) : annualEGP,
      missingDob: false,
    };
  }, [row, checked, rateBands]);

  const changed = !priced.missingDob && priced.capped !== row.premium;

  return (
    <div className="grid gap-4 px-3 pb-4 md:grid-cols-[1.15fr_0.85fr]">
      <form action={editMedicalCommitment} className="rounded-lg border border-line bg-surface p-4">
        <input type="hidden" name="id" value={row.id} />
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Who is covered</p>

        <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2">
          <span className="text-sm font-semibold text-ink">{row.userName}</span>
          <span className="text-xs text-muted">
            {priced.employeeLine ? `· ${priced.employeeLine.ageAtCommit}` : "· no date of birth"}
          </span>
          <span className="ml-auto text-sm font-semibold tabular-nums text-navy-800">
            {priced.employeeLine ? egp(priced.employeeLine.premiumEGP) : "—"}
          </span>
        </div>

        {row.dependants.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No dependants on file.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {row.dependants.map((d) => {
              const on = checked.has(d.id);
              const amount = priced.byDependant.get(d.id);
              const age = priced.ages?.get(d.id);
              return (
                <label
                  key={d.id}
                  className={
                    "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 " +
                    (on ? "border-navy-300 bg-navy-50" : "border-line bg-surface")
                  }
                >
                  <input
                    type="checkbox"
                    name="dependantIds"
                    value={d.id}
                    checked={on}
                    onChange={(e) =>
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        return next;
                      })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium text-ink">{d.label}</span>
                  <span className="text-xs text-muted">{on && age != null ? `· ${age}` : ""}</span>
                  <span className="ml-auto text-sm tabular-nums text-navy-800">
                    {on && amount != null ? egp(amount) : "—"}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-3 space-y-1.5 border-t border-dashed border-line pt-3 text-sm">
          <div className="flex justify-between text-muted">
            <span>Sum of age bands</span>
            <b className="font-semibold tabular-nums text-ink">{egp(priced.sum)}</b>
          </div>
          {row.ceiling != null ? (
            <div className="flex justify-between text-muted">
              <span>Their pool ceiling</span>
              <b className="font-semibold tabular-nums text-ink">{egp(row.ceiling)}</b>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-line pt-2 font-semibold text-ink">
            <span>Annual insurance cost</span>
            <b className="font-serif text-lg tabular-nums text-navy-800">{egp(priced.capped)}</b>
          </div>
        </div>

        {priced.missingDob ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">
            No date of birth on {row.userName}&apos;s record — medical is priced from age, so re-pricing is refused
            until it is set.
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="rounded-lg bg-gold-500 px-4 py-1.5 text-sm font-bold text-navy-900 hover:bg-gold-600">
            Re-price
          </button>
          <span className="text-xs text-muted">
            {changed ? (
              <>
                was <b className="font-semibold tabular-nums text-navy-800">{egp(row.premium)}</b> →{" "}
                <b className="font-semibold tabular-nums text-navy-800">{egp(priced.capped)}</b>
              </>
            ) : (
              <>
                was <b className="font-semibold tabular-nums text-navy-800">{egp(row.premium)}</b> · no change
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-xs font-semibold text-muted hover:text-navy-700"
          >
            Close
          </button>
        </div>
      </form>

      <div className="rounded-lg border border-line bg-paper p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">This commitment</p>
        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Committed</dt>
            <dd className="text-ink">{row.committedAt}</dd>
          </div>
          {row.termLabel ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Policy term</dt>
              <dd className="text-right text-ink">{row.termLabel}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Priced at commit</dt>
            <dd className="text-right text-ink">
              {row.coveredPeople.map((p) => `${p.label.split(" · ")[0]} ${p.ageAtCommit}`).join(" · ") || "—"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-[11px] text-muted">
          Re-pricing keeps the commitment and rewrites its premium from today&apos;s rate card and the people ticked
          here. The per-cycle split is recalculated with it — except any amount already drawn from a closed cycle.
        </p>
        <form action={removeMedicalCommitment} className="mt-3 border-t border-line pt-3">
          <input type="hidden" name="id" value={row.id} />
          <ConfirmSubmitButton
            message={`Remove ${row.userName}’s medical commitment? Their premium stops counting against their pool and they can commit again while the plan year is open.`}
            className="text-xs font-semibold text-muted hover:text-red-600"
          >
            Remove commitment
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

/** Who is eligible and has not committed — including anyone a missing DOB blocks (spec 023). */
function NotCommittedTable({ rows, query }: { rows: NotCommittedRow[]; query: string }) {
  const q = query.trim().toLowerCase();
  const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;

  if (rows.length === 0) {
    return <p className="text-sm text-muted">Everyone eligible has committed.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-800 text-white">
              <th className={TH}>Employee</th>
              <th className={TH}>Contract</th>
              <th className={TH + " text-right"}>Pool ceiling</th>
              <th className={TH}>Status</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted">
                  Nobody matches this search.
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-navy-50">
                  <td className={TD + " font-semibold text-ink"}>{r.name}</td>
                  <td className={TD + " text-muted"}>{r.contract}</td>
                  <td className={TD + " text-right tabular-nums text-ink"}>{r.ceiling != null ? egp(r.ceiling) : "—"}</td>
                  <td className={TD}>
                    <span
                      className={
                        "rounded-full border px-2 py-0.5 text-[11px] font-bold " +
                        (r.blockedReason
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-line bg-paper text-muted")
                      }
                    >
                      {r.blockedReason ? `Blocked · ${r.blockedReason}` : "Eligible · not committed"}
                    </span>
                  </td>
                  <td className={TD + " text-right"}>
                    <a
                      href={`/admin/employees/${r.id}`}
                      className="rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                    >
                      Open record
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        A missing date of birth blocks the commit outright — medical is priced from age. Nobody is emailed from this
        screen; benefits email is limited to the claim workflow.
      </p>
    </>
  );
}
