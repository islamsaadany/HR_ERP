"use client";

import { useState, useTransition } from "react";
import type { ReportRow } from "@/lib/benefits/report";
import { formatNumber } from "@/lib/labels";
import {
  reduceFlexibleClaim,
  raisePoolCeiling,
  acceptPoolOverrun,
  clearPoolException,
} from "@/app/(app)/admin/benefits/overrun-actions";

/**
 * Resolving one over-drawn pool, from the report row's popup (mockup approved 2026-08-20).
 *
 * Only appears for a row that is actually over, or one carrying a recorded decision. Four routes;
 * "raise this person's ceiling" is Super-User-only because it authorises spend past a money rule.
 * Nothing happens until Apply, and every route requires a reason — the record IS the point.
 */
type Route = "reduce" | "raise" | "medical" | "accept";

export function OverrunResolvePanel({
  row,
  planYearId,
  canRaiseCeiling,
  onDone,
}: {
  row: ReportRow;
  planYearId: string;
  /** Super User. The raise route is hidden entirely for anyone else. */
  canRaiseCeiling: boolean;
  onDone: () => void;
}) {
  const overBy = row.remaining != null && row.remaining < 0 ? Math.abs(row.remaining) : 0;
  const flexClaims = row.detail.claims.filter((c) => c.kind === "flex" && c.status !== "REJECTED");

  const [route, setRoute] = useState<Route>(flexClaims.length > 0 ? "reduce" : canRaiseCeiling ? "raise" : "accept");
  const [claimId, setClaimId] = useState(flexClaims[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedClaim = flexClaims.find((c) => c.id === claimId) ?? null;

  function apply() {
    setError(null);
    const fd = new FormData();
    fd.set("reason", reason);
    fd.set("userId", row.userId);
    fd.set("planYearId", planYearId);
    startTransition(async () => {
      let res;
      if (route === "reduce") {
        fd.set("claimId", claimId);
        fd.set("amount", amount);
        res = await reduceFlexibleClaim(fd);
      } else if (route === "raise") {
        fd.set("amount", amount);
        res = await raisePoolCeiling(fd);
      } else {
        res = await acceptPoolOverrun(fd);
      }
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  function undo() {
    setError(null);
    const fd = new FormData();
    fd.set("userId", row.userId);
    fd.set("planYearId", planYearId);
    startTransition(async () => {
      const res = await clearPoolException(fd);
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  // A decision already recorded — show it and offer to undo, rather than a form.
  if (row.exception) {
    return (
      <div className="mt-5 rounded-xl border border-gold-300 bg-gold-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gold-800">
          {row.exception.kind === "RAISED" ? "Ceiling raised for this cycle" : "Overrun accepted"}
        </p>
        <p className="mt-1 text-sm text-ink">
          {row.exception.kind === "RAISED" && row.exception.amount != null
            ? `Their ceiling for this cycle is ${formatNumber(row.exception.amount)}.`
            : "The figures stand as they are; this row is no longer flagged."}
        </p>
        <p className="mt-1 text-sm text-muted">&ldquo;{row.exception.reason}&rdquo;</p>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          onClick={undo}
          disabled={pending}
          className="mt-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted hover:border-red-300 hover:text-red-700 disabled:opacity-60"
        >
          {pending ? "Undoing…" : "Undo this decision"}
        </button>
      </div>
    );
  }

  if (overBy <= 0) return null;

  const Option = ({ id, title, children }: { id: Route; title: string; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => { setRoute(id); setError(null); }}
      className={
        "block w-full rounded-lg border p-3 text-left transition " +
        (route === id ? "border-navy-700 bg-navy-50" : "border-line bg-surface hover:border-navy-300")
      }
    >
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="mt-0.5 block text-xs text-muted">{children}</span>
    </button>
  );

  return (
    <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800">
        Over pool by {formatNumber(overBy)} — resolve
      </p>

      <div className="mt-3 space-y-2">
        {flexClaims.length > 0 ? (
          <Option id="reduce" title="Reduce a flexible claim">
            Lower a claim so the pool balances. Use when the claim should not have been paid in full.
          </Option>
        ) : null}

        {canRaiseCeiling ? (
          <Option id="raise" title="Raise their ceiling for this cycle">
            Authorise the spend instead of reversing it. Super User only — it permits spending past
            a money rule.
          </Option>
        ) : null}

        {row.detail.medical ? (
          <Option id="medical" title="Remove or re-price the medical commitment">
            Only when the cover itself was wrong. Done from the Medical commitments tab.
          </Option>
        ) : null}

        <Option id="accept" title="Accept it and note why">
          Leaves the numbers alone and records the decision, so the report stops flagging this row.
        </Option>
      </div>

      {route === "reduce" && flexClaims.length > 0 ? (
        <div className="mt-3 space-y-2">
          <select
            value={claimId}
            onChange={(e) => setClaimId(e.target.value)}
            aria-label="Claim to reduce"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          >
            {flexClaims.map((c) => (
              <option key={c.id} value={c.id}>
                {c.benefit} · {formatNumber(c.covered)} · {c.date}
              </option>
            ))}
          </select>
          <NumberField
            value={amount}
            onChange={setAmount}
            placeholder={selectedClaim ? String(Math.max(0, selectedClaim.covered - overBy)) : ""}
            hint={
              selectedClaim
                ? `Now ${formatNumber(selectedClaim.covered)}. Reducing it to ${formatNumber(Math.max(0, selectedClaim.covered - overBy))} clears the overrun.`
                : undefined
            }
          />
        </div>
      ) : null}

      {route === "raise" && canRaiseCeiling ? (
        <div className="mt-3">
          <NumberField
            value={amount}
            onChange={setAmount}
            placeholder={row.ceiling != null ? String(row.ceiling + overBy) : ""}
            hint={`They have used ${formatNumber(row.medical + row.flexUsed)}, so the new ceiling must be at least that.`}
          />
        </div>
      ) : null}

      {route === "medical" ? (
        <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          Medical commitments are changed on <strong className="text-ink">Admin → Benefits → Medical
          commitments</strong>, where the covered people and the price are shown together. Re-pricing
          there recalculates from who is actually covered.
        </p>
      ) : null}

      {route !== "medical" ? (
        <>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why — recorded against this decision"
            aria-label="Reason"
            className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
          />
          {error ? <p className="mt-2 text-sm font-medium text-red-700" role="alert">{error}</p> : null}
          <button
            type="button"
            onClick={apply}
            disabled={pending || reason.trim() === ""}
            className="mt-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60"
          >
            {pending ? "Applying…" : "Apply"}
          </button>
        </>
      ) : null}
    </div>
  );
}

function NumberField({
  value, onChange, placeholder, hint,
}: { value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder={placeholder}
        aria-label="Amount"
        className="w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none"
      />
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
