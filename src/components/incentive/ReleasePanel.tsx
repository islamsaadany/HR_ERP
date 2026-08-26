"use client";

import { startTransition, useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { IncentivePayoutKind } from "@prisma/client";
import { releasePayments, type ReleaseState } from "@/app/(app)/incentive/release-actions";

export type ReleaseLine = {
  key: string;
  personName: string;
  matchedName: string | null;
  employeeId: string | null;
  kind: IncentivePayoutKind;
  amount: number;
  nameMismatch: boolean;
  released: { amount: number; confirmed: boolean } | null;
};

const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND_LABEL: Record<IncentivePayoutKind, string> = {
  SCHEME_FEES: "Business Partner Fee",
  COMMISSION: "Commission",
};

/**
 * One business unit's releasable payments (spec 009 FR-006g).
 *
 * A release becomes one transaction in one bank account, so this panel is the whole unit
 * of work: there is no list anywhere containing two units' people, and the server re-checks
 * the unit anyway — "the screen doesn't offer it" has never been a control.
 */
export function ReleasePanel({
  cycleId,
  businessUnitId,
  businessUnitName,
  yours,
  headNames,
  confirmerNames,
  lines,
}: {
  cycleId: string;
  businessUnitId: string;
  businessUnitName: string;
  yours: boolean;
  headNames: string[];
  confirmerNames: string[];
  lines: ReleaseLine[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [state, act, saving] = useActionState<ReleaseState, FormData>(
    releasePayments.bind(null, cycleId, businessUnitId),
    null
  );

  useEffect(() => {
    if (state?.ok) {
      setPicked({});
      router.refresh();
    }
  }, [state, router]);

  const openLines = useMemo(() => lines.filter((l) => !l.released), [lines]);
  const chosen = openLines.filter((l) => picked[l.key]);
  const total = chosen.reduce((s, l) => s + l.amount, 0);

  const toggle = (key: string) => setPicked((p) => ({ ...p, [key]: !p[key] }));
  const allPicked = openLines.length > 0 && chosen.length === openLines.length;

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line bg-navy-50 px-4 py-2.5">
        <span className="font-semibold text-navy-900">{businessUnitName}</span>
        <span className="text-xs text-muted">
          {yours ? "you release this unit" : `${headNames.join(", ") || "nobody"} releases this unit`}
          {confirmerNames.length > 0 ? ` · confirmed by ${confirmerNames.join(", ")}` : " · nobody appointed to confirm"}
        </span>
        <span className="flex-1" />
        {yours && openLines.length > 0 ? (
          <span
            className={
              "rounded-full border px-2.5 py-0.5 text-[11px] font-bold " +
              (chosen.length
                ? "border-gold-300 bg-gold-100 text-gold-800"
                : "border-line bg-paper text-muted")
            }
          >
            {chosen.length} of {openLines.length} selected
          </span>
        ) : null}
      </div>

      {state && !state.ok ? (
        <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="mx-4 mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
          {state.message}
        </p>
      ) : null}

      <form action={(fd) => startTransition(() => act(fd))}>
        <div className="ff-hscroll">
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className="w-10 px-3 py-2">
                  {yours && openLines.length > 0 ? (
                    <input
                      type="checkbox"
                      aria-label={`Select every payment for ${businessUnitName}`}
                      checked={allPicked}
                      onChange={() =>
                        setPicked(
                          allPicked ? {} : Object.fromEntries(openLines.map((l) => [l.key, true]))
                        )
                      }
                      className="h-4 w-4 accent-navy-700"
                    />
                  ) : null}
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">Person</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">For</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Amount</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.key} className={l.released ? "opacity-70" : undefined}>
                  <td className="px-3 py-2">
                    {yours && !l.released ? (
                      <input
                        type="checkbox"
                        name="line"
                        value={l.key}
                        checked={!!picked[l.key]}
                        onChange={() => toggle(l.key)}
                        aria-label={`Release ${KIND_LABEL[l.kind]} for ${l.personName}`}
                        className="h-4 w-4 accent-navy-700"
                      />
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-ink">
                    {l.personName}
                    {l.nameMismatch ? (
                      <span
                        className="ml-2 rounded border border-amber-300 bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-800"
                        title={`Employee ID ${l.employeeId} belongs to ${l.matchedName} — check the spelling in the People sheet.`}
                      >
                        is {l.matchedName}?
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm text-muted">{KIND_LABEL[l.kind]}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums text-ink">{m(l.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-sm">
                    {l.released ? (
                      <span
                        className={
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold " +
                          (l.released.confirmed
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-navy-200 bg-blue-50 text-blue-700")
                        }
                      >
                        {l.released.confirmed ? "Paid" : "Awaiting confirmation"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Not released</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {yours ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line bg-paper px-4 py-3">
            <span className="min-w-[13rem] flex-1 text-xs text-muted">
              Releasing <strong className="tabular-nums text-ink">{chosen.length}</strong> payment
              {chosen.length === 1 ? "" : "s"} totalling{" "}
              <strong className="tabular-nums text-ink">{m(total)}</strong> EGP to {businessUnitName}
              &rsquo;s account.
            </span>
            <button
              type="submit"
              disabled={saving || chosen.length === 0}
              className="rounded-lg bg-navy-800 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-700 disabled:opacity-40"
            >
              {saving ? "Releasing…" : "Release to Finance"}
            </button>
          </div>
        ) : (
          <p className="border-t border-line bg-paper px-4 py-3 text-xs text-muted">
            {headNames.join(", ") || "Nobody"} releases {businessUnitName}. You can see it here; you
            cannot send it.
          </p>
        )}
      </form>
    </section>
  );
}
