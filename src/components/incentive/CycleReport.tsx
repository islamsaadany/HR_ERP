import type { CycleReport } from "@/lib/incentive/compute";

const m = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-xl text-ink">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">{children}</div>
    </section>
  );
}

const th = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted";
const td = "px-3 py-2 text-sm text-ink whitespace-nowrap";
const tdr = td + " text-right tabular-nums";

export function CycleReportView({ report }: { report: CycleReport }) {
  const r = report;

  return (
    <div>
      {/* Data status */}
      {(r.blocked.length > 0 || r.issues.length > 0) && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
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

      {/* Business Partner Fee */}
      <Section title="Business Partner Fee" subtitle="Payable assignments · envelope = 3% of Gross Profit, gated at 70% margin.">
        <table className="min-w-full divide-y divide-line">
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
              return (
                <tr key={a.client}>
                  <td className={td}>{a.client}</td>
                  <td className={td}>{a.type}</td>
                  <td className={tdr}>{m(a.grossProfit)}</td>
                  <td className={tdr}>{pct(a.grossMarginPct)}</td>
                  <td className={tdr}>{m(a.envelope)}</td>
                  <td className={tdr}>{a.totalDeduction ? pct(a.totalDeduction) : "—"}</td>
                  <td className={td}>{a.leadName}{a.leadEligible ? "" : " ⚠"}</td>
                  <td className={tdr}>{m(a.leadFee)}</td>
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
      </Section>

      {/* Contributor detail */}
      <Section title="Contributor detail">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-navy-50/40">
            <tr>
              <th className={th}>Client</th><th className={th}>Person</th>
              <th className={th + " text-right"}>Share</th><th className={th + " text-right"}>Tier</th>
              <th className={th + " text-right"}>Allocation</th><th className={th + " text-right"}>Paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.assignments.flatMap((a) =>
              a.contributors.map((c) => (
                <tr key={a.client + c.name}>
                  <td className={td}>{a.client}</td>
                  <td className={td}>{c.name}</td>
                  <td className={tdr}>{pct(c.share)}</td>
                  <td className={tdr}>{c.tier ? pct(c.tier) : "—"}</td>
                  <td className={tdr}>{m(c.allocation)}</td>
                  <td className={tdr}>{c.flooredToZero ? "0 (floored)" : m(c.payment)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Section>

      {/* Fee by person */}
      <Section title="By person" subtitle="Released compensation (excludes commission, which is protected).">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-navy-50/40">
            <tr>
              <th className={th}>Person</th><th className={th + " text-right"}>Salary</th>
              <th className={th + " text-right"}>Lead fee</th><th className={th + " text-right"}>Contributor</th>
              <th className={th + " text-right"}>Total</th><th className={th + " text-right"}>Months</th>
              <th className={th + " text-right"}>Commission</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Firm P&L */}
      {r.firm && (
        <Section title="Firm P&L" subtitle="Profit before and after the scheme.">
          <table className="min-w-full divide-y divide-line">
            <tbody className="divide-y divide-line">
              <tr><td className={td}>Revenue</td><td className={tdr}>{m(r.firm.revenue)}</td></tr>
              <tr><td className={td}>Delivery cost</td><td className={tdr}>{m(r.firm.deliveryCost)}</td></tr>
              <tr><td className={td}>Total expenses</td><td className={tdr}>{m(r.firm.totalExpenses)}</td></tr>
              <tr className="font-semibold"><td className={td}>Profit before scheme</td><td className={tdr}>{m(r.firm.profitBeforeScheme)} · {pct(r.firm.profitBeforeSchemePct)}</td></tr>
              <tr><td className={td}>Scheme cost</td><td className={tdr}>{m(r.firm.schemeCost)}</td></tr>
              <tr className="font-semibold bg-navy-50/40"><td className={td}>Profit after scheme</td><td className={tdr}>{m(r.firm.profitAfterScheme)} · {pct(r.firm.profitAfterSchemePct)}</td></tr>
              <tr><td className={td}>Scheme cost as % of Gross Profit</td><td className={tdr}>{pct(r.firm.schemePctOfGrossProfit)}</td></tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Commission */}
      {r.commissionByPerson.length > 0 && (
        <Section title="Commission by person" subtitle="Protected — independent of the gates.">
          <table className="min-w-full divide-y divide-line">
            <tbody className="divide-y divide-line">
              {r.commissionByPerson.map((c) => (
                <tr key={c.name}><td className={td}>{c.name}</td><td className={tdr}>{m(c.amount)}</td></tr>
              ))}
              <tr className="font-semibold bg-navy-50/40"><td className={td}>Total</td><td className={tdr}>{m(r.totals.commission)}</td></tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* Profit Share (proposed) */}
      <Section title="Profit Share" subtitle="Proposed, not adopted — shown for reference; excluded from released totals.">
        <div className="px-4 py-3 text-sm">
          {r.profitShare.netMarginPct == null ? (
            <p className="text-muted">Enter firm P&L to compute the net margin.</p>
          ) : !r.profitShare.gateMet ? (
            <p className="text-muted">Net margin {pct(r.profitShare.netMarginPct)} is below the 15% gate — Profit Share is nil.</p>
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead><tr><th className={th}>Person</th><th className={th + " text-right"}>Entitlement</th><th className={th + " text-right"}>Offset</th><th className={th + " text-right"}>Net</th></tr></thead>
              <tbody className="divide-y divide-line">
                {r.profitShare.rows.map((p) => (
                  <tr key={p.name}><td className={td}>{p.name}</td><td className={tdr}>{m(p.entitlement)}</td><td className={tdr}>{m(p.offset)}</td><td className={tdr}>{m(p.net)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {/* Cost recovery */}
      <Section title="Cost recovery" subtitle="GP generated (contribution-weighted) vs six-month salary. Per-hour metrics need an hours column.">
        <table className="min-w-full divide-y divide-line">
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
      </Section>

      {/* Watch list */}
      {r.watchList.length > 0 && (
        <Section title="Watch list">
          <ul className="list-disc space-y-1 px-8 py-4 text-sm text-ink">
            {r.watchList.map((w, k) => <li key={k}>{w}</li>)}
          </ul>
        </Section>
      )}
    </div>
  );
}
