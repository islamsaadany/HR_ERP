"use client";

import React, { useMemo, useState } from "react";
import { formatEGP as egp } from "@/lib/labels";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS } from "@/lib/benefits/claims";
import type { ClaimStatus } from "@prisma/client";
import { approveClaim, approveClaims, rejectClaim, reopenClaim } from "@/app/(app)/admin/benefits/actions";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";

/**
 * Claims — review queue + ledger (mockup signed off 2026-08-16,
 * `design-mockups/benefits-claims/2026-08-16_claims-queue.html`).
 *
 * The old panel was one list of cards holding every claim in the cycle, so four decisions
 * sat on top of two hundred records in the same shape. Splitting them is the point: the
 * queue holds only what needs deciding, the ledger holds what has been decided and can be
 * filtered and totalled.
 *
 * Nothing about the workflow changes — same four statuses, same server rules, and every
 * decision still goes through `approveClaim` / `rejectClaim`.
 */

export type QueueRow = {
  id: string;
  userName: string;
  contract: string;
  benefitName: string;
  category: string;
  /** The receipt the employee entered; null for guaranteed benefits and older claims. */
  receipt: number | null;
  coverageRate: number | null;
  amount: number;
  /** True when the 50%-per-benefit cap clamped the covered amount below its coverage share. */
  capped: boolean;
  waitingDays: number;
  submittedAt: string;
  note: string | null;
  proofHref: string | null;
  proofName: string | null;
  /** Their allowance after this claim — the context a decision needs and the old panel lacked. */
  pool: { ceiling: number; remaining: number } | null;
};

export type LedgerRow = {
  id: string;
  decidedAt: string;
  userName: string;
  benefitName: string;
  category: string;
  amount: number;
  status: ClaimStatus;
  byName: string;
  decisionNote: string | null;
  recordedByHr: boolean;
};

export type ClaimsTotals = {
  toReviewCount: number;
  toReviewAmount: number;
  approvedCount: number;
  approvedAmount: number;
  reimbursedCount: number;
  reimbursedAmount: number;
  /** Everything not rejected — the amount actually holding allowance across the cycle. */
  committedAmount: number;
};

type LedgerFilter = "all" | "APPROVED" | "REIMBURSED" | "REJECTED" | "recorded";

const TILE = "rounded-xl border border-line bg-surface px-4 py-3";
const TILE_K = "text-[10px] font-bold uppercase tracking-[0.09em] text-muted";
const TILE_V = "mt-1 font-serif text-2xl tabular-nums text-navy-800";
const TILE_S = "mt-0.5 text-xs tabular-nums text-muted";
const TH = "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide";
const TD = "whitespace-nowrap px-3 py-2 align-middle";

export function ClaimsPanel({
  queue,
  ledger,
  totals,
  recordEntry,
}: {
  queue: QueueRow[];
  ledger: LedgerRow[];
  totals: ClaimsTotals;
  /** The "Record entry…" modal, rendered on the server and slotted in. */
  recordEntry: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  // Which rejected row is currently being reopened — the reason box replaces the button in
  // that one cell, so the rest of the ledger doesn't reflow.
  const [reopening, setReopening] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const selectedRows = queue.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((n, r) => n + r.amount, 0);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = queue.length > 0 && selected.size === queue.length;

  const ledgerCounts = useMemo(
    () => ({
      all: ledger.length,
      APPROVED: ledger.filter((r) => r.status === "APPROVED").length,
      REIMBURSED: ledger.filter((r) => r.status === "REIMBURSED").length,
      REJECTED: ledger.filter((r) => r.status === "REJECTED").length,
      recorded: ledger.filter((r) => r.recordedByHr).length,
    }),
    [ledger]
  );

  const visibleLedger = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ledger.filter((r) => {
      if (q && !r.userName.toLowerCase().includes(q) && !r.benefitName.toLowerCase().includes(q)) return false;
      if (ledgerFilter === "all") return true;
      if (ledgerFilter === "recorded") return r.recordedByHr;
      return r.status === ledgerFilter;
    });
  }, [ledger, ledgerFilter, query]);

  const ledgerTotal = visibleLedger.reduce((n, r) => n + r.amount, 0);

  const chip = (id: LedgerFilter, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setLedgerFilter(id)}
      aria-pressed={ledgerFilter === id}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (ledgerFilter === id
          ? "border-navy-800 bg-navy-800 text-white"
          : "border-line bg-surface text-muted hover:bg-navy-50")
      }
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-75">{count}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      {/* ── Rail: the spec-020 workflow, left to right ───────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={TILE + (totals.toReviewCount > 0 ? " !border-gold-300 !bg-gold-50" : "")}>
          <div className={TILE_K + (totals.toReviewCount > 0 ? " !text-gold-800" : "")}>To review</div>
          <div className={TILE_V + (totals.toReviewCount > 0 ? " !text-gold-800" : "")}>{totals.toReviewCount}</div>
          <div className={TILE_S + (totals.toReviewCount > 0 ? " !text-gold-800" : "")}>
            {egp(totals.toReviewAmount)} requested
          </div>
        </div>
        <div className={TILE}>
          <div className={TILE_K}>With Finance</div>
          <div className={TILE_V}>{totals.approvedCount}</div>
          <div className={TILE_S}>{egp(totals.approvedAmount)} approved, unpaid</div>
        </div>
        <div className={TILE}>
          <div className={TILE_K}>Reimbursed</div>
          <div className={TILE_V}>{totals.reimbursedCount}</div>
          <div className={TILE_S}>{egp(totals.reimbursedAmount)} paid</div>
        </div>
        <div className={TILE + " !border-navy-900 !bg-navy-900"}>
          <div className={TILE_K + " !text-gold-300"}>Committed against pools</div>
          <div className={TILE_V + " !text-white"}>{totals.committedAmount.toLocaleString("en-US")}</div>
          <div className={TILE_S + " !text-navy-200"}>EGP · everything not rejected</div>
        </div>
      </div>

      {/* ── Review queue ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">
            Review queue {queue.length ? `· ${queue.length} to decide` : ""}
          </h2>
          {recordEntry}
        </div>

        {selected.size > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-navy-100 bg-navy-50 px-3 py-2 text-sm font-semibold text-navy-800">
            <span>
              {selected.size} selected · <span className="tabular-nums">{egp(selectedTotal)}</span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              {/* Bulk approve runs the same per-claim server action rules — it saves the clicks,
                  never the checks. Kept out of a wrapping <form> so the per-row forms below
                  stay valid (nested forms are illegal and silently drop the inner submit). */}
              <form action={approveClaims}>
                {selectedRows.map((r) => (
                  <input key={r.id} type="hidden" name="ids" value={r.id} />
                ))}
                <button className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-bold text-navy-900 hover:bg-gold-600">
                  Approve selected
                </button>
              </form>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50"
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        {queue.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting for a decision.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 text-white">
                  <th className={TH + " w-9"}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(queue.map((r) => r.id)))}
                      aria-label="Select every claim in the queue"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className={TH}>Waiting</th>
                  <th className={TH}>Employee</th>
                  <th className={TH}>Benefit</th>
                  <th className={TH + " text-right"}>Receipt</th>
                  <th className={TH + " text-right"}>Claim</th>
                  <th className={TH}>Their pool after this</th>
                  <th className={TH}>Proof</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {queue.map((r) => {
                  const isOpen = open === r.id;
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={"border-t border-line " + (isOpen ? "bg-navy-50" : "hover:bg-navy-50")}>
                        <td className={TD}>
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                            aria-label={`Select ${r.userName}'s ${r.benefitName} claim`}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className={TD + " text-muted"}>
                          {r.waitingDays === 0 ? "today" : r.waitingDays === 1 ? "1 day" : `${r.waitingDays} days`}
                        </td>
                        <td className={TD}>
                          <button
                            type="button"
                            onClick={() => setOpen(isOpen ? null : r.id)}
                            className="text-left font-semibold text-ink hover:text-navy-700"
                          >
                            <span className="mr-1.5 text-[11px] text-navy-400">{isOpen ? "▾" : "▸"}</span>
                            {r.userName}
                          </button>
                          <span className="block pl-4 text-[11.5px] text-muted">{r.contract}</span>
                        </td>
                        <td className={TD + " text-ink"}>
                          {r.benefitName}
                          {r.category ? (
                            <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                              {r.category}
                            </span>
                          ) : null}
                        </td>
                        <td className={TD + " text-right tabular-nums text-muted"}>
                          {r.receipt != null ? egp(r.receipt) : "—"}
                        </td>
                        <td className={TD + " text-right tabular-nums text-ink"}>
                          {egp(r.amount)}
                          {r.capped ? (
                            <span className="ml-2 rounded-full border border-gold-300 bg-gold-50 px-2 py-0.5 text-[11px] font-bold text-gold-800">
                              Capped
                            </span>
                          ) : null}
                        </td>
                        <td className={TD}>
                          <PoolMeter pool={r.pool} />
                        </td>
                        <td className={TD}>
                          {r.proofHref ? (
                            <a
                              href={r.proofHref}
                              target="_blank"
                              rel="noopener"
                              className="text-[12.5px] text-navy-600 underline underline-offset-2"
                            >
                              {r.proofName ?? "View proof"}
                            </a>
                          ) : (
                            <span className="text-[12.5px] font-semibold text-red-700">Missing</span>
                          )}
                        </td>
                        <td className={TD + " text-right"}>
                          <div className="flex items-center justify-end gap-2">
                            <form action={approveClaim}>
                              <input type="hidden" name="id" value={r.id} />
                              <button className="rounded-lg bg-navy-800 px-3 py-1 text-xs font-bold text-white hover:bg-navy-700">
                                Approve
                              </button>
                            </form>
                            {/* Reject opens the row rather than carrying its own form here — the
                                reason field lives in the opened panel, so a rejection is always
                                written with the claim's detail in view. */}
                            <button
                              type="button"
                              onClick={() => setOpen(r.id)}
                              className="rounded-lg border border-line px-3 py-1 text-xs font-bold text-red-700 hover:border-red-300"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-navy-50">
                          <td colSpan={9} className="px-3 pb-4">
                            <QueueDetail row={r} />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Ledger ───────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-4 font-serif text-lg text-ink">Ledger · everything already decided</h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {chip("all", "All decided", ledgerCounts.all)}
          {chip("APPROVED", "With Finance", ledgerCounts.APPROVED)}
          {chip("REIMBURSED", "Reimbursed", ledgerCounts.REIMBURSED)}
          {chip("REJECTED", "Rejected", ledgerCounts.REJECTED)}
          {chip("recorded", "Recorded by HR", ledgerCounts.recorded)}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee or benefit…"
            className="ml-auto min-w-[220px] rounded-lg border border-line bg-surface px-3 py-1.5 text-sm focus:border-navy-500 focus:outline-none"
          />
        </div>

        {ledger.length === 0 ? (
          <p className="text-sm text-muted">No decided claims yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-800 text-white">
                  <th className={TH}>Decided</th>
                  <th className={TH}>Employee</th>
                  <th className={TH}>Benefit</th>
                  <th className={TH + " text-right"}>Claim</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>By</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {visibleLedger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                      No claims match this filter.
                    </td>
                  </tr>
                ) : (
                  visibleLedger.map((r) => (
                    <tr key={r.id} className="border-t border-line hover:bg-navy-50">
                      <td className={TD + " text-muted"}>{r.decidedAt}</td>
                      <td className={TD + " font-semibold text-ink"}>{r.userName}</td>
                      <td className={TD + " text-ink"}>
                        {r.benefitName}
                        {r.category ? (
                          <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">
                            {r.category}
                          </span>
                        ) : null}
                      </td>
                      <td className={TD + " text-right tabular-nums text-ink"}>{egp(r.amount)}</td>
                      <td className={TD}>
                        <span className={"rounded-full px-2 py-0.5 text-[11px] font-bold " + CLAIM_STATUS_CLASS[r.status]}>
                          {CLAIM_STATUS_LABEL[r.status]}
                        </span>
                        {r.decisionNote ? (
                          <span className="block max-w-[240px] truncate text-[11.5px] text-muted" title={r.decisionNote}>
                            {r.decisionNote}
                          </span>
                        ) : r.recordedByHr ? (
                          <span className="block text-[11.5px] text-muted">Recorded by HR · paid outside the app</span>
                        ) : null}
                      </td>
                      <td className={TD + " text-muted"}>{r.byName}</td>
                      <td className={TD + " text-right"}>
                        {r.status !== "REJECTED" ? null : reopening === r.id ? (
                          <form action={reopenClaim} className="flex flex-wrap items-center justify-end gap-1.5">
                            <input type="hidden" name="id" value={r.id} />
                            <input
                              name="reason"
                              required
                              autoFocus
                              maxLength={200}
                              placeholder="Why? — sent to them"
                              className="min-w-[190px] rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] focus:border-navy-500 focus:outline-none"
                            />
                            <ConfirmSubmitButton
                              message={`Send ${r.userName}'s ${r.benefitName} claim back to the review queue? The decline is undone, they are emailed with your reason, and the claim must still be approved as normal.`}
                              className="rounded-lg bg-navy-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-navy-700"
                            >
                              Reopen
                            </ConfirmSubmitButton>
                            <button
                              type="button"
                              onClick={() => setReopening(null)}
                              className="rounded-lg border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:border-navy-200"
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReopening(r.id)}
                            className="rounded-lg border border-navy-200 px-2.5 py-1 text-[11px] font-semibold text-navy-700 hover:bg-navy-50"
                          >
                            Reopen
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-paper font-bold">
                  <td className={TD} colSpan={3}>
                    {visibleLedger.length} claim{visibleLedger.length === 1 ? "" : "s"} · filtered total
                  </td>
                  <td className={TD + " text-right tabular-nums text-ink"}>{egp(ledgerTotal)}</td>
                  <td className={TD} colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** How much of their pool is left once this claim is counted. */
function PoolMeter({ pool }: { pool: QueueRow["pool"] }) {
  if (!pool || pool.ceiling <= 0) {
    return <span className="text-xs text-muted">No pool ceiling set</span>;
  }
  const usedPct = Math.min(100, Math.round(((pool.ceiling - pool.remaining) / pool.ceiling) * 100));
  const tone = pool.remaining <= 0 ? "bg-red-600" : usedPct >= 80 ? "bg-gold-500" : "bg-navy-600";
  return (
    <span className="flex items-center gap-2">
      <span className="h-[7px] w-[74px] shrink-0 overflow-hidden rounded-full bg-navy-100">
        <i className={"block h-full rounded-full " + tone} style={{ width: `${usedPct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-muted">
        {egp(pool.remaining)} left of {egp(pool.ceiling)}
      </span>
    </span>
  );
}

/**
 * The opened claim: what they wrote, how the covered amount was worked out (the same
 * sentence the old cards printed under every claim), the decision controls, and where the
 * claim is in the workflow.
 */
function QueueDetail({ row }: { row: QueueRow }) {
  const share =
    row.receipt != null && row.coverageRate != null ? Math.round((row.receipt * row.coverageRate) / 100) : null;

  return (
    <div className="grid gap-4 rounded-lg border border-line bg-surface p-4 md:grid-cols-[1.25fr_0.75fr]">
      <div>
        {row.note ? (
          <>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">What they wrote</p>
            <p className="mb-3 text-sm text-ink">&ldquo;{row.note}&rdquo;</p>
          </>
        ) : null}

        {share != null ? (
          <>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              How the amount was worked out
            </p>
            <p className="text-xs tabular-nums text-muted">
              Receipt <b className="font-semibold text-ink">{egp(row.receipt!)}</b> · covers {row.coverageRate}% ={" "}
              <b className="font-semibold text-ink">{egp(share)}</b>
              {row.capped ? (
                <>
                  {" · "}
                  <b className="font-bold text-gold-700">capped to {egp(row.amount)} by the 50% benefit cap</b>
                </>
              ) : null}
              {row.pool ? (
                <>
                  {" · leaves "}
                  <b className="font-semibold text-ink">{egp(row.pool.remaining)}</b> of their {egp(row.pool.ceiling)}{" "}
                  pool
                </>
              ) : null}
            </p>
          </>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
          <form action={approveClaim}>
            <input type="hidden" name="id" value={row.id} />
            <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-navy-700">
              Approve
            </button>
          </form>
          <form action={rejectClaim} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input
              name="reason"
              placeholder="Reason (optional) — sent to them"
              className="min-w-[230px] rounded-lg border border-line bg-surface px-3 py-1.5 text-xs focus:border-navy-500 focus:outline-none"
            />
            <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-red-700 hover:border-red-300">
              Reject
            </button>
          </form>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">Trail</p>
        <div className="flex flex-col gap-2.5 border-l-2 border-line pl-3">
          <div className="text-xs text-muted">
            <b className="block font-semibold text-ink">Submitted</b>
            {row.submittedAt} · by {row.userName}
          </div>
          <div className="text-xs text-muted">
            <b className="block font-semibold text-ink">Waiting for HR</b>
            {row.waitingDays === 0 ? "today" : row.waitingDays === 1 ? "1 day" : `${row.waitingDays} days`}
          </div>
          <div className="text-xs text-muted opacity-60">
            <b className="block font-semibold text-ink">Then Finance</b>
            reimbursement
          </div>
        </div>
      </div>
    </div>
  );
}
