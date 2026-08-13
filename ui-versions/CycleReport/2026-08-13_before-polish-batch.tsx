"use client";

import { useState } from "react";
import type { CycleReport } from "@/lib/incentive/compute";
import { HoverTip } from "./HoverTip";

const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** Raw uploaded sheets, for the Review & validation section. */
export type ReviewData = {
  people: { name: string; role: string | null; netMonthlySalary: number; startDate: string | null; utilization: number | null }[];
  assignments: {
    client: string;
    type: string;
    lead: string;
    bd: string;
    leadSource: string | null;
    revenue: number | null;
    directCost: number | null;
    vendorCost: number;
    markupPct: number;
    startDate: string | null;
    closeDate: string | null;
    status: string;
  }[];
  contributions: { client: string; person: string; share: number }[];
};

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
const td = "px-3 py-2 text-sm text-ink whitespace-nowrap";
const tdr = td + " text-right tabular-nums";

/**
 * Assignment status → display label, sort order, and pill colour. "closed"
 * reads as "Ended"; rows in the review table sort Ongoing → Ended → In
 * progress → Pending. Colour tracks payability (green active, slate done,
 * amber in-flight, grey awaiting).
 */
const STATUS_META: Record<string, { label: string; order: number; cls: string }> = {
  ongoing: { label: "Ongoing", order: 1, cls: "bg-green-100 text-green-700" },
  closed: { label: "Ended", order: 2, cls: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In progress", order: 3, cls: "bg-amber-100 text-amber-700" },
  pending: { label: "Pending", order: 4, cls: "bg-gray-100 text-gray-500" },
};
const statusMeta = (s: string) => STATUS_META[s] ?? { label: s, order: 99, cls: "bg-gray-100 text-gray-500" };

function StatusPill({ status }: { status: string }) {
  const meta = statusMeta(status);
  return <span className={"inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold " + meta.cls}>{meta.label}</span>;
}

/** Section ids drive the collapse state and Expand/Collapse-all. */
const SECTION_IDS = ["review", "bpf", "contrib", "commission", "byPerson", "firm", "profitShare", "costRecovery", "watch"] as const;
type SectionId = (typeof SECTION_IDS)[number];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={"h-3.5 w-3.5 shrink-0 text-muted transition-transform " + (open ? "rotate-90" : "")}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function Section({
  title,
  subtitle,
  titleExtra,
  action,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  titleExtra?: React.ReactNode;
  action?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={open}>
          <Chevron open={open} />
          <span className="font-serif text-lg text-ink">{title}</span>
          {titleExtra}
          {subtitle ? <span className="truncate text-xs text-muted">{subtitle}</span> : null}
        </button>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  );
}

/** A small ⓘ term-tip (hover), rendered as a non-clipping floating layer. */
function InfoTip({ text }: { text: string }) {
  return (
    <HoverTip text={text} className="ml-1 inline-flex align-middle">
      <span className="grid h-[15px] w-[15px] place-items-center rounded-full border border-navy-200 text-[10px] font-bold leading-none text-navy-500">
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

/** A percentage with a hover note showing its calculation. */
function PctCell({ value, calc }: { value: string; calc: string }) {
  return (
    <HoverTip text={calc} className="border-b border-dotted border-navy-200">
      {value}
    </HoverTip>
  );
}

const scrollWrap = "ff-hscroll rounded-lg border border-line";

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

  // Contribution matrix (client × person) + per-client totals for the review view.
  const contribPersons = new Set(review.contributions.map((c) => c.person));
  const persons = [
    ...review.people.map((p) => p.name).filter((n) => contribPersons.has(n)),
    ...[...contribPersons].filter((n) => !review.people.some((p) => p.name === n)),
  ];
  const clients: string[] = [];
  const seenClient = new Set<string>();
  for (const c of review.contributions) if (!seenClient.has(c.client)) { seenClient.add(c.client); clients.push(c.client); }
  const shareAt = new Map<string, number>();
  for (const c of review.contributions) shareAt.set(`${c.client}||${c.person}`, c.share);
  const clientTotal = (client: string) => review.contributions.filter((c) => c.client === client).reduce((s, c) => s + c.share, 0);
  const isOff = (total: number) => Math.abs(total - 1) > 0.01 + 1e-6;
  const flaggedClients = new Set(clients.filter((c) => isOff(clientTotal(c))));

  const hasIssues = r.blocked.length > 0 || r.issues.length > 0 || flaggedClients.size > 0;

  const [open, setOpen] = useState<Record<SectionId, boolean>>(() => {
    const o = Object.fromEntries(SECTION_IDS.map((s) => [s, true])) as Record<SectionId, boolean>;
    o.review = hasIssues; // Review starts collapsed unless there's a data issue.
    return o;
  });
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const setAll = (v: boolean) => setOpen(Object.fromEntries(SECTION_IDS.map((s) => [s, v])) as Record<SectionId, boolean>);

  const [schemeOpen, setSchemeOpen] = useState(false);

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

      {/* 1. Review & validation */}
      <Section
        title="Review & validation"
        subtitle="the three uploaded sheets, as read"
        open={open.review}
        onToggle={() => toggle("review")}
        titleExtra={
          flaggedClients.size > 0 ? (
            <span className="ml-2 rounded-full border border-red-400 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
              ⚠ {flaggedClients.size} data issue{flaggedClients.size > 1 ? "s" : ""}
            </span>
          ) : null
        }
      >
        <p className="mb-2 text-xs text-muted">People</p>
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr><th className={th}>Name</th><th className={th}>Role</th><th className={th + " text-right"}>Net monthly salary</th><th className={th}>Start date</th><th className={th + " text-right"}>Utilization</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {review.people.map((p) => (
                <tr key={p.name}>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{p.role ?? "—"}</td>
                  <td className={tdr}>{whole(p.netMonthlySalary)}</td>
                  <td className={td}>{p.startDate ?? "—"}</td>
                  <td className={tdr}>{p.utilization == null ? "—" : pct(p.utilization)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mb-2 mt-4 text-xs text-muted">Assignments</p>
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Client</th>
                <th className={th}>Type</th>
                <th className={th}>Lead</th>
                <th className={th}>BD</th>
                <th className={th}>Lead source</th>
                <th className={th + " text-right"}>Revenue</th>
                <th className={th + " text-right"}>Direct cost</th>
                <th className={th + " text-right"}>Vendor cost</th>
                <th className={th + " text-right"}>Markup %</th>
                <th className={th}>Start date</th>
                <th className={th}>Closure date</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {review.assignments
                .slice()
                .sort((a, b) => statusMeta(a.status).order - statusMeta(b.status).order)
                .map((a) => (
                  <tr key={a.client}>
                    <td className={td}>{a.client}</td>
                    <td className={td}>{a.type}</td>
                    <td className={td}>{a.lead}</td>
                    <td className={td}>{a.bd}</td>
                    <td className={td}>{a.leadSource ?? "—"}</td>
                    <td className={tdr}>{a.revenue == null ? "—" : whole(a.revenue)}</td>
                    <td className={tdr}>{a.directCost == null ? "—" : whole(a.directCost)}</td>
                    <td className={tdr}>{a.vendorCost ? whole(a.vendorCost) : "—"}</td>
                    <td className={tdr}>{a.markupPct ? `${a.markupPct}%` : "—"}</td>
                    <td className={td}>{a.startDate ?? "—"}</td>
                    <td className={td}>{a.closeDate ?? "—"}</td>
                    <td className={td}><StatusPill status={a.status} /></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <p className="mb-2 mt-4 text-xs text-muted">
          Contributions (client × person) — the <span className="font-semibold text-ink">Total</span> column flags any client that isn&rsquo;t 100%
        </p>
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Client</th>
                {persons.map((p) => <th key={p} className={th + " text-right"}>{p}</th>)}
                <th className={th + " text-right"}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clients.map((c) => {
                const total = clientTotal(c);
                const off = isOff(total);
                return (
                  <tr key={c} className={off ? "bg-amber-50" : undefined}>
                    <td className={td}>
                      {c}
                      {off ? (
                        <HoverTip text={`Contributions total ${pct(total)} — must be 100%. This assignment is excluded from the payout until the shares are corrected.`} className="ml-1 font-bold text-red-600">
                          ⚠
                        </HoverTip>
                      ) : null}
                    </td>
                    {persons.map((p) => {
                      const s = shareAt.get(`${c}||${p}`);
                      return <td key={p} className={tdr}>{s == null ? "—" : pct(s)}</td>;
                    })}
                    <td className={tdr + (off ? " bg-red-50 font-bold text-red-600" : "")}>
                      {pct(total)}
                      {off ? (
                        <HoverTip text="Must total 100%. This assignment is excluded from the payout until the shares are corrected." className="ml-1 font-bold text-red-600">
                          ⚠
                        </HoverTip>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 2. Business Partner Fee */}
      <Section
        title="Business Partner Fee"
        open={open.bpf}
        onToggle={() => toggle("bpf")}
        titleExtra={<InfoTip text="Envelope = 3% of the client's Gross Profit, and only when the client clears the 70% gross-margin gate. It's the pot the assignment generates before the lead and contributors are paid." />}
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Client</th><th className={th}>Type</th>
                <th className={th + " text-right"}>GP</th><th className={th + " text-right"}>GP%</th>
                <th className={th + " text-right"}>Envelope</th><th className={th + " text-right"}>Ded</th>
                <th className={th}>Lead</th><th className={th + " text-right"}>Lead fee</th>
                <th className={th + " text-right"}>Contributor</th><th className={th + " text-right"}>Firm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.assignments.map((a) => {
                const contrib = a.contributors.reduce((s, c) => s + c.payment, 0);
                const gateFailed = !a.marginGatePassed;
                const gateNote = `Below the 70% margin gate (${pct(a.grossMarginPct)}) — no envelope is generated, so the lead fee and every contributor allocation on this client are 0.`;
                return (
                  <tr key={a.client}>
                    <td className={td}>{a.client}</td>
                    <td className={td}>{a.type}</td>
                    <td className={tdr}>{m(a.grossProfit)}</td>
                    <td className={tdr}>{pct(a.grossMarginPct)}</td>
                    <td className={tdr}>{gateFailed ? <ZeroCell note={gateNote} /> : m(a.envelope)}</td>
                    <td className={tdr}>{a.totalDeduction ? pct(a.totalDeduction) : "—"}</td>
                    <td className={td}>{a.leadName}</td>
                    <td className={tdr}>{gateFailed ? <ZeroCell note="Envelope is 0 (client below the 70% gate), so there is no lead fee." /> : m(a.leadFee)}</td>
                    <td className={tdr}>{contrib ? m(contrib) : "—"}</td>
                    <td className={tdr}>{a.firmRetained ? m(a.firmRetained) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="bg-navy-50/40 font-semibold">
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
        titleExtra={<InfoTip text="Tier = the deduction a contributor's share takes from the lead's fee. Allocation = envelope × tier. Paid = allocation after the 5%-of-month floor and ½-month cap." />}
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Client</th><th className={th}>Person</th>
                <th className={th + " text-right"}>Share</th><th className={th + " text-right"}>Tier</th>
                <th className={th + " text-right"}>Allocation</th><th className={th + " text-right"}>Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.assignments.flatMap((a) =>
                a.contributors.map((c) => {
                  const gateFailed = !a.marginGatePassed;
                  return (
                    <tr key={a.client + c.name}>
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
          figures are read before the per-person totals that fold them in. */}
      {r.commissionByPerson.length > 0 && (
        <Section title="Commission by person" subtitle="protected — independent of the gates" open={open.commission} onToggle={() => toggle("commission")}>
          <div className={scrollWrap}>
            <table className="ff-data-table min-w-full divide-y divide-line">
              <tbody className="divide-y divide-line">
                {r.commissionByPerson.map((c) => (
                  <tr key={c.name}><td className={td}>{c.name}</td><td className={tdr}>{m(c.amount)}</td></tr>
                ))}
                <tr className="bg-navy-50/40 font-semibold"><td className={td}>Total</td><td className={tdr}>{m(r.totals.commission)}</td></tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* 5. By person */}
      <Section
        title="By person"
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
              {r.byPerson.map((p) => (
                <tr key={p.name}>
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

      {/* 5. Firm P&L — Item | Value | %, scheme cost expands in place */}
      {firm && (
        <Section
          title="Firm P&L"
          subtitle="whole-EGP values · hover a % for its calculation · click Scheme cost to break it down"
          open={open.firm}
          onToggle={() => toggle("firm")}
        >
          <div className={scrollWrap}>
            <table className="ff-data-table min-w-full divide-y divide-line" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "56%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead className="bg-navy-50/40">
                <tr><th className={th}>Item</th><th className={th + " text-right"}>Value</th><th className={th + " text-right"}>%</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr><td className={td}>Revenue</td><td className={tdr}>{whole(firm.revenue)}</td><td className={tdr}>—</td></tr>
                <tr>
                  <td className={td}>Direct cost</td><td className={tdr}>{whole(firm.deliveryCost)}</td>
                  <td className={tdr}><PctCell value={pct(firm.deliveryCost / firm.revenue)} calc={`${whole(firm.deliveryCost)} ÷ ${whole(firm.revenue)} (of revenue)`} /></td>
                </tr>
                <tr>
                  <td className={td}>Gross profit</td><td className={tdr}>{whole(grossProfit)}</td>
                  <td className={tdr}><PctCell value={pct(grossProfit / firm.revenue)} calc={`${whole(grossProfit)} ÷ ${whole(firm.revenue)} (of revenue)`} /></td>
                </tr>
                <tr>
                  <td className={td}>Total expenses</td><td className={tdr}>{whole(firm.totalExpenses)}</td>
                  <td className={tdr}><PctCell value={pct(firm.totalExpenses / firm.revenue)} calc={`${whole(firm.totalExpenses)} ÷ ${whole(firm.revenue)} (of revenue)`} /></td>
                </tr>
                <tr className="bg-navy-50/40 font-semibold">
                  <td className={td}>Profit before scheme</td><td className={tdr}>{whole(firm.profitBeforeScheme)}</td>
                  <td className={tdr}><PctCell value={pct(firm.profitBeforeSchemePct)} calc={`${whole(firm.profitBeforeScheme)} ÷ ${whole(firm.revenue)} (of revenue)`} /></td>
                </tr>
                <tr className="cursor-pointer hover:bg-navy-50/40" onClick={() => setSchemeOpen((s) => !s)}>
                  <td className={td}><span className="inline-flex items-center gap-1.5"><Chevron open={schemeOpen} /> Scheme cost</span></td>
                  <td className={tdr}>{whole(firm.schemeCost)}</td>
                  <td className={tdr}><PctCell value={`${pct(firm.schemePctOfGrossProfit)} of GP`} calc={`${whole(firm.schemeCost)} ÷ ${whole(grossProfit)} (of gross profit)`} /></td>
                </tr>
                {schemeOpen && (
                  <>
                    <tr><td className={td + " pl-9 text-muted"}>Business Partner (lead) fees</td><td className={tdr + " text-muted"}>{whole(r.totals.leadFees)}</td><td className={tdr}></td></tr>
                    <tr><td className={td + " pl-9 text-muted"}>Contributor payments</td><td className={tdr + " text-muted"}>{whole(r.totals.contributorPayments)}</td><td className={tdr}></td></tr>
                    <tr><td className={td + " pl-9 text-muted"}>Commission</td><td className={tdr + " text-muted"}>{whole(r.totals.commission)}</td><td className={tdr}></td></tr>
                  </>
                )}
                <tr className="bg-navy-50/40 font-semibold">
                  <td className={td}>Profit after scheme</td><td className={tdr}>{whole(firm.profitAfterScheme)}</td>
                  <td className={tdr}><PctCell value={pct(firm.profitAfterSchemePct)} calc={`${whole(firm.profitAfterScheme)} ÷ ${whole(firm.revenue)} (of revenue)`} /></td>
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
        titleExtra={<InfoTip text="Multiple = Gross Profit a person generated (weighted by their contribution share) ÷ their six-month salary. Above 1× means they covered their cost." />}
      >
        <div className={scrollWrap}>
          <table className="ff-data-table min-w-full divide-y divide-line">
            <thead className="bg-navy-50/40">
              <tr>
                <th className={th}>Person</th><th className={th + " text-right"}>6-mo salary</th>
                <th className={th + " text-right"}>GP generated</th><th className={th + " text-right"}>Multiple</th><th className={th + " text-right"}>Surplus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {r.costRecovery.map((c) => (
                <tr key={c.name}>
                  <td className={td}>{c.name}</td>
                  <td className={tdr}>{m(c.sixMonthSalary)}</td>
                  <td className={tdr}>{m(c.gpGenerated)}</td>
                  <td className={tdr}>{c.multiple}x</td>
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
