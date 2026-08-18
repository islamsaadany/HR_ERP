"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGrant, removeGrant } from "@/app/(app)/admin/benefits/grant-actions";
import { formatNumber } from "@/lib/labels";

export type GrantRow = {
  id: string;
  userName: string;
  userMeta: string; // "Part-time · Finance"
  reason: string; // why the rules block them ("" = already eligible)
  amount: number;
  grantedBy: string;
  grantedAtLabel: string; // dd/mm/yyyy
  /** A non-rejected claim exists — removal is locked (FR-007). */
  locked: boolean;
};

export type GrantCandidate = {
  id: string;
  name: string;
  /** Why the rules block them for THIS benefit ("" = already eligible). */
  reason: string;
  /** Band figure when derivable — pre-fills the amount input. */
  prefill: number | null;
};

export type GrantsBenefit = {
  id: string;
  name: string;
  grants: GrantRow[];
  candidates: GrantCandidate[];
};

/**
 * Individual grants (spec 036; mockup signed off 2026-08-18): Super-User-only exceptions —
 * one person, one guaranteed benefit, this cycle, at a typed amount. The granted person then
 * requests it through the completely normal flow.
 */
export function BenefitGrantsPanel({ benefits, planYearName }: { benefits: GrantsBenefit[]; planYearName: string }) {
  const router = useRouter();
  const [benefitId, setBenefitId] = useState(benefits[0]?.id ?? "");
  const [candidateId, setCandidateId] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const benefit = useMemo(() => benefits.find((b) => b.id === benefitId) ?? null, [benefits, benefitId]);

  function pickCandidate(id: string) {
    setCandidateId(id);
    const c = benefit?.candidates.find((x) => x.id === id);
    setAmount(c?.prefill != null ? String(c.prefill) : "");
  }

  function grant() {
    if (!benefit || !candidateId) return;
    const fd = new FormData();
    fd.set("benefitId", benefit.id);
    fd.set("userId", candidateId);
    fd.set("amount", amount);
    startTransition(async () => {
      const res = await addGrant(fd);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Granted." } : { ok: false, text: res.error });
      if (res.ok) {
        setCandidateId("");
        setAmount("");
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      const res = await removeGrant(fd);
      setMsg(res.ok ? { ok: true, text: res.message ?? "Removed." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  if (benefits.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-serif text-lg text-ink">Individual grants</h2>
        <span className="rounded-full bg-gold-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold-800">
          Super User
        </span>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Grant a guaranteed benefit to ONE person the rules block — wrong type, under 6 months,
        whatever the reason. They then request it through the completely normal flow. One grant
        per person per benefit, for {planYearName} only; it never changes who else is eligible.
      </p>

      <div className="mt-4">
        <select
          value={benefitId}
          onChange={(e) => { setBenefitId(e.target.value); setCandidateId(""); setAmount(""); setMsg(null); }}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
          aria-label="Benefit"
        >
          {benefits.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {msg ? (
        <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      ) : null}

      {benefit ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Why the rules block them</th>
                  <th className="py-2 pr-4 text-right font-medium">Granted amount</th>
                  <th className="py-2 pr-4 font-medium">Granted by</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {benefit.grants.length === 0 ? (
                  <tr><td colSpan={5} className="py-4 text-sm text-muted">No grants on this benefit for {planYearName}.</td></tr>
                ) : (
                  benefit.grants.map((g) => (
                    <tr key={g.id} className="border-t border-line align-middle">
                      <td className="py-2.5 pr-4">
                        <div className="font-medium text-ink">{g.userName}</div>
                        <div className="text-xs text-muted">{g.userMeta}</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[11px] font-bold text-muted">
                          {g.reason || "already eligible — amount overridden"}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-ink">{formatNumber(g.amount)}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted">{g.grantedBy} · {g.grantedAtLabel}</td>
                      <td className="py-2.5 text-right">
                        {g.locked ? (
                          <span
                            className="rounded-full border border-gold-300 bg-gold-100 px-2.5 py-0.5 text-[11px] font-bold text-gold-800"
                            title="A request exists on this grant — it can't be removed"
                          >
                            requested — can&apos;t remove
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => remove(g.id)}
                            className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-line pt-4">
            <div>
              <label htmlFor="grant-employee" className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Employee</label>
              <select
                id="grant-employee"
                value={candidateId}
                onChange={(e) => pickCandidate(e.target.value)}
                className="min-w-[250px] rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-navy-500 focus:outline-none"
              >
                <option value="">— choose an employee —</option>
                {benefit.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.reason ? ` — ${c.reason}` : " — already eligible"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="grant-amount" className="mb-1 block text-[11px] uppercase tracking-wide text-muted">Amount (EGP)</label>
              <input
                id="grant-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 rounded-lg border border-line bg-surface px-3 py-2 text-right text-sm tabular-nums focus:border-navy-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={pending || !candidateId || !(Math.floor(Number(amount)) > 0)}
              onClick={grant}
              className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50"
            >
              Grant for {planYearName}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            The amount pre-fills when the band table can price the person; type it otherwise.
            Whole EGP. Removal is refused once the person has requested the benefit.
          </p>
        </>
      ) : null}
    </section>
  );
}
