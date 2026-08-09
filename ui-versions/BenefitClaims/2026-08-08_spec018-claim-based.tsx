"use client";

import { useState } from "react";
import type { ClaimType, ClaimStatus } from "@prisma/client";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS, tracker } from "@/lib/benefits/claims";
import { formatDate } from "@/lib/labels";
import { createClaim } from "@/app/(app)/benefits/claim-actions";

const egp = (n: number) => "EGP " + n.toLocaleString();
const dash = "—";

export type ClaimRow = {
  amount: number;
  status: ClaimStatus;
  note: string | null;
  proofName: string | null;
  proofUrl: string | null;
  decisionNote: string | null;
  createdAt: Date;
};
export type ClaimableBenefit = {
  kind: "guaranteed" | "catalog";
  id: string;
  name: string;
  claimType: ClaimType; // NOTE | PROOF
  allocated: number | null;
  claims: ClaimRow[];
};

/** At-a-glance status for one benefit, derived from its claims + the tracker. */
type BenefitState = "none" | "pending" | "partial" | "done" | "rejected";
const STATE_LABEL: Record<BenefitState, string> = {
  none: "Not started",
  pending: "Pending review",
  partial: "Partially reimbursed",
  done: "Fully claimed",
  rejected: "Rejected",
};
const STATE_CLASS: Record<BenefitState, string> = {
  none: "bg-line text-muted",
  pending: "bg-gold-100 text-gold-800",
  partial: "bg-navy-50 text-navy-700",
  done: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

function benefitState(
  t: ReturnType<typeof tracker>,
  claimCount: number,
  allocated: number | null
): BenefitState {
  if (claimCount === 0) return "none";
  if (t.reimbursed === 0 && t.pending === 0) return "rejected"; // every claim was rejected
  if (allocated != null && (t.remaining ?? 0) <= 0 && t.pending === 0) return "done";
  if (t.reimbursed > 0) return "partial"; // some paid back, more still open
  return "pending"; // pending only, nothing reimbursed yet
}

export function BenefitClaims({
  claimable,
  automatic,
  error,
}: {
  claimable: ClaimableBenefit[];
  automatic: string[];
  error?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-ink">Your benefits &amp; claims</h2>
      <p className="mt-1 text-sm text-muted">
        Put your benefits to use. Some are paid automatically; a few just need a quick note, and the rest
        need a receipt we&apos;ll review before paying you back. All figures below are the <strong>company
        (covered) share</strong> — you show proof of your full spend and we reimburse the covered portion.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {automatic.length > 0 ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
          <strong>Paid automatically</strong> — no action needed: {automatic.join(", ")}.
        </p>
      ) : null}

      {claimable.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
          No claimable benefits yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="w-10 px-4 py-3 text-right font-medium">#</th>
                <th className="px-4 py-3 font-medium">Benefit</th>
                <th className="px-4 py-3 text-right font-medium">Allocated</th>
                <th className="px-4 py-3 text-right font-medium">Reimbursed</th>
                <th className="px-4 py-3 text-right font-medium">Pending</th>
                <th className="px-4 py-3 text-right font-medium">Left to claim</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {claimable.map((b, i) => {
                const rowKey = `${b.kind}:${b.id}`;
                const t = tracker(b.allocated, b.claims);
                const fullyClaimed = b.allocated != null && (t.remaining ?? 0) <= 0;
                const state = benefitState(t, b.claims.length, b.allocated);
                const isProof = b.claimType === "PROOF";
                const isOpen = open === rowKey;
                const actionLabel = fullyClaimed ? "View" : isProof ? "Claim" : "Request";

                return (
                  <ClaimRowsFragment
                    key={rowKey}
                    index={i + 1}
                    benefit={b}
                    tracker={t}
                    state={state}
                    fullyClaimed={fullyClaimed}
                    isProof={isProof}
                    isOpen={isOpen}
                    actionLabel={actionLabel}
                    onToggle={() => setOpen(isOpen ? null : rowKey)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClaimRowsFragment({
  index,
  benefit: b,
  tracker: t,
  state,
  fullyClaimed,
  isProof,
  isOpen,
  actionLabel,
  onToggle,
}: {
  index: number;
  benefit: ClaimableBenefit;
  tracker: ReturnType<typeof tracker>;
  state: BenefitState;
  fullyClaimed: boolean;
  isProof: boolean;
  isOpen: boolean;
  actionLabel: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className={"border-b border-line " + (isOpen ? "bg-navy-50/40" : "hover:bg-navy-50/40")}>
        <td className="px-4 py-3 text-right tabular-nums text-muted">{index}</td>
        <td className="px-4 py-3">
          <div className="font-medium text-ink">{b.name}</div>
          <div className="text-xs text-muted">
            {b.kind === "guaranteed" ? "Guaranteed" : "Basket"} ·{" "}
            {isProof ? "proof of payment required" : "note only"}
          </div>
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-muted">
          {b.allocated != null ? egp(b.allocated) : "No cap"}
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy-700">
          {t.reimbursed > 0 ? egp(t.reimbursed) : dash}
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gold-700">
          {t.pending > 0 ? egp(t.pending) : dash}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-ink">
          {b.allocated != null ? egp(t.remaining ?? 0) : dash}
        </td>
        <td className="px-4 py-3">
          <span className={"inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold " + STATE_CLASS[state]}>
            {STATE_LABEL[state]}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 transition hover:border-navy-300 hover:bg-navy-50"
          >
            {actionLabel}
            <span className={"text-[10px] transition " + (isOpen ? "rotate-180" : "")} aria-hidden="true">
              ▾
            </span>
          </button>
        </td>
      </tr>

      {isOpen ? (
        <tr className="border-b border-line bg-paper/40">
          <td colSpan={8} className="px-4 pb-5 pt-1">
            <div className="grid items-start gap-5 md:grid-cols-[1.1fr_1fr]">
              {/* Claim history */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Claim history</p>
                {b.claims.length === 0 ? (
                  <p className="text-sm text-muted">No claims yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {b.claims.map((c, i) => (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-ink tabular-nums">{egp(c.amount)}</span>
                          <span className="ml-2 text-xs text-muted">{formatDate(c.createdAt)}</span>
                          {c.note ? <div className="text-xs italic text-muted">“{c.note}”</div> : null}
                          {c.proofUrl ? (
                            <a href={c.proofUrl} target="_blank" rel="noopener" className="text-xs text-navy-600 underline">
                              {c.proofName ?? "Proof"}
                            </a>
                          ) : null}
                          {c.status === "REJECTED" && c.decisionNote ? (
                            <div className="text-xs text-red-600">Rejected: {c.decisionNote}</div>
                          ) : null}
                        </div>
                        <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + CLAIM_STATUS_CLASS[c.status]}>
                          {CLAIM_STATUS_LABEL[c.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* File a new claim */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                  {fullyClaimed ? "Nothing left" : isProof ? "File a new claim" : "Request this benefit"}
                </p>
                {fullyClaimed ? (
                  <p className="rounded-lg border border-line bg-surface px-3 py-3 text-sm text-muted">
                    Fully claimed — nothing left to request.
                  </p>
                ) : (
                  <form
                    action={createClaim}
                    encType="multipart/form-data"
                    className="rounded-lg border border-line bg-surface p-3"
                  >
                    <input type="hidden" name="kind" value={b.kind} />
                    <input type="hidden" name="benefitId" value={b.id} />
                    {/* Request (NOTE) claims take the full allocated amount — no amount box.
                        Proof claims are reimbursed against spend, so they ask for an amount. */}
                    {isProof ? (
                      <div className="mb-3">
                        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Covered amount to claim (EGP)</label>
                        <input
                          name="amount"
                          inputMode="numeric"
                          placeholder={t.remaining != null ? String(t.remaining) : "Amount"}
                          required
                          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                        />
                        <p className="mt-1 text-xs text-muted">
                          The company (covered) portion you&apos;re claiming, up to {b.allocated != null ? egp(t.remaining ?? 0) : "your allocation"} left. Attach proof of your full spend below.
                        </p>
                      </div>
                    ) : (
                      <p className="mb-3 text-xs text-muted">
                        Requests the full amount{b.allocated != null ? ` (${egp(b.allocated)})` : ""}. Add a note if useful.
                      </p>
                    )}
                    <div className="mb-3">
                      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Note (optional)</label>
                      <input name="note" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                    </div>
                    {isProof ? (
                      <div className="mb-3">
                        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">
                          Proof of payment (required)
                        </label>
                        <input
                          type="file"
                          name="proof"
                          required
                          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-navy-700"
                        />
                      </div>
                    ) : null}
                    <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                      {isProof ? "Submit request" : "Confirm request"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
