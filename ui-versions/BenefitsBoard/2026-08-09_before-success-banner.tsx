"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClaimType, ClaimStatus } from "@prisma/client";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS, tracker } from "@/lib/benefits/claims";
import { coveredAmount } from "@/lib/benefits/coverage";
import { computeMedicalPremium } from "@/lib/benefits/rules";
import { formatDate } from "@/lib/labels";
import { createClaim } from "@/app/(app)/benefits/claim-actions";
import { commitMedical } from "@/app/(app)/benefits/actions";

const egp = (n: number) => "EGP " + Math.round(n).toLocaleString();

export type BoardClaim = {
  amount: number;
  status: ClaimStatus;
  note: string | null;
  proofName: string | null;
  proofUrl: string | null;
  decisionNote: string | null;
  createdAt: Date;
};
export type BoardGuaranteed = {
  id: string;
  name: string;
  note: string | null;
  claimType: ClaimType;
  allocated: number | null;
  /** The full (un-prorated) amount, shown struck-through when this benefit is prorated. */
  proratedFrom?: number | null;
  claims: BoardClaim[];
};
/** Present only for a mid-year starter (spec 019): the prorated months of the plan year. */
export type BoardProration = { months: number } | null;
export type BoardFlex = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isMedical: boolean;
  coverageRate: number;
  claimType: ClaimType;
  allocated: number | null;
  claims: BoardClaim[];
};
export type BoardGroup = { category: string; items: BoardFlex[] };
export type BoardMedicalRate = { self: number; spouse: number; childUnder18: number; child18Plus: number };
export type BoardMedicalCommitted = {
  spouse: boolean;
  childrenUnder18: number;
  children18Plus: number;
  premium: number;
} | null;

/**
 * Employee benefits board (spec 018) — restores the original navy/gold layout: a full-width
 * guaranteed band, then a two-column area with categorized benefit ROWS on the left and a sticky
 * pool meter on the right. Flexible benefits are claimed as-you-go (each row expands to a claim
 * form); medical is the one commitment (a row that opens the dependant modal).
 */
export function BenefitsBoard({
  ceiling,
  poolUsed,
  poolRemaining,
  cap,
  guaranteed,
  automatic,
  groups,
  medicalRate,
  medicalCommitted,
  planYearOpen,
  proration,
  medicalOnly,
  medicalPremiumFraction = 1,
  medicalProration,
  error,
}: {
  ceiling: number;
  poolUsed: number;
  poolRemaining: number;
  cap: number;
  guaranteed: BoardGuaranteed[];
  automatic: string[];
  groups: BoardGroup[];
  medicalRate: BoardMedicalRate;
  medicalCommitted: BoardMedicalCommitted;
  planYearOpen: boolean;
  proration?: BoardProration;
  /** Sub-6-month employee (spec 019): only medical is available; the rest unlocks at 6 months. */
  medicalOnly?: boolean;
  /** Prorates the medical premium PREVIEW to match the server (fraction of the year). */
  medicalPremiumFraction?: number;
  /** Badge data for a prorated medical premium. */
  medicalProration?: BoardProration;
  error?: string;
}) {
  const [medOpen, setMedOpen] = useState(false);
  const [gClaim, setGClaim] = useState<BoardGuaranteed | null>(null);
  const pct = ceiling > 0 ? Math.min(100, (poolUsed / ceiling) * 100) : 0;
  const proratedBadge = proration ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-800">
      Prorated · {proration.months} of 12 mo
    </span>
  ) : null;

  // Sub-6-month employee (spec 019): medical is available now; everything else waits for 6 months.
  if (medicalOnly) {
    return (
      <>
        <section className="mt-6 overflow-hidden rounded-2xl border border-line">
          <div className="bg-navy-900 px-6 py-4 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-300">Available now</div>
            <h2 className="font-serif text-xl">Personal medical insurance</h2>
          </div>
          <div className="space-y-3 bg-surface p-5">
            {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            <MedicalRow committed={medicalCommitted} onSetup={() => setMedOpen(true)} />
            {medicalProration ? (
              <p className="rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-700">
                You joined part-way through the plan year, so your medical premium is prorated to the remaining{" "}
                {medicalProration.months} {medicalProration.months === 1 ? "month" : "months"}. You&apos;ll get a full-year
                premium next plan year.
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-line bg-paper px-4 py-3">
              <span className="text-sm text-muted">Flexible basket &amp; guaranteed benefits</span>
              <span className="rounded-full bg-gold-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-800">
                Unlocks at 6 months
              </span>
            </div>
          </div>
        </section>

        {medOpen ? (
          <MedicalModal rate={medicalRate} ceiling={ceiling} premiumFraction={medicalPremiumFraction} onClose={() => setMedOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      {/* Guaranteed band — full width, above the two columns */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-line">
        <div className="bg-navy-900 px-6 py-4 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-300">You receive automatically</div>
          <h2 className="font-serif text-xl">Guaranteed benefits</h2>
        </div>
        <div className="grid gap-px bg-line" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          {guaranteed.map((g) => (
            <div key={g.id} className="flex flex-col gap-1 bg-surface p-4">
              <div className="text-sm font-medium text-ink">{g.name}</div>
              <div className="min-h-[2rem] flex-1 text-xs text-muted">{g.note ?? ""}</div>
              <div className="font-serif text-base text-navy-800">
                {g.allocated != null ? egp(g.allocated) : "Available"}
                {g.proratedFrom != null ? (
                  <span className="ml-1.5 align-middle text-xs font-normal text-muted line-through">{egp(g.proratedFrom)}</span>
                ) : null}
              </div>
              {g.proratedFrom != null && proratedBadge ? <div>{proratedBadge}</div> : null}
              {g.claimType !== "NONE" ? (
                <button
                  type="button"
                  onClick={() => setGClaim(g)}
                  className="mt-1 self-start rounded-lg border border-line px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50"
                >
                  {g.claimType === "PROOF" ? "Claim · proof" : "Request"}
                </button>
              ) : (
                <div className="mt-1 text-[11px] text-muted">Paid automatically</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <h2 className="mt-8 font-serif text-2xl text-ink">Your flexible benefits</h2>
      <p className="mt-1 max-w-[62ch] text-sm text-muted">
        Claim as you spend — any time this year. Enter the full price you paid; the company covers a set % of each
        benefit, and only that covered share draws from your pool.
      </p>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {automatic.length > 0 ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
          <strong>Paid automatically</strong> — no action needed: {automatic.join(", ")}.
        </p>
      ) : null}

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: categorized rows */}
        <div>
          {groups.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-3 pb-1 pt-5 first:pt-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-600">{group.category}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                {group.items.map((item) =>
                  item.isMedical ? (
                    <MedicalRow
                      key={item.id}
                      committed={medicalCommitted}
                      onSetup={() => setMedOpen(true)}
                    />
                  ) : (
                    <FlexRow key={item.id} item={item} />
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right: sticky meter + how it works */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-line bg-surface p-5">
            {proratedBadge ? <div className="mb-2">{proratedBadge}</div> : null}
            <div className="font-serif text-3xl text-ink tabular-nums">{egp(poolRemaining)}</div>
            <div className="text-sm text-muted">
              left of your {egp(ceiling)} {proration ? "prorated" : "annual"} pool (company share)
            </div>
            {proration ? (
              <p className="mt-2 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-700">
                You joined part-way through the plan year, so your pool covers the remaining {proration.months}{" "}
                {proration.months === 1 ? "month" : "months"}. You&apos;ll get the full annual amount next plan year.
              </p>
            ) : null}
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-navy-50">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-muted">Used</span>
              <span className="font-semibold tabular-nums text-ink">{egp(poolUsed)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-muted">Per-benefit cap (50%)</span>
              <span className="font-semibold tabular-nums text-ink">{egp(cap)}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h3 className="font-serif text-base text-ink">How it works</h3>
            <ol className="mt-2 space-y-1">
              {[
                "Claim as you spend — nothing to submit. Enter the full price; the company covers a set % of each benefit.",
                "No single benefit's covered share may pass half your pool. Medical is exempt.",
                "Medical is committed once and locked (HR-managed after).",
                "Unclaimed amounts don't carry over or pay out as cash.",
              ].map((t, i) => (
                <li key={i} className="flex gap-2 border-t border-line py-1.5 text-xs text-muted first:border-t-0">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-navy-50 text-[10px] font-semibold text-navy-700">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {/* Medical modal */}
      {medOpen ? (
        <MedicalModal rate={medicalRate} ceiling={ceiling} premiumFraction={medicalPremiumFraction} onClose={() => setMedOpen(false)} />
      ) : null}

      {/* Guaranteed claim modal */}
      {gClaim ? <GuaranteedClaimModal benefit={gClaim} onClose={() => setGClaim(null)} /> : null}
    </>
  );
}

/** One flexible benefit — collapsed row that expands to a claim form. */
function FlexRow({ item }: { item: BoardFlex }) {
  const t = tracker(item.allocated, item.claims);
  const remaining = t.remaining ?? 0;
  const fullyClaimed = item.allocated != null && remaining <= 0;
  return (
    <details className="group rounded-xl border border-line bg-surface open:border-navy-700">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
            {item.name}
            <span className="rounded bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">{item.coverageRate}% covered</span>
          </div>
          {item.description ? <div className="mt-0.5 text-xs text-muted">{item.description}</div> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 text-right">
          <div className="text-xs text-ink">Left to claim <b className="tabular-nums">{egp(remaining)}</b></div>
          <span className="rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700">
            {fullyClaimed ? "View" : "Claim"}
            <span className="ml-1 inline-block group-open:rotate-180">▾</span>
          </span>
        </div>
      </summary>
      <div className="mx-4 border-t border-dashed border-line py-4">
        {item.claims.length > 0 ? (
          <div className="mb-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Claim history</p>
            <ul className="flex flex-col gap-2">
              {item.claims.map((c, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium tabular-nums text-ink">{egp(c.amount)}</span>
                    <span className="ml-2 text-xs text-muted">{formatDate(c.createdAt)}</span>
                    {c.proofUrl ? (
                      <a href={c.proofUrl} target="_blank" rel="noopener" className="ml-2 text-xs text-navy-600 underline">{c.proofName ?? "Proof"}</a>
                    ) : null}
                    {c.status === "REJECTED" && c.decisionNote ? <div className="text-xs text-red-600">Rejected: {c.decisionNote}</div> : null}
                  </div>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold " + CLAIM_STATUS_CLASS[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {fullyClaimed ? (
          <p className="rounded-lg border border-line bg-surface px-3 py-3 text-sm text-muted">Fully claimed — nothing left on this benefit.</p>
        ) : (
          <FlexClaimForm item={item} remaining={remaining} />
        )}
      </div>
    </details>
  );
}

/** Full-price claim form for a flexible benefit with a live covered preview. */
function FlexClaimForm({ item, remaining }: { item: BoardFlex; remaining: number }) {
  const [fullCost, setFullCost] = useState(0);
  const covered = coveredAmount(fullCost, item.coverageRate);
  const over = covered > remaining;
  return (
    <form action={createClaim} encType="multipart/form-data" className="rounded-lg border border-line bg-surface p-3">
      <input type="hidden" name="kind" value="catalog" />
      <input type="hidden" name="benefitId" value={item.id} />
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Full price you paid (EGP)</label>
        <input
          name="amount"
          inputMode="numeric"
          value={fullCost ? fullCost.toLocaleString() : ""}
          onChange={(e) => setFullCost(parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0)}
          placeholder="e.g. 10,000"
          required
          className={"w-full max-w-[280px] rounded-lg border px-3 py-2 text-sm " + (over ? "border-red-300" : "border-line")}
        />
        <p className="mt-1 text-xs text-muted">
          Company covers {item.coverageRate}% → <b className="tabular-nums text-navy-700">{egp(covered)}</b> reimbursed. Up to {egp(remaining)} covered left.
        </p>
        {over ? <p className="mt-1 text-xs font-medium text-red-600">That covered amount exceeds what&apos;s left ({egp(remaining)}). Lower the price or claim the rest later.</p> : null}
      </div>
      {item.claimType === "PROOF" ? (
        <div className="mt-3">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Proof of payment (required)</label>
          <input type="file" name="proof" required className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-navy-700" />
        </div>
      ) : null}
      <div className="mt-3">
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Note (optional)</label>
        <input name="note" className="w-full max-w-[280px] rounded-lg border border-line px-3 py-2 text-sm" />
      </div>
      <button disabled={fullCost <= 0 || over} className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
        Submit claim
      </button>
    </form>
  );
}

/** Medical — a row that shows the committed state, or a "Set up cover" prompt opening the modal. */
function MedicalRow({ committed, onSetup }: { committed: BoardMedicalCommitted; onSetup: () => void }) {
  if (committed) {
    const deps = [
      committed.spouse ? "spouse" : null,
      committed.childrenUnder18 + committed.children18Plus > 0 ? `${committed.childrenUnder18 + committed.children18Plus} child(ren)` : null,
    ].filter(Boolean);
    return (
      <div className="flex items-start justify-between gap-4 rounded-xl border border-navy-200 bg-navy-50 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
            Medical insurance
            <span className="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-800">50% exempt</span>
            <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">Committed</span>
          </div>
          <div className="mt-0.5 text-xs text-navy-700">You{deps.length ? " + " + deps.join(" + ") : ""} · 100% covered · contact HR to change.</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-serif text-lg text-navy-800 tabular-nums">{egp(committed.premium)}</div>
          <div className="text-[11px] text-muted">annual premium</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
          Medical insurance
          <span className="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-800">50% exempt</span>
        </div>
        <div className="mt-0.5 max-w-[60ch] text-xs text-muted">
          The one benefit you commit up front — you&apos;re always covered; add dependants. 100% company-covered. Once committed it&apos;s locked (HR-managed).
        </div>
      </div>
      <button type="button" onClick={onSetup} className="shrink-0 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-100">
        Set up cover
      </button>
    </div>
  );
}

/** Modal to commit medical (dependant picker + live premium). */
function MedicalModal({ rate, ceiling, premiumFraction = 1, onClose }: { rate: BoardMedicalRate; ceiling: number; premiumFraction?: number; onClose: () => void }) {
  const router = useRouter();
  const [spouse, setSpouse] = useState(false);
  const [u18, setU18] = useState(0);
  const [o18, setO18] = useState(0);
  const [msg, setMsg] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const annualPremium = computeMedicalPremium(rate, { spouse, childrenUnder18: u18, children18Plus: o18 });
  // Preview the prorated premium the server will actually commit for a mid-year starter.
  const isPro = premiumFraction < 1;
  const premium = Math.round(annualPremium * premiumFraction);

  function commit() {
    startTransition(async () => {
      const res = await commitMedical({ spouse, childrenUnder18: u18, children18Plus: o18 });
      setMsg({ errors: res.errors, warnings: res.warnings });
      if (res.ok) { router.refresh(); onClose(); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-xl text-ink">Personal medical insurance</h3>
        <p className="mt-1 text-sm text-muted">You are always covered. Add dependants below. Medical is 100% company-covered and, once committed, locked (HR-managed).</p>
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <div><div className="text-sm font-medium text-ink">You</div><div className="text-xs text-muted">{egp(rate.self)}</div></div>
            <span className="text-xs text-muted">Included</span>
          </div>
          <label className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <div><div className="text-sm font-medium text-ink">Spouse</div><div className="text-xs text-muted">{egp(rate.spouse)}</div></div>
            <input type="checkbox" checked={spouse} onChange={(e) => setSpouse(e.target.checked)} className="h-5 w-5" />
          </label>
          <Counter label="Children under 18" note={egp(rate.childUnder18) + " each"} value={u18} onChange={setU18} />
          <Counter label="Children 18+" note={egp(rate.child18Plus) + " each"} value={o18} onChange={setO18} />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-navy-50 px-4 py-3">
          <span className="text-sm font-medium text-navy-800">{isPro ? "Prorated premium (100% covered)" : "Annual premium (100% covered)"}</span>
          <span className="font-serif text-lg text-navy-800 tabular-nums">
            {egp(premium)}
            {isPro ? <span className="ml-1.5 align-middle text-xs font-normal text-muted line-through">{egp(annualPremium)}</span> : null}
          </span>
        </div>
        {premium > ceiling ? <p className="mt-2 text-xs font-medium text-red-600">Premium exceeds your pool — it will be capped at {egp(ceiling)}; contact HR.</p> : null}
        {msg?.errors.length ? <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700"><ul className="list-disc pl-4">{msg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
        {msg && msg.warnings.length > 0 ? <div className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{msg.warnings.join(" ")}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
          <button type="button" onClick={commit} disabled={pending} className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
            {pending ? "Committing…" : "Commit medical"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal to claim/request a guaranteed benefit. */
function GuaranteedClaimModal({ benefit, onClose }: { benefit: BoardGuaranteed; onClose: () => void }) {
  const t = tracker(benefit.allocated, benefit.claims);
  const isProof = benefit.claimType === "PROOF";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-xl text-ink">{benefit.name}</h3>
        <p className="mt-1 text-sm text-muted">
          {isProof ? "Upload proof of your spend; you're reimbursed up to your allocation." : "Request this benefit — HR reviews and pays it out."}
          {benefit.allocated != null ? ` Up to ${egp(t.remaining ?? 0)} left.` : ""}
        </p>
        <form action={createClaim} encType="multipart/form-data" className="mt-4">
          <input type="hidden" name="kind" value="guaranteed" />
          <input type="hidden" name="benefitId" value={benefit.id} />
          {isProof ? (
            <div className="mb-3">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Amount to claim (EGP)</label>
              <input name="amount" inputMode="numeric" placeholder={t.remaining != null ? String(t.remaining) : "Amount"} required className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted">Requests the full amount{benefit.allocated != null ? ` (${egp(benefit.allocated)})` : ""}.</p>
          )}
          <div className="mb-3">
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Note (optional)</label>
            <input name="note" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
          </div>
          {isProof ? (
            <div className="mb-3">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Proof of payment (required)</label>
              <input type="file" name="proof" required className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-navy-700" />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
            <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">{isProof ? "Submit claim" : "Confirm request"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Counter({ label, note, value, onChange }: { label: string; note: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
      <div><div className="text-sm font-medium text-ink">{label}</div><div className="text-xs text-muted">{note}</div></div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="h-8 w-8 rounded-lg border border-line text-muted">−</button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="h-8 w-8 rounded-lg border border-line text-muted">+</button>
      </div>
    </div>
  );
}
