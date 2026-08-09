"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { computeMedicalPremium } from "@/lib/benefits/rules";
import { commitMedical } from "@/app/(app)/benefits/actions";

const egp = (n: number) => "EGP " + Math.round(n).toLocaleString();

type Rate = { self: number; spouse: number; childUnder18: number; child18Plus: number };
type Committed = {
  spouse: boolean;
  childrenUnder18: number;
  children18Plus: number;
  premium: number;
} | null;

/**
 * Medical insurance — the single commitment in the benefits module (spec 018). Committed once per
 * plan year; locked afterward (only HR can change it). The premium is 100% covered, drawn from the
 * pool, and exempt from the 50% single-benefit cap.
 */
export function MedicalCommitmentCard({
  committed,
  rate,
  ceiling,
  open,
}: {
  committed: Committed;
  rate: Rate;
  ceiling: number;
  open: boolean;
}) {
  const router = useRouter();
  const [spouse, setSpouse] = useState(false);
  const [childrenUnder18, setU18] = useState(0);
  const [children18Plus, setO18] = useState(0);
  const [msg, setMsg] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = computeMedicalPremium(rate, { spouse, childrenUnder18, children18Plus });

  function submit() {
    startTransition(async () => {
      const res = await commitMedical({ spouse, childrenUnder18, children18Plus });
      setMsg({ errors: res.errors, warnings: res.warnings });
      if (res.ok) router.refresh();
    });
  }

  // ── Committed (locked) ──
  if (committed) {
    const deps = [
      committed.spouse ? "spouse" : null,
      committed.childrenUnder18 + committed.children18Plus > 0
        ? `${committed.childrenUnder18 + committed.children18Plus} child(ren)`
        : null,
    ].filter(Boolean);
    return (
      <section className="mt-6 overflow-hidden rounded-xl border border-navy-200 bg-navy-50">
        <div className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-700 text-sm font-bold text-white">✓</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg text-ink">Medical insurance — committed</h2>
                <span className="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-800">50% exempt</span>
              </div>
              <p className="mt-0.5 text-sm text-navy-700">
                You{deps.length ? " + " + deps.join(" + ") : ""} · 100% covered.
                It&apos;s arranged with a provider — contact HR to change or remove it.
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="font-serif text-2xl text-navy-800 tabular-nums">{egp(committed.premium)}</div>
            <div className="text-[11px] text-muted">annual premium (from your pool)</div>
          </div>
        </div>
      </section>
    );
  }

  // ── Not committed ──
  if (!open) {
    return (
      <section className="mt-6 rounded-xl border border-dashed border-line bg-surface p-6 text-sm text-muted">
        Medical insurance can be committed when a benefits selection window is open.
      </section>
    );
  }

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-6 py-4">
        <div className="flex items-center gap-2">
          <h2 className="font-serif text-lg text-ink">Medical insurance</h2>
          <span className="rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gold-800">50% exempt</span>
        </div>
        <p className="mt-0.5 text-sm text-muted">
          The one benefit you commit up front — you&apos;re always covered; add dependants below. 100% company-covered,
          drawn from your pool. Once committed it&apos;s locked (HR-managed), so review before you confirm.
        </p>
      </div>

      <div className="grid gap-3 px-6 py-5 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">You</div>
            <div className="text-xs text-muted">{egp(rate.self)}</div>
          </div>
          <span className="text-xs text-muted">Included</span>
        </div>
        <label className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
          <div>
            <div className="text-sm font-medium text-ink">Spouse</div>
            <div className="text-xs text-muted">{egp(rate.spouse)}</div>
          </div>
          <input type="checkbox" checked={spouse} onChange={(e) => setSpouse(e.target.checked)} className="h-5 w-5" />
        </label>
        <Counter label="Children under 18" note={egp(rate.childUnder18) + " each"} value={childrenUnder18} onChange={setU18} />
        <Counter label="Children 18+" note={egp(rate.child18Plus) + " each"} value={children18Plus} onChange={setO18} />
      </div>

      <div className="flex flex-col gap-3 border-t border-line px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-muted">Annual premium (100% covered)</span>
          <span className="font-serif text-xl text-navy-800 tabular-nums">{egp(preview)}</span>
          {preview > ceiling ? (
            <span className="text-xs font-medium text-red-600">exceeds your pool — contact HR</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
        >
          {pending ? "Committing…" : "Commit medical"}
        </button>
      </div>

      {msg?.errors.length ? (
        <div className="mx-6 mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          <ul className="list-disc pl-4">{msg.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      ) : null}
      {msg && msg.warnings.length > 0 ? (
        <div className="mx-6 mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{msg.warnings.join(" ")}</div>
      ) : null}
    </section>
  );
}

function Counter({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-muted">{note}</div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} className="h-8 w-8 rounded-lg border border-line text-muted">−</button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} className="h-8 w-8 rounded-lg border border-line text-muted">+</button>
      </div>
    </div>
  );
}
