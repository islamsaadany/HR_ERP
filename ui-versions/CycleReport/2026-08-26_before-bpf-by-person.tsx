"use client";

import { Fragment, useState } from "react";
import type { CycleReport } from "@/lib/incentive/compute";
import { HoverTip } from "./HoverTip";
import { Chevron, Section, scrollWrap, td, tdr, th } from "./ReportSection";
import { ReviewTables, type ReviewData } from "./ReviewTables";

export type { ReviewData };

const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const tdNote = "px-3 py-2 text-sm italic text-muted whitespace-normal";

/**
 * Cost-recovery Multiple → colour band. >3× best (deeper green), 2–3× good
 * (lime), 1–2× poor (amber), below 1× critical (red).
 */
const multipleBand = (mx: number) =>
  mx > 3
    ? "bg-green-200 text-green-800"
    : mx >= 2
    ? "bg-lime-100 text-lime-700"
    : mx >= 1
    ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-700";

/** Section ids drive the collapse state and Expand/Collapse-all. */
const SECTION_IDS = ["review", "bpf", "contrib", "commission", "byPerson", "firm", "profitShare", "costRecovery", "watch"] as const;
type SectionId = (typeof SECTION_IDS)[number];

/**
 * A small ⓘ term-tip (hover), rendered as a non-clipping floating layer. The
 * icon lives on the navy column headers, so it is styled light for contrast.
 */
function InfoTip({ text }: { text: React.ReactNode }) {
  return (
    <HoverTip text={text} className="ml-1 inline-flex align-middle">
      <span className="grid h-[15px] w-[15px] place-items-center rounded-full border border-white/50 text-[10px] font-bold leading-none text-white/90">
        i
      </span>
    </HoverTip>
  );
}

/** A 0 value with a hover reason (e.g. below the 70% gate). */
function ZeroCell({ note, value = "0.00" }: { note: string; value?: string }) {
  return (
    <HoverTip text={note} className="border-b border-dotted border-navy-200 font-semibold text-gold-600">
      {value}
    </HoverTip>
  );
}

export function CycleReportView({
  report,
  cycleId,
  review,
}: {
  report: CycleReport;
  cycleId: string;
  review: ReviewData;
}) {
  const r = report;

  // Clients whose shares don't total 100% (±1pp, the tolerance the engine blocks
  // on). Derived here because it decides whether the Review section auto-opens;
  // the section itself paints the flag.
  const totals = new Map<string, number>();
  for (const c of review.contributions) totals.set(c.client, (totals.get(c.client) ?? 0) + c.share);
  const flaggedClients = new Set(
    [...totals.entries()].filter(([, t]) => Math.abs(t - 1) > 0.01 + 1e-6).map(([client]) => client)
  );

  const hasIssues = r.blocked.length > 0 || r.issues.length > 0 || flaggedClients.size > 0;

  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => {
    const o = Object.fromEntries(SECTION_IDS.map((s) => [s, true])) as Record<SectionId, boolean>;
    o.review = hasIssues; // Review starts collapsed unless there's a data issue.
    return o;
  });
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const setAll = (v: boolean) => setOpen(Object.fromEntries(SECTION_IDS.map((s) => [s, v])) as Record<SectionId, boolean>);

  const [schemeOpen, setSchemeOpen] = useState(false);
  const [expandedComm, setExpandedComm] = useState<Record<string, boolean>>({});
  const toggleComm = (name: string) => setExpandedComm((e) => ({ ...e, [name]: !e[name] }));

  const firm = r.firm;
  const grossProfit = firm ? firm.revenue - firm.deliveryCost : 0;

  return (
    <div className="mt-6">
      {/* Data status */}
      {(r.blocked.length > 0 || r.issues.length > 0) && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="text-sm font-semibold text-amber-800">Data needs attention — these are excluded from the payout</div>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
            {r.blocked.map((b) => (
              <li key={b.client}>
                <span className="font-medium">{b.client}</span>: {b.reason}
              </li>
            ))}
            {r.issues.map((i, k) => (
              <li key={k}>{i}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setAll(true)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50">
          Expand all
        </button>
        <button type="button" onClick={() => setAll(false)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50">
          Collapse all
        </button>
      </div>

      {/* 1. Review & validation — read-only, or editable in place (Recalculate
          saves and every section below rebuilds from the stored rows). */}
      <ReviewTables
        cycleId={cycleId}
        review={review}
        flaggedClients={flaggedClients}
        open={open.review}
        onToggle={() => toggle("review")}
      />


      {/* 2. Business Partner Fee */}
      <Section
        title="Business Partner Fee"
        open={open.bpf}
        onToggle={() => toggle("bpf")}
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Client</th><th className={th}>Type</th>
                <th className={th + " text-right"}>GP</th><th className={th + " text-right"}>GP%</th>
                <th className={th + " text-right"}>
                  Envelope
                  <InfoTip text="Envelope = 3% of the client's Gross Profit, and only when the client clears the 70% gross-margin gate. It's the pot the assignment generates before the lead and contributors are paid." />
                </th>
                <th className={th + " text-right"}>Ded</th>
                <th className={th}>Lead</th><th className={th + " text-right"}>Lead fee</th>
                <th className={th + " text-right"}>Contributor</th><th className={th + " text-right"}>Firm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.assignments.map((a, i) => {
                const contrib = a.contributors.reduce((s, c) => s + c.payment, 0);
                const gateFailed = !a.marginGatePassed;
                const gateNote = `Below the 70% margin gate (${pct(a.grossMarginPct)}) — no envelope is generated, so the lead fee and every contributor allocation on this client are 0.`;
                return (
                  <tr key={a.client} className={i % 2 === 1 ? "ff-zebra" : undefined}>
                    <td className={td}>{a.client}</td>
                    <td className={td}>{a.type}</td>
                    <td className={tdr}>{m(a.grossProfit)}</td>
                    <td className={tdr}>{pct(a.grossMarginPct)}</td>
                    <td className={tdr}>{gateFailed ? <ZeroCell note={gateNote} /> : m(a.envelope)}</td>
                    <td className={tdr}>{a.totalDeduction ? pct(a.totalDeduction) : "—"}</td>
                    <td className={td}>{a.leadName}</td>
                    <td className={tdr}>{gateFailed ? <ZeroCell note="Envelope is 0 (client below the 70% gate), so there is no lead fee." /> : m(a.leadFee)}</td>
                    <td className={tdr}>
                      {contrib ? (
                        <HoverTip
                          className="border-b border-dotted border-navy-200"
                          text={
                            <span className="block min-w-[200px]">
                              <span className="mb-1.5 block font-semibold">Contributor breakdown — {a.client}</span>
                              {a.contributors.map((c) => (
                                <span key={c.name} className="flex justify-between gap-4 py-0.5">
                                  <span>
                                    {c.name} · {pct(c.share)}
                                    {c.tier ? ` · tier ${pct(c.tier)}` : ""}
                                  </span>
                                  <span className="font-semibold tabular-nums">
                                    {c.flooredToZero ? "0 (floored)" : m(c.payment)}
                                  </span>
                                </span>
                              ))}
                            </span>
                          }
                        >
                          {m(contrib)}
                        </HoverTip>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={tdr}>{a.firmRetained ? m(a.firmRetained) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="ff-total-row font-semibold">
                <td className={td} colSpan={7}>Total</td>
                <td className={tdr}>{m(r.totals.leadFees)}</td>
                <td className={tdr}>{m(r.totals.contributorPayments)}</td>
                <td className={tdr}>{m(r.totals.firmRetained)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. Contributor detail */}
      <Section
        title="Contributor detail"
        open={open.contrib}
        onToggle={() => toggle("contrib")}
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Client</th><th className={th}>Person</th>
                <th className={th + " text-right"}>Share</th>
                <th className={th + " text-right"}>
                  Tier
                  <InfoTip text="Tier = the deduction a contributor's share takes from the lead's fee. Allocation = envelope × tier. Paid = allocation after the 5%-of-month floor and ½-month cap." />
                </th>
                <th className={th + " text-right"}>Allocation</th><th className={th + " text-right"}>Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.assignments
                .filter((a) => a.contributors.length > 0)
                .flatMap((a, ai) =>
                  a.contributors.map((c) => {
                    const gateFailed = !a.marginGatePassed;
                    // Shade alternates each time the client changes, so each client's
                    // contributors read as one block (base rows stay white). ff-zebra
                    // repaints the sticky first column too.
                    const zebra = ai % 2 === 1;
                    return (
                      <tr key={a.client + c.name} className={zebra ? "ff-zebra" : undefined}>
                        <td className={td}>{a.client}</td>
                        <td className={td}>{c.name}</td>
                        <td className={tdr}>{pct(c.share)}</td>
                        <td className={tdr}>{c.tier ? pct(c.tier) : "—"}</td>
                        <td className={tdr}>
                          {gateFailed ? (
                            <ZeroCell note={`${a.client} is below the 70% margin gate (${pct(a.grossMarginPct)}), so its envelope is 0 — ${c.name}'s allocation is 0 regardless of the ${pct(c.share)} share.`} />
                          ) : (
                            m(c.allocation)
                          )}
                        </td>
                        <td className={tdr}>
                          {gateFailed ? (
                            <ZeroCell note="Allocation is 0 (client below the 70% gate), so nothing is paid." value="0.00" />
                          ) : c.flooredToZero ? (
                            <ZeroCell note="Below the 5%-of-month floor — paid as 0." value="0 (floored)" />
                          ) : (
                            m(c.payment)
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 4. Commission by person — sits directly above By person so the commission
          figures are read before the per-person totals that fold them in.
          Compact by default; click a name to reveal that person's per-deal breakdown. */}
      {r.commissionByPerson.length > 0 && (
        <Section title="Commission by person" subtitle="protected — independent of the gates · click a name for the per-deal breakdown" open={open.commission} onToggle={() => toggle("commission")}>
          <div className={scrollWrap + " max-w-md"}>
            <table className="ff-data-table min-w-full divide-y divide-line">
              <thead className="bg-navy-50/40">
                <tr><th className={th}>Person</th><th className={th + " text-right"}>Commission</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.commissionByPerson.map((c) => (
                  <Fragment key={c.name}>
                    <tr className="cursor-pointer hover:bg-navy-50/40" onClick={() => toggleComm(c.name)}>
                      <td className={td}>
                        {/* A real button so the breakdown is reachable by keyboard (audit F7);
                            the row keeps its click target for the mouse. */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleComm(c.name); }}
                          aria-expanded={!!expandedComm[c.name]}
                          className="inline-flex items-center gap-1.5 rounded text-left"
                        >
                          <Chevron open={!!expandedComm[c.name]} />
                          {c.name}
                        </button>
                      </td>
                      <td className={tdr}>{m(c.amount)}</td>
                    </tr>
                    {expandedComm[c.name] && (
                      <tr>
                        <td colSpan={2} className="bg-paper px-3 pb-3 pl-9">
                          {c.deals.map((d, i) => (
                            <div
                              key={i}
                              className="flex justify-between gap-4 border-t border-dashed border-line py-1 text-xs first:border-t-0"
                            >
                              <span className="text-muted">
                                {d.client} · {d.selfGenerated ? "Self-gen" : "Referred"} · {Math.round(d.rate * 100)}% · net {whole(d.base)}
                              </span>
                              <span className="font-semibold tabular-nums text-ink">{m(d.amount)}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                <tr className="ff-total-row font-semibold"><td className={td}>Total</td><td className={tdr}>{m(r.totals.commission)}</td></tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 5. Compensation by person */}
      <Section
        title="Compensation by person"
        subtitle="released compensation, plus commission folded into the grand total"
        open={open.byPerson}
        onToggle={() => toggle("byPerson")}
        action={
          <a
            href={`/api/incentive/${cycleId}/calculation`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-700"
          >
            ⬇ Download calculation (.xlsx)
          </a>
        }
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Person</th><th className={th + " text-right"}>Salary</th>
                <th className={th + " text-right"}>Lead fee</th><th className={th + " text-right"}>Contributor</th>
                <th className={th + " text-right"}>Total</th><th className={th + " text-right"}>Months</th>
                <th className={th + " text-right"}>Commission</th><th className={th + " text-right"}>Grand total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.byPerson.map((p, i) => (
                <tr key={p.name} className={i % 2 === 1 ? "ff-zebra" : undefined}>
                  <td className={td}>{p.name}</td>
                  <td className={tdr}>{m(p.salary)}</td>
                  <td className={tdr}>{p.leadFee ? m(p.leadFee) : "—"}</td>
                  <td className={tdr}>{p.contributor ? m(p.contributor) : "—"}</td>
                  <td className={tdr}>{m(p.total)}</td>
                  <td className={tdr}>{p.months || "—"}</td>
                  <td className={tdr}>{p.commission ? m(p.commission) : "—"}</td>
                  <td className={tdr + " font-semibold"}>{m(p.total + p.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 5. Firm P&L — Item | Value | % | Notes; scheme cost expands in place.
          The Notes column states each % as a plain-language equation. */}
      {firm && (
        <Section
          title="Firm P&L"
          subtitle="whole-EGP values · each % explained in Notes · click Scheme cost to break it down"
          open={open.firm}
          onToggle={() => toggle("firm")}
        >
          <div className={scrollWrap + " max-w-3xl"}>
            <table className="ff-data-table min-w-full divide-y divide-line" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "35%" }} />
              </colgroup>
              <thead className="bg-navy-50/40">
                <tr><th className={th}>Item</th><th className={th + " text-right"}>Value</th><th className={th + " text-right"}>%</th><th className={th}>Notes</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr><td className={td}>Revenue</td><td className={tdr}>{whole(firm.revenue)}</td><td className={tdr}>—</td><td className={tdNote}>—</td></tr>
                <tr>
                  <td className={td}>Direct cost</td><td className={tdr}>{whole(firm.deliveryCost)}</td>
                  <td className={tdr}>{pct(firm.deliveryCost / firm.revenue)}</td>
                  <td className={tdNote}>Direct cost ÷ Revenue</td>
                </tr>
                <tr>
                  <td className={td}>Gross profit</td><td className={tdr}>{whole(grossProfit)}</td>
                  <td className={tdr}>{pct(grossProfit / firm.revenue)}</td>
                  <td className={tdNote}>Gross profit ÷ Revenue</td>
                </tr>
                <tr>
                  <td className={td}>Total expenses</td><td className={tdr}>{whole(firm.totalExpenses)}</td>
                  <td className={tdr}>{pct(firm.totalExpenses / firm.revenue)}</td>
                  <td className={tdNote}>Total expenses ÷ Revenue</td>
                </tr>
                <tr className="ff-total-row font-semibold">
                  <td className={td}>Profit before scheme</td><td className={tdr}>{whole(firm.profitBeforeScheme)}</td>
                  <td className={tdr}>{pct(firm.profitBeforeSchemePct)}</td>
                  <td className={tdNote + " font-normal"}>Profit before scheme ÷ Revenue</td>
                </tr>
                <tr className="cursor-pointer hover:bg-navy-50/40" onClick={() => setSchemeOpen((s) => !s)}>
                  <td className={td}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSchemeOpen((v) => !v); }}
                      aria-expanded={schemeOpen}
                      className="inline-flex items-center gap-1.5 rounded text-left"
                    >
                      <Chevron open={schemeOpen} /> Scheme cost
                    </button>
                  </td>
                  <td className={tdr}>{whole(firm.schemeCost)}</td>
                  <td className={tdr}>{`${pct(firm.schemePctOfGrossProfit)} of GP`}</td>
                  <td className={tdNote}>Scheme cost ÷ Gross profit</td>
                </tr>
                {schemeOpen && (
                  <>
                    <tr><td className={td + " pl-9 text-muted"}>Business Partner (lead) fees</td><td className={tdr + " text-muted"}>{whole(r.totals.leadFees)}</td><td className={tdr}></td><td className={tdNote}></td></tr>
                    <tr><td className={td + " pl-9 text-muted"}>Contributor payments</td><td className={tdr + " text-muted"}>{whole(r.totals.contributorPayments)}</td><td className={tdr}></td><td className={tdNote}></td></tr>
                    <tr><td className={td + " pl-9 text-muted"}>Commission</td><td className={tdr + " text-muted"}>{whole(r.totals.commission)}</td><td className={tdr}></td><td className={tdNote}></td></tr>
                  </>
                )}
                <tr className="ff-total-row font-semibold">
                  <td className={td}>Profit after scheme</td><td className={tdr}>{whole(firm.profitAfterScheme)}</td>
                  <td className={tdr}>{pct(firm.profitAfterSchemePct)}</td>
                  <td className={tdNote + " font-normal"}>Profit after scheme ÷ Revenue</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 7. Profit Share */}
      <Section title="Profit Share" subtitle="proposed, not adopted — excluded from released totals" open={open.profitShare} onToggle={() => toggle("profitShare")}>
        {r.profitShare.netMarginPct == null ? (
          <p className="text-sm text-muted">Enter firm P&L to compute the net margin.</p>
        ) : !r.profitShare.gateMet ? (
          <p className="text-sm text-muted">Net margin {pct(r.profitShare.netMarginPct)} is below the 15% gate — Profit Share is nil.</p>
        ) : (
          <div className={scrollWrap}>
            <table className="ff-data-table min-w-full divide-y divide-line">
              <thead className="bg-navy-50/40"><tr><th className={th}>Person</th><th className={th + " text-right"}>Entitlement</th><th className={th + " text-right"}>Offset</th><th className={th + " text-right"}>Net</th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.profitShare.rows.map((p) => (
                  <tr key={p.name}><td className={td}>{p.name}</td><td className={tdr}>{m(p.entitlement)}</td><td className={tdr}>{m(p.offset)}</td><td className={tdr}>{m(p.net)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 8. Cost recovery */}
      <Section
        title="Cost recovery"
        open={open.costRecovery}
        onToggle={() => toggle("costRecovery")}
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Person</th><th className={th + " text-right"}>6-mo salary</th>
                <th className={th + " text-right"}>GP generated</th>
                <th className={th + " text-right"}>
                  Multiple
                  <InfoTip text="Multiple = Gross Profit a person generated (weighted by their contribution share) ÷ their six-month net salary. Benchmark: above 3× best, 2–3× good, 1–2× poor, below 1× critical (didn't cover their own salary)." />
                </th>
                <th className={th + " text-right"}>Surplus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.costRecovery.map((c, i) => (
                <tr key={c.name} className={i % 2 === 1 ? "ff-zebra" : undefined}>
                  <td className={td}>{c.name}</td>
                  <td className={tdr}>{m(c.sixMonthSalary)}</td>
                  <td className={tdr}>{m(c.gpGenerated)}</td>
                  <td className={tdr}>
                    <span className={"inline-block rounded px-2 py-0.5 font-semibold tabular-nums " + multipleBand(c.multiple)}>
                      {c.multiple}×
                    </span>
                  </td>
                  <td className={tdr}>{m(c.surplus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 9. Watch list — general/clients first, then per person */}
      {r.watchList.length > 0 && (
        <Section title="Watch list" subtitle="general items first, then per person" open={open.watch} onToggle={() => toggle("watch")}>
          <WatchList items={r.watchList} />
        </Section>
      )}
    </div>
  );
}

function WatchList({ items }: { items: { person: string | null; text: string }[] }) {
  const general = items.filter((w) => w.person === null);
  const people: string[] = [];
  for (const w of items) if (w.person && !people.includes(w.person)) people.push(w.person);

  const Group = ({ label, notes }: { label: string; notes: string[] }) => (
    <div className="mt-3 first:mt-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-gold-600">{label}</div>
      <ul className="mt-1 list-disc pl-5 text-sm text-ink">
        {notes.map((n, k) => <li key={k}>{n}</li>)}
      </ul>
    </div>
  );

  return (
    <div>
      {general.length > 0 && <Group label="General / clients" notes={general.map((w) => w.text)} />}
      {people.map((name) => (
        <Group key={name} label={name} notes={items.filter((w) => w.person === name).map((w) => w.text)} />
      ))}
    </div>
  );
}
