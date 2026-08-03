import type { ClaimType, ClaimStatus } from "@prisma/client";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS, tracker } from "@/lib/benefits/claims";
import { formatDate } from "@/lib/labels";
import { createClaim } from "@/app/(app)/benefits/claim-actions";

const egp = (n: number) => "EGP " + n.toLocaleString();

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

export function BenefitClaims({
  claimable,
  automatic,
  error,
}: {
  claimable: ClaimableBenefit[];
  automatic: string[];
  error?: string;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl text-ink">Your benefits &amp; claims</h2>
      <p className="mt-1 text-sm text-muted">
        Request reimbursement for the benefits you selected. Some are paid automatically; others need a
        note or a proof of payment that HR reviews before releasing the payment.
      </p>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {automatic.length > 0 ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
          <strong>Paid automatically</strong> — no action needed: {automatic.join(", ")}.
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {claimable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
            No claimable benefits yet.
          </p>
        ) : (
          claimable.map((b) => {
            const t = tracker(b.allocated, b.claims);
            const fullyClaimed = t.remaining != null && t.remaining <= 0;
            return (
              <div key={`${b.kind}:${b.id}`} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
                  <div>
                    <div className="font-medium text-ink">{b.name}</div>
                    <div className="text-xs text-muted">
                      {b.allocated != null ? `Allocated ${egp(b.allocated)}` : "No fixed cap"} ·{" "}
                      {b.claimType === "PROOF" ? "proof of payment required" : "note optional"}
                    </div>
                  </div>
                  <div className="flex gap-4 text-right text-xs">
                    <div>
                      <div className="font-semibold text-navy-700 tabular-nums">{egp(t.reimbursed)}</div>
                      <div className="text-muted">Reimbursed</div>
                    </div>
                    <div>
                      <div className="font-semibold text-gold-700 tabular-nums">{egp(t.pending)}</div>
                      <div className="text-muted">Pending</div>
                    </div>
                    {b.allocated != null ? (
                      <div>
                        <div className="font-semibold text-ink tabular-nums">{egp(t.remaining ?? 0)}</div>
                        <div className="text-muted">Left to claim</div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Existing claims */}
                {b.claims.length > 0 ? (
                  <ul className="divide-y divide-line px-5">
                    {b.claims.map((c, i) => (
                      <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-ink tabular-nums">{egp(c.amount)}</span>
                          <span className="ml-2 text-xs text-muted">{formatDate(c.createdAt)}</span>
                          {c.note ? <div className="text-xs text-muted">“{c.note}”</div> : null}
                          {c.proofUrl ? (
                            <a href={c.proofUrl} target="_blank" rel="noopener" className="text-xs text-navy-600 underline">
                              {c.proofName ?? "Proof"}
                            </a>
                          ) : null}
                          {c.status === "REJECTED" && c.decisionNote ? (
                            <div className="text-xs text-red-600">Rejected: {c.decisionNote}</div>
                          ) : null}
                        </div>
                        <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + CLAIM_STATUS_CLASS[c.status]}>
                          {CLAIM_STATUS_LABEL[c.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* New claim */}
                {fullyClaimed ? (
                  <p className="px-5 py-3 text-sm text-muted">Fully claimed.</p>
                ) : (
                  <details className="px-5 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-navy-700">File a claim</summary>
                    <form action={createClaim} encType="multipart/form-data" className="mt-3 grid gap-3 sm:grid-cols-2">
                      <input type="hidden" name="kind" value={b.kind} />
                      <input type="hidden" name="benefitId" value={b.id} />
                      {/* Request (NOTE) claims take the full allocated amount — no amount box.
                          Proof claims are reimbursed against spend, so they ask for an amount. */}
                      {b.claimType === "PROOF" ? (
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Amount (EGP)</label>
                          <input
                            name="amount"
                            inputMode="numeric"
                            placeholder={t.remaining != null ? String(t.remaining) : "Amount"}
                            required
                            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
                          />
                        </div>
                      ) : (
                        <p className="self-end text-xs text-muted sm:col-span-2">
                          Requests the full amount{b.allocated != null ? ` (${egp(b.allocated)})` : ""}. Add a note if useful.
                        </p>
                      )}
                      <div className={b.claimType === "PROOF" ? "" : "sm:col-span-2"}>
                        <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Note (optional)</label>
                        <input name="note" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
                      </div>
                      {b.claimType === "PROOF" ? (
                        <div className="sm:col-span-2">
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
                      <div className="sm:col-span-2">
                        <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
                          Submit claim
                        </button>
                      </div>
                    </form>
                  </details>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
