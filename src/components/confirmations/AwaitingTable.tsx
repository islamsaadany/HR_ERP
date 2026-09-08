"use client";

import { useMemo, useState } from "react";
import { formatEGP2 } from "@/lib/labels";
import { submitTransactions } from "@/app/(app)/finance/batch-actions";
import type { PayableKind } from "@/lib/finance/payables";

/**
 * Everything Finance can send, in ONE table (2026-09-08).
 *
 * The CEO, on the screen this replaces: "the payments page is too much — they need to be a table
 * with search bar and quick filters to filter what they are petty cash or benefit, and the
 * business unit shouldn't be a separate box, it's just a column."
 *
 * ═══ THE RULE THE BOXES WERE CARRYING ═══
 * A submission is ONE transfer from ONE unit's bank account. Until today that was guaranteed
 * structurally — there was no list containing two units, so there was nothing to tick across. One
 * table gives that away, so the guarantee is rebuilt as a LOCK: the first tick fixes the selection
 * to that row's unit, and every other unit's rows stop being tickable until the selection is
 * cleared. The unit is never typed; it is read off the rows.
 *
 * And, as always, the screen is not the control. `submitTransactions` re-checks on the server that
 * everything posted belongs to the one unit named — a form can be posted by hand, and "the UI
 * doesn't offer it" has never been a control.
 * ════════════════════════════════════════
 *
 * SELECTION SURVIVES FILTERING. The tick boxes carry no form name; the selection is posted as
 * hidden fields covering every selected row, visible or not. Otherwise typing in the search box
 * would silently drop rows the operator had already ticked — the money equivalent of a lost
 * keystroke, and invisible until the total came out wrong.
 */

export type AwaitingRow = {
  /** "KIND:id" — what the server action parses back into a payable. */
  key: string;
  kind: PayableKind;
  kindLabel: string;
  payee: string;
  purpose: string;
  unitId: string | null;
  unitName: string;
  /** Pre-formatted dd/mm/yyyy — the server owns date formatting. */
  since: string;
  amountPiastres: number;
  amount: string;
  /** False when this row's unit has nobody appointed, or the person has no unit at all. */
  canSend: boolean;
  /** Why not, in words, on the row itself rather than as a missing button. */
  blockedReason: string | null;
};

export type UnitOption = { id: string; name: string; confirmerNames: string[] };

const KINDS: { id: PayableKind | "ALL"; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "BENEFIT_CLAIM", label: "Benefits" },
  { id: "FLOAT_TOPUP", label: "Petty cash" },
  { id: "PAYBACK", label: "Paybacks" },
  { id: "INCENTIVE_PAYOUT", label: "Incentive" },
];

export function AwaitingTable({
  rows,
  units,
  today,
}: {
  rows: AwaitingRow[];
  units: UnitOption[];
  /** Computed on the server: a `new Date()` here would differ between render passes. */
  today: string;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PayableKind | "ALL">("ALL");
  const [unit, setUnit] = useState<string>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const lockedUnitId = useMemo(() => {
    for (const r of rows) if (selected.has(r.key)) return r.unitId;
    return null;
  }, [rows, selected]);

  const matchesText = (r: AwaitingRow) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.payee.toLowerCase().includes(q) ||
      r.purpose.toLowerCase().includes(q) ||
      r.amount.toLowerCase().includes(q) ||
      r.unitName.toLowerCase().includes(q)
    );
  };
  const matchesUnit = (r: AwaitingRow) => unit === "ALL" || r.unitId === unit;

  // Each chip's count is the count of ITS OWN choice — what you would see if you pressed it —
  // so it is computed with the search and unit filters applied but not the kind filter.
  const counts = useMemo(() => {
    const base = rows.filter((r) => matchesText(r) && matchesUnit(r));
    const out: Record<string, number> = { ALL: base.length };
    for (const k of KINDS) if (k.id !== "ALL") out[k.id] = base.filter((r) => r.kind === k.id).length;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, unit]);

  const visible = rows.filter((r) => matchesText(r) && matchesUnit(r) && (kind === "ALL" || r.kind === kind));

  const tickable = (r: AwaitingRow) => r.canSend && (lockedUnitId === null || r.unitId === lockedUnitId);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectedRows = rows.filter((r) => selected.has(r.key));
  const totalPiastres = selectedRows.reduce((s, r) => s + r.amountPiastres, 0);
  const hiddenSelected = selectedRows.length - visible.filter((r) => selected.has(r.key)).length;
  const lockedUnit = units.find((u) => u.id === lockedUnitId) ?? null;

  // The header tick takes the whole of one unit: the locked one, or — when nothing is ticked yet —
  // whichever unit the first sendable visible row belongs to. Selecting "everything" could not be
  // honoured, since everything is rarely one bank account.
  const headerUnitId = lockedUnitId ?? visible.find((r) => r.canSend)?.unitId ?? null;
  const headerTargets = visible.filter((r) => r.canSend && r.unitId === headerUnitId);
  const allHeaderPicked = headerTargets.length > 0 && headerTargets.every((r) => selected.has(r.key));
  const toggleHeader = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allHeaderPicked) for (const r of headerTargets) next.delete(r.key);
      else for (const r of headerTargets) next.add(r.key);
      return next;
    });

  return (
    <section>
      <p className="max-w-prose text-muted">
        Tick what you have created in the bank — paybacks, float top-ups, approved benefit claims and
        released incentive payments all sit here — then send. Each business unit goes to its own
        confirmer, who is emailed straight away. The people being paid are told only once it is
        confirmed.
      </p>

      {/* ── search, quick filters, unit ─────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[15rem] flex-1">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name, a description or an amount"
            aria-label="Search what is waiting"
            className="w-full rounded-lg border border-navy-200 bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:border-navy-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              aria-pressed={kind === k.id}
              className={
                "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition " +
                (kind === k.id
                  ? "border-navy-800 bg-navy-800 text-white"
                  : "border-line bg-surface text-muted hover:border-navy-200 hover:text-navy-700")
              }
            >
              {k.label}
              <span className="ml-1.5 tabular-nums opacity-75">{counts[k.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <select
          value={lockedUnitId ?? unit}
          disabled={lockedUnitId !== null}
          onChange={(e) => setUnit(e.target.value)}
          aria-label="Business unit"
          className="rounded-lg border border-navy-200 bg-surface px-3 py-2 text-[12.5px] text-ink disabled:opacity-70"
        >
          <option value="ALL">All business units</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
              {lockedUnitId === u.id ? " — locked by your selection" : ""}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Nothing is waiting to be paid.
        </div>
      ) : (
        <form action={submitTransactions}>
          {/* The selection, whole — including rows the current search is hiding. */}
          <input type="hidden" name="businessUnitId" value={lockedUnitId ?? ""} />
          {selectedRows.map((r) => (
            <input key={r.key} type="hidden" name="payables" value={r.key} />
          ))}

          <div className="mt-4 ff-data-scroll rounded-xl border border-line bg-surface">
            <table className="ff-data-table text-sm">
              <thead>
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allHeaderPicked}
                      disabled={headerTargets.length === 0}
                      onChange={toggleHeader}
                      aria-label="Select this unit's payments"
                      className="h-4 w-4 rounded border-navy-500"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-medium">Paying</th>
                  <th className="px-3 py-3 text-left font-medium">For</th>
                  <th className="px-3 py-3 text-left font-medium">Type</th>
                  <th className="px-3 py-3 text-left font-medium">Business unit</th>
                  <th className="px-3 py-3 text-left font-medium">Waiting since</th>
                  <th className="px-3 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-[12.5px] text-muted">
                      Nothing matches that.
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => {
                    const isSel = selected.has(r.key);
                    const can = tickable(r);
                    return (
                      <tr
                        key={r.key}
                        className={
                          "border-b border-line last:border-b-0 align-middle " +
                          (isSel ? "bg-gold-50 " : "") +
                          (!can && !isSel ? "opacity-50 " : "")
                        }
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={!can}
                            onChange={() => toggle(r.key)}
                            aria-label={`Include ${r.payee}`}
                            className="h-4 w-4 rounded border-navy-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-ink">{r.payee}</td>
                        <td className="px-3 py-2 text-muted">
                          {r.purpose}
                          {r.blockedReason ? (
                            <span className="mt-0.5 block text-[11px] font-medium text-gold-800">
                              {r.blockedReason}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span className={"rounded px-2 py-0.5 text-[10px] font-bold " + KIND_CLASS[r.kind]}>
                            {r.kindLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-[12px] font-semibold text-navy-700">
                          {r.unitName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{r.since}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                          {r.amount}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* ── the send bar — only once something is ticked ───────────── */}
            {selectedRows.length > 0 ? (
              <div className="border-t border-navy-200 bg-[#fbfaf7] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-[13px]">
                    <b className="text-navy-800">
                      {selectedRows.length}{" "}
                      {selectedRows.length === 1 ? "transaction" : "transactions"}
                    </b>{" "}
                    selected — all <b className="text-navy-800">{lockedUnit?.name ?? "one unit"}</b>.
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="ml-2 rounded-lg border border-line px-2.5 py-1 text-[11.5px] font-semibold text-muted hover:text-navy-700"
                    >
                      Clear
                    </button>
                    {hiddenSelected > 0 ? (
                      <span className="mt-1 block text-[11.5px] text-gold-800">
                        {hiddenSelected} of them {hiddenSelected === 1 ? "is" : "are"} hidden by the
                        current search or filter, and {hiddenSelected === 1 ? "is" : "are"} still
                        included below.
                      </span>
                    ) : null}
                  </span>
                  <span className="font-serif text-xl tabular-nums text-ink">
                    {formatEGP2(totalPiastres / 100)}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="flex flex-col gap-1.5">
                    <span className={LABEL}>Value date at the bank</span>
                    <input type="date" name="valueDate" required defaultValue={today} className={INPUT} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={LABEL}>Bank reference</span>
                    <input type="text" name="bankReference" placeholder="NBE-88213" className={INPUT} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className={LABEL}>
                      Note <span className="font-normal text-muted">(optional)</span>
                    </span>
                    <input
                      type="text"
                      name="note"
                      placeholder="Anything they should know"
                      className={INPUT}
                    />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11.5px] text-muted">
                    {lockedUnit?.confirmerNames.length
                      ? `Goes to ${lockedUnit.confirmerNames.join(", ")} the moment you send it.`
                      : "Goes to that unit's confirmer the moment you send it."}
                  </span>
                  <button
                    type="submit"
                    className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-900"
                  >
                    Send for confirmation
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </form>
      )}
    </section>
  );
}

const KIND_CLASS: Record<PayableKind, string> = {
  BENEFIT_CLAIM: "border border-navy-100 bg-navy-50 text-navy-700",
  FLOAT_TOPUP: "border border-green-200 bg-green-50 text-green-700",
  PAYBACK: "border border-gold-200 bg-gold-100 text-gold-800",
  INCENTIVE_PAYOUT: "border border-line bg-paper text-muted",
};

const INPUT =
  "w-full rounded-lg border border-navy-200 bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";
const LABEL = "text-[11.5px] font-semibold text-navy-700";
