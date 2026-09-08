import { formatDate, formatEGP2, toDateInput } from "@/lib/labels";
import { PendingSubmitButton } from "@/components/PendingSubmitButton";
import { withdrawSubmission } from "@/app/(app)/finance/batch-actions";
import type { PayableGroup, PayableKind } from "@/lib/finance/payables";
import { AwaitingTable, type AwaitingRow, type UnitOption } from "@/components/confirmations/AwaitingTable";

export type SubmissionRow = {
  id: string;
  reference: string;
  summary: string;
  total: string;
  status: "SUBMITTED" | "COMPLETE" | "RETURNED" | "WITHDRAWN";
  submittedOn: string;
  decidedOn: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  businessUnitName: string;
};

/**
 * Finance's side of the confirmation flow (spec 041): record what you have created in the bank,
 * and see what is waiting on the confirmer.
 *
 * ONE TABLE SINCE 2026-09-08. It was a band per business unit, which made mixing two units
 * structurally impossible but also meant six boxes to read and no way to search. The CEO asked for
 * a table with a search box, quick filters by kind, and the unit as a column. The rule the bands
 * were carrying is rebuilt as a selection lock inside the table — see `AwaitingTable` — and the
 * server's own refusal of a mixed submission is untouched.
 *
 * This half stays on the server: it turns the grouped payables into flat rows, formats every date
 * and amount once, and renders the two lists below the table, which are read rather than operated.
 */

const KIND_LABEL: Record<PayableKind, string> = {
  BENEFIT_CLAIM: "Benefit",
  FLOAT_TOPUP: "Petty cash",
  PAYBACK: "Payback",
  INCENTIVE_PAYOUT: "Incentive",
};

export function SubmitPanel({
  groups,
  submissions,
}: {
  groups: PayableGroup[];
  submissions: SubmissionRow[];
}) {
  const waiting = submissions.filter((s) => s.status === "SUBMITTED");
  const settled = submissions.filter((s) => s.status !== "SUBMITTED");

  // A blocked row keeps its place in the list and says why, rather than being a row with a
  // missing button — the reason belongs where the person is already looking.
  const rows: AwaitingRow[] = groups.flatMap((g) =>
    g.payables.map((p) => ({
      key: `${p.kind}:${p.id}`,
      kind: p.kind,
      kindLabel: KIND_LABEL[p.kind],
      payee: p.payeeName,
      purpose: p.purpose,
      unitId: g.businessUnitId,
      unitName: g.businessUnitName,
      since: formatDate(p.since),
      amountPiastres: p.amountPiastres,
      amount: formatEGP2(p.amountPiastres / 100),
      canSend: g.canSend,
      blockedReason:
        g.businessUnitId === null
          ? "No business unit set, so there is no account to pay them from."
          : g.canSend
            ? null
            : `Nobody is appointed to confirm ${g.businessUnitName}, so this cannot be sent yet.`,
    })),
  );

  const units: UnitOption[] = groups
    .filter((g): g is PayableGroup & { businessUnitId: string } => g.businessUnitId !== null)
    .map((g) => ({
      id: g.businessUnitId,
      name: g.businessUnitName,
      confirmerNames: g.confirmerNames,
    }));

  return (
    <div>
      <AwaitingTable rows={rows} units={units} today={toDateInput(new Date())} />

      <h3 className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">
        Awaiting confirmation
        {waiting.length ? <span className="ml-2 font-semibold text-ink">{waiting.length}</span> : null}
      </h3>
      {waiting.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-muted">Nothing is with a confirmer.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {waiting.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
            >
              <span className="text-[12.5px]">
                <b className="text-ink">{s.reference}</b>
                <span className="ml-2 rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] font-bold text-muted">
                  {s.businessUnitName}
                </span>
                <span className="block text-[11.5px] text-muted">
                  {s.summary} · submitted {s.submittedOn}
                </span>
              </span>
              <details>
                <summary className="w-fit cursor-pointer list-none rounded-lg border border-line px-3 py-1.5 text-[11.5px] font-semibold text-muted [&::-webkit-details-marker]:hidden">
                  Withdraw…
                </summary>
                <form action={withdrawSubmission} className="mt-2 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input
                    type="text"
                    name="reason"
                    required
                    placeholder="Why?"
                    className="w-56 rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12px]"
                  />
                  <PendingSubmitButton
                    pendingLabel="…"
                    className="rounded-lg border border-line px-3 py-1.5 text-[11.5px] font-semibold text-muted"
                  >
                    Withdraw
                  </PendingSubmitButton>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      {settled.length > 0 ? (
        <>
          <h3 className="mt-8 text-[12.5px] font-bold uppercase tracking-[0.09em] text-muted">Settled</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {settled.map((s) => (
              <li key={s.id} className="text-[12.5px] text-muted">
                <b className="text-ink">{s.reference}</b> · {s.businessUnitName} · {s.summary} ·{" "}
                {s.status === "COMPLETE"
                  ? `complete ${s.decidedOn ?? ""}${s.decidedBy ? ` · ${s.decidedBy}` : ""}`
                  : s.status === "RETURNED"
                    ? `returned${s.decisionNote ? ` — “${s.decisionNote}”` : ""}`
                    : `withdrawn${s.decisionNote ? ` — “${s.decisionNote}”` : ""}`}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
