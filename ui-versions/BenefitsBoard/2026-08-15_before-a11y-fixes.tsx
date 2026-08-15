"use client";

import { useState, useTransition, useRef, useCallback, useContext, createContext, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ClaimType, ClaimStatus } from "@prisma/client";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS, tracker } from "@/lib/benefits/claims";
import { coveredAmount } from "@/lib/benefits/coverage";
import { formatDate, formatEGP as egp, formatNumber } from "@/lib/labels";
import { createClaim } from "@/app/(app)/benefits/claim-actions";
import { commitMedical } from "@/app/(app)/benefits/actions";

// Lightweight success-toast plumbing: a claim form calls notify(text); toasts
// float bottom-left and auto-dismiss. Errors stay inline near the form.
const ToastContext = createContext<(text: string) => void>(() => {});

type Toast = { id: number; text: string };
function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onDismiss(t.id)}
          className="ff-toast flex items-center gap-2.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left text-sm font-semibold text-green-700 shadow-lg"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-600" aria-hidden="true" />
          <span>✓ {t.text}</span>
        </button>
      ))}
    </div>
  );
}

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
/** Present when the pool is prorated to a short cycle (spec 019): the cycle's whole months (of 12). */
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
/** A person the employee can cover, priced by age band (spec 023). `id` null = the employee (always covered). */
export type BoardMedicalPerson = {
  id: string | null;
  label: string;
  kind: "SELF" | "SPOUSE" | "CHILD";
  age: number;
  bandLabel: string;
  premiumEGP: number; // whole EGP, cents dropped
};
export type BoardMedicalCommitted = {
  premium: number;
  people: { label: string; premiumEGP: number }[];
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
  medicalPeople,
  medicalCommitted,
  medicalMissingDob = false,
  planYearOpen,
  proration,
  medicalOnly,
  medicalOffered = true,
  familyMedical = true,
  medicalPremiumFraction = 1,
  medicalProration,
  error,
  claimSuccess,
}: {
  ceiling: number;
  poolUsed: number;
  poolRemaining: number;
  cap: number;
  guaranteed: BoardGuaranteed[];
  automatic: string[];
  groups: BoardGroup[];
  /** The employee + their dependants, each priced by age band (spec 023). Employee is `id: null`. */
  medicalPeople: BoardMedicalPerson[];
  medicalCommitted: BoardMedicalCommitted;
  /** True when the employee has no date of birth on file — medical can't be priced, so commit is blocked. */
  medicalMissingDob?: boolean;
  planYearOpen: boolean;
  proration?: BoardProration;
  /** Sub-6-month employee (spec 019): only medical is available; the rest unlocks at 6 months. */
  medicalOnly?: boolean;
  /** Whether any medical cover is offered to this employee (spec 021). When false, no medical row shows. */
  medicalOffered?: boolean;
  /** Whether the employee is eligible for Family medical — unlocks spouse/children pickers (spec 021). */
  familyMedical?: boolean;
  /** Prorates the medical premium PREVIEW to match the server (fraction of the year). */
  medicalPremiumFraction?: number;
  /** Badge data for a prorated medical premium. */
  medicalProration?: BoardProration;
  error?: string;
  /** Shown after a claim is submitted (redirect `?claimOk=1`). */
  claimSuccess?: boolean;
}) {
  const [medOpen, setMedOpen] = useState(false);
  const [gClaim, setGClaim] = useState<BoardGuaranteed | null>(null);
  const pct = ceiling > 0 ? Math.min(100, (poolUsed / ceiling) * 100) : 0;

  // Floating success toasts (replaces the old redirect banner). notify() is shared
  // with the claim forms via ToastContext; each toast auto-dismisses.
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text }]);
    setTimeout(() => dismissToast(id), 4000);
  }, [dismissToast]);
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
            <h2 className="font-serif text-xl">{familyMedical ? "Medical insurance" : "Personal medical insurance"}</h2>
          </div>
          <div className="space-y-3 bg-surface p-5">
            {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
            {medicalOffered ? (
              <MedicalRow committed={medicalCommitted} familyMedical={familyMedical} onSetup={() => setMedOpen(true)} />
            ) : (
              <p className="rounded-lg border border-dashed border-line bg-paper px-4 py-3 text-sm text-muted">Medical insurance isn&apos;t available on your plan. Contact HR.</p>
            )}
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
          <MedicalModal people={medicalPeople} missingDob={medicalMissingDob} ceiling={ceiling} familyMedical={familyMedical} premiumFraction={medicalPremiumFraction} onClose={() => setMedOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <ToastContext.Provider value={notify}>
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

      {/* Flexible band — the same header shape as the guaranteed band above, filled gold
          instead of navy. The palette flip is what signals the switch from "the company
          gives you this" to "you choose and claim this". */}
      <div className="mt-8 rounded-2xl border border-gold-300 bg-gold-100 px-6 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-700">You choose · claim as you spend</div>
        <h2 className="mt-0.5 font-serif text-xl text-navy-900">Your flexible benefits</h2>
        <p className="mt-1.5 max-w-[62ch] text-sm text-gold-800">
          Enter the full price you paid; the company covers a set % of each benefit, and only that covered share
          draws from your pool.
        </p>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {automatic.length > 0 ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
          <strong>Paid automatically</strong> — no action needed: {automatic.join(", ")}.
        </p>
      ) : null}

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left: categorized rows */}
        <div>
          {/* Medical — a single section whether Personal-only or Family (spec 021). */}
          {medicalOffered ? (
            <div>
              <div className="flex items-center gap-3 pb-1 pt-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-600">Medical insurance</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                <MedicalRow committed={medicalCommitted} familyMedical={familyMedical} onSetup={() => setMedOpen(true)} />
              </div>
            </div>
          ) : null}
          {groups.map((group) => (
            <div key={group.category}>
              <div className="flex items-center gap-3 pb-1 pt-5 first:pt-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-600">{group.category}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <FlexRow key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Right: sticky meter + how it works */}
        <aside className="space-y-4 lg:sticky lg:top-24">
          {/* The pool is the most important number on the page, so it is the one dark
              object in the rail — it outranks the "How it works" card below it. */}
          <div className="rounded-2xl bg-navy-900 p-5 text-white shadow-[0_6px_20px_rgba(10,26,48,0.18)]">
            {proratedBadge ? <div className="mb-2">{proratedBadge}</div> : null}
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gold-300">Your pool</div>
            <div className="mt-1.5 font-serif text-[34px] leading-tight text-white tabular-nums">{egp(poolRemaining)}</div>
            <div className="mt-1 text-sm text-navy-200">
              left of your {egp(ceiling)} {proration ? "prorated" : "annual"} pool (company share)
            </div>
            {proration ? (
              <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs text-navy-100">
                This benefits cycle runs {proration.months} of 12 {proration.months === 1 ? "month" : "months"}, so
                your pool is scaled to that period. A full-length cycle carries the full annual amount.
              </p>
            ) : null}
            <div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-navy-700">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-3.5 border-t border-white/15">
              <div className="flex items-baseline justify-between py-2.5 text-sm">
                <span className="text-navy-200">Used</span>
                <span className="font-semibold tabular-nums text-white">{egp(poolUsed)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-white/10 py-2.5 text-sm">
                <span className="text-navy-200">Per-benefit cap (50%)</span>
                <span className="font-semibold tabular-nums text-white">{egp(cap)}</span>
              </div>
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
        <MedicalModal people={medicalPeople} missingDob={medicalMissingDob} ceiling={ceiling} familyMedical={familyMedical} premiumFraction={medicalPremiumFraction} onClose={() => setMedOpen(false)} />
      ) : null}

      {/* Guaranteed claim modal */}
      {gClaim ? <GuaranteedClaimModal benefit={gClaim} onClose={() => setGClaim(null)} /> : null}

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

/**
 * Compact status summary for a collapsed benefit row: one chip per claim status
 * that has claims, with a count. Reuses the app's claim-pill colors. Employees
 * see where each benefit stands without expanding; exact amounts stay in the
 * expanded claim history.
 */
// Spec 020 lifecycle chips.
const STATUS_CHIPS: { key: string; statuses: ClaimStatus[]; label: string; chip: string; dot: string }[] = [
  { key: "submitted", statuses: ["SUBMITTED"], label: "submitted", chip: "bg-gold-100 text-gold-800", dot: "bg-gold-500" },
  { key: "approved", statuses: ["APPROVED"], label: "approved", chip: "bg-navy-100 text-navy-800", dot: "bg-navy-600" },
  { key: "reimbursed", statuses: ["REIMBURSED"], label: "reimbursed", chip: "bg-navy-50 text-navy-700", dot: "bg-navy-700" },
  { key: "rejected", statuses: ["REJECTED"], label: "rejected", chip: "bg-red-50 text-red-700", dot: "bg-red-600" },
];

function ClaimStatusSummary({ claims }: { claims: BoardClaim[] }) {
  if (claims.length === 0) {
    return <p className="mt-2.5 text-xs italic text-muted">No claims yet.</p>;
  }
  const chips = STATUS_CHIPS.map((s) => ({
    ...s,
    count: claims.filter((c) => s.statuses.includes(c.status)).length,
  })).filter((s) => s.count > 0);
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {chips.map((s) => (
        <span
          key={s.key}
          className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold " + s.chip}
        >
          <span className={"h-1.5 w-1.5 rounded-full " + s.dot} aria-hidden="true" />
          {s.count} {s.label}
        </span>
      ))}
    </div>
  );
}

/** One flexible benefit — collapsed row that expands to a claim form. */
function FlexRow({ item }: { item: BoardFlex }) {
  const t = tracker(item.allocated, item.claims);
  const remaining = t.remaining ?? 0;
  const fullyClaimed = item.allocated != null && remaining <= 0;
  // Controlled open state so the card stays expanded through a soft refresh after submitting.
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-xl border border-line bg-surface open:border-navy-700"
    >
      <summary className="cursor-pointer list-none p-4 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-4">
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
        </div>
        <ClaimStatusSummary claims={item.claims} />
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
          <FlexClaimForm item={item} remaining={remaining} onSubmitted={() => setOpen(false)} />
        )}
      </div>
    </details>
  );
}

/** Full-price claim form for a flexible benefit with a live covered preview. */
function FlexClaimForm({ item, remaining, onSubmitted }: { item: BoardFlex; remaining: number; onSubmitted: () => void }) {
  const router = useRouter();
  const notify = useContext(ToastContext);
  const [fullCost, setFullCost] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const covered = coveredAmount(fullCost, item.coverageRate);
  const over = covered > remaining;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await createClaim(data);
      if (res.ok) {
        notify("Claim submitted — awaiting HR review."); // floating toast
        setFullCost(0);
        form.reset(); // clears the file input / note; amount is controlled and set above
        router.refresh(); // soft-refresh: this card's history/status updates in place
        onSubmitted(); // collapse the card now that the claim is in
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-surface p-3">
      <input type="hidden" name="kind" value="catalog" />
      <input type="hidden" name="benefitId" value={item.id} />
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Full price you paid (EGP)</label>
        <input
          name="amount"
          inputMode="numeric"
          value={fullCost ? formatNumber(fullCost) : ""}
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
      <button disabled={pending || fullCost <= 0 || over} className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
        {pending ? "Submitting…" : "Submit claim"}
      </button>
      {error ? (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>
      ) : null}
    </form>
  );
}

/** Medical — a row that shows the committed state, or a "Set up cover" prompt opening the modal. */
function MedicalRow({ committed, familyMedical = true, onSetup }: { committed: BoardMedicalCommitted; familyMedical?: boolean; onSetup: () => void }) {
  if (committed) {
    // Covered people from the commit snapshot (spec 023): the employee is the first line.
    const others = committed.people.slice(1).map((p) => p.label);
    return (
      <div className="flex items-start justify-between gap-4 rounded-xl border border-navy-200 bg-navy-50 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-ink">
            Medical insurance
            <span className="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-800">50% exempt</span>
            <span className="rounded bg-navy-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-navy-700">Committed</span>
          </div>
          <div className="mt-0.5 text-xs text-navy-700">You{others.length ? " + " + others.join(" + ") : ""} · 100% covered · contact HR to change.</div>
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
          The one benefit you commit up front — you&apos;re always covered{familyMedical ? "; add spouse and children" : " (personal cover)"}. 100% company-covered. Once committed it&apos;s locked (HR-managed).
        </div>
      </div>
      <button type="button" onClick={onSetup} className="shrink-0 rounded-lg bg-navy-50 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-100">
        Set up cover
      </button>
    </div>
  );
}

/**
 * Modal to commit medical (spec 023): tick which existing dependants to cover — each priced by age
 * band, whole EGP (cents dropped). The employee is always covered. Dependants are added/edited in the
 * profile, not here. Blocks with a message when the employee has no date of birth on file.
 */
function MedicalModal({
  people,
  missingDob = false,
  ceiling,
  familyMedical = true,
  premiumFraction = 1,
  onClose,
}: {
  people: BoardMedicalPerson[];
  missingDob?: boolean;
  ceiling: number;
  familyMedical?: boolean;
  premiumFraction?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const employee = people.find((p) => p.kind === "SELF") ?? people[0] ?? null;
  const deps = people.filter((p) => p.id !== null && p.kind !== "SELF");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  // Live preview: employee + ticked dependants (already whole EGP), then prorate (truncate) to match
  // the server for a mid-cycle joiner.
  const annualPremium =
    (employee?.premiumEGP ?? 0) + deps.filter((d) => selected.has(d.id!)).reduce((s, d) => s + d.premiumEGP, 0);
  const isPro = premiumFraction < 1;
  const premium = Math.trunc(annualPremium * premiumFraction);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function commit() {
    startTransition(async () => {
      const res = await commitMedical({ dependantIds: [...selected] });
      setMsg({ errors: res.errors, warnings: res.warnings });
      if (res.ok) { router.refresh(); onClose(); }
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-xl text-ink">{familyMedical ? "Family medical insurance" : "Personal medical insurance"}</h3>
        <p className="mt-1 text-sm text-muted">
          You are always covered.{familyMedical ? " Tick the people you want covered — each is priced by age. Add or edit dependants in your profile." : " This is personal cover — just you."} 100% company-covered; once committed it&apos;s locked (HR-managed).
        </p>

        {missingDob ? (
          <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            A date of birth is required to price medical. Contact HR to add your date of birth, then set up cover.
          </p>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-lg border border-navy-200 bg-navy-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink">You</div>
                  <div className="text-xs text-muted">Age {employee?.age} · band {employee?.bandLabel}</div>
                </div>
                <div className="text-sm font-semibold text-navy-800 tabular-nums">{egp(employee?.premiumEGP ?? 0)}</div>
              </div>
              {familyMedical && deps.length > 0 ? (
                deps.map((d) => (
                  <label key={d.id} className={"flex items-center justify-between rounded-lg border px-4 py-3 " + (selected.has(d.id!) ? "border-navy-200 bg-navy-50" : "border-line")}>
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={selected.has(d.id!)} onChange={() => toggle(d.id!)} className="h-5 w-5" />
                      <div>
                        <div className="text-sm font-medium text-ink">{d.label}</div>
                        <div className="text-xs text-muted">Age {d.age} · band {d.bandLabel}</div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-navy-800 tabular-nums">{egp(d.premiumEGP)}</div>
                  </label>
                ))
              ) : familyMedical ? (
                <p className="rounded-lg border border-dashed border-line bg-paper px-4 py-3 text-xs text-muted">
                  No dependants on file. Add your spouse or children in your profile to cover them.
                </p>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-navy-50 px-4 py-3">
              <span className="text-sm font-medium text-navy-800">{isPro ? "Prorated premium (100% covered)" : "Annual premium (100% covered)"}</span>
              <span className="font-serif text-lg text-navy-800 tabular-nums">
                {egp(premium)}
                {isPro ? <span className="ml-1.5 align-middle text-xs font-normal text-muted line-through">{egp(annualPremium)}</span> : null}
              </span>
            </div>
            {premium > ceiling ? <p className="mt-2 text-xs font-medium text-red-600">Premium exceeds your pool — it will be capped at {egp(ceiling)}; contact HR.</p> : null}
          </>
        )}

        {msg?.errors.length ? <div className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700"><ul className="list-disc pl-4">{msg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div> : null}
        {msg && msg.warnings.length > 0 ? <div className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{msg.warnings.join(" ")}</div> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
          <button type="button" onClick={commit} disabled={pending || missingDob} className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
            {pending ? "Committing…" : "Commit medical"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Modal to claim/request a guaranteed benefit. */
function GuaranteedClaimModal({ benefit, onClose }: { benefit: BoardGuaranteed; onClose: () => void }) {
  const router = useRouter();
  const notify = useContext(ToastContext);
  const t = tracker(benefit.allocated, benefit.claims);
  const isProof = benefit.claimType === "PROOF";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createClaim(data);
      if (res.ok) {
        notify("Claim submitted — awaiting HR review.");
        router.refresh(); // the underlying benefit card updates in place
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 p-4 backdrop-blur-md" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-serif text-xl text-ink">{benefit.name}</h3>
        <p className="mt-1 text-sm text-muted">
          {isProof ? "Upload proof of your spend; you're reimbursed up to your allocation." : "Request this benefit — HR reviews and pays it out."}
          {benefit.allocated != null ? ` Up to ${egp(t.remaining ?? 0)} left.` : ""}
        </p>
        <form onSubmit={onSubmit} className="mt-4">
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
          {error ? <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-muted">Cancel</button>
            <button disabled={pending} className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
              {pending ? "Submitting…" : isProof ? "Submit claim" : "Confirm request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

