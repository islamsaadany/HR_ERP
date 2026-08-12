import Link from "next/link";
import { requireIncentiveAccess } from "@/lib/roles";
import { INCENTIVE_RULES } from "@/lib/incentive/rules";
import { PrintButton } from "@/components/benefits/PrintButton";

export const dynamic = "force-dynamic";

/**
 * "How the Incentive Scheme works" — a plain-language reading of the whole
 * partner-compensation engine, for the people who operate it (Super User +
 * Finance). Unlike the employee benefits guide, this page DOES show the rule
 * figures, because they are the operating settings this audience configures.
 * Values are read from INCENTIVE_RULES so the page always matches the engine
 * (and, once the rules become DB-backed config, this is the single place to
 * re-point at the live config).
 */
const pct = (f: number) => `${+(f * 100).toFixed(2)}%`;

export default async function IncentiveHowItWorks() {
  await requireIncentiveAccess();
  const R = INCENTIVE_RULES;

  const H2 = "mt-8 font-serif text-xl text-ink";
  const card = "mt-3 rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed text-ink";
  const li = "mt-2 flex gap-2";
  const dot = <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-gold-400" aria-hidden="true" />;

  return (
    <div>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #print-area, #print-area * { visibility: visible !important; }
        #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="no-print flex items-center justify-between gap-3">
        <Link href="/incentive" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          ← Back to Incentive Scheme
        </Link>
        <PrintButton />
      </div>

      <div id="print-area">
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
          Incentive Scheme · How it works
        </p>
        <h1 className="mt-1 font-serif text-3xl text-ink">How partner compensation is calculated</h1>
        <p className="mt-2 max-w-2xl text-muted">
          A plain-language walk-through of the engine that turns each cycle&apos;s sheets into payouts.
          Everything is computed on the server from the numbers you upload; nothing here is entered by hand.
          The figures shown are the <strong>current operating settings</strong>.
        </p>

        {/* 1. The cycle + building blocks */}
        <h2 className={H2}>1. The cycle and the building blocks</h2>
        <div className={card}>
          <p>
            Compensation is worked out per <strong>cycle</strong> — a half-year ({R.cycleMonths} months).
            For every assignment (a client engagement) the engine starts from four numbers you provide:
            <strong> revenue</strong>, <strong>direct cost</strong>, any external <strong>vendor cost</strong>,
            and the team&apos;s <strong>contribution shares</strong>. From those it derives:
          </p>
          <div className={li}>{dot}<span><strong>Gross Profit</strong> = revenue − direct cost.</span></div>
          <div className={li}>{dot}<span><strong>Gross Margin</strong> = gross profit ÷ revenue.</span></div>
          <div className={li}>{dot}<span><strong>Net Revenue</strong> = revenue − the external vendor&apos;s pass-through cost (used for commission and profit-share).</span></div>
        </div>

        {/* 2. Part 1 — Business Partner Fee */}
        <h2 className={H2}>2. Part 1 — the Business Partner Fee</h2>
        <div className={card}>
          <p className="font-medium text-ink">The margin gate</p>
          <p className="mt-1">
            A client only generates a fee if its gross margin is at least <strong>{pct(R.marginGate)}</strong>.
            It&apos;s a yes/no gate — below {pct(R.marginGate)}, the whole Business Partner Fee for that
            assignment is zero (commission in Part 2 is unaffected).
          </p>

          <p className="mt-4 font-medium text-ink">The envelope</p>
          <p className="mt-1">
            When the gate is cleared, the fee pool — the <strong>envelope</strong> — is
            <strong> {pct(R.envelopeRate)} of gross profit</strong>. That envelope is then split between the
            Lead and the contributors.
          </p>

          <p className="mt-4 font-medium text-ink">Lead vs. contributors</p>
          <p className="mt-1">
            The <strong>Lead</strong> owns the assignment and earns the envelope <em>minus</em> what the
            contributors draw. Each contributor&apos;s draw depends on their contribution share, in tiers:
          </p>
          <div className={li}>{dot}<span>Share ≥ {pct(R.contributorTiers[0].min)} → contributor takes {pct(R.contributorTiers[0].deduction)} of the envelope.</span></div>
          <div className={li}>{dot}<span>{pct(R.contributorTiers[1].min)}–{pct(R.contributorTiers[0].min - 0.01)} → {pct(R.contributorTiers[1].deduction)}.</span></div>
          <div className={li}>{dot}<span>{pct(R.contributorTiers[2].min)}–{pct(R.contributorTiers[1].min - 0.01)} → {pct(R.contributorTiers[2].deduction)}.</span></div>
          <div className={li}>{dot}<span>Under {pct(R.contributorTiers[2].min)} → nothing.</span></div>
          <p className="mt-2">
            Contributor draws add up across the team but never exceed <strong>{pct(R.maxTotalDeduction)}</strong>,
            so the Lead always keeps at least {pct(1 - R.maxTotalDeduction)} of the envelope.
          </p>

          <p className="mt-4 font-medium text-ink">Contributor floor &amp; cap</p>
          <p className="mt-1">
            A contributor&apos;s payment is bounded by their own salary: nothing is paid if the allocation is
            below <strong>{pct(R.contributorFloorMonths)} of one month&apos;s net salary</strong> (too small to
            bother), and it is capped at <strong>half a month&apos;s net salary</strong>
            ({pct(R.contributorCapMonths)}). Anything an eligible contributor doesn&apos;t take stays with the firm.
          </p>

          <p className="mt-4 font-medium text-ink">Lead eligibility</p>
          <p className="mt-1">
            The Lead earns the fee only if they are <strong>eligible to lead</strong> this cycle (the
            utilisation gate). If not, the fee they would have earned is <strong>withheld</strong> (deferred),
            not paid out and not retained by the firm.
          </p>
        </div>

        {/* 3. Part 2 — Commission */}
        <h2 className={H2}>3. Part 2 — Commission</h2>
        <div className={card}>
          <p>
            Commission is <strong>separate and protected</strong> — it doesn&apos;t depend on the margin gate or
            on Part 1. The business developer who brought the work earns a percentage of <strong>net revenue</strong>:
          </p>
          <div className={li}>{dot}<span><strong>{pct(R.commissionSelfGenerated)}</strong> if they both sourced <em>and</em> closed it (self-generated).</span></div>
          <div className={li}>{dot}<span><strong>{pct(R.commissionReferred)}</strong> if the lead was referred to them (they closed it).</span></div>
          <p className="mt-2">
            For a <strong>project</strong>, commission is on the full net revenue. For a <strong>retainer</strong>,
            it&apos;s on the first <strong>{R.retainerCommissionMonths} months</strong> of the half-year, paid once.
          </p>
        </div>

        {/* 4. When it pays */}
        <h2 className={H2}>4. When an assignment pays</h2>
        <div className={card}>
          <p>
            Nothing triggers until an assignment is <strong>payable</strong> — a <strong>closed project</strong> or
            an <strong>active retainer</strong>. An in-progress or pending project is shown but pays nothing yet.
          </p>
        </div>

        {/* 5. Profit Share (proposed) */}
        <h2 className={H2}>5. Profit Share — proposed, not yet adopted</h2>
        <div className={card}>
          <p>
            Profit Share is computed and displayed so it can be reviewed, but it is <strong>excluded from
            released totals</strong>. Entitlement = (net margin ÷ {pct(R.profitShare.targetMargin)}) × one month&apos;s
            net salary — nothing below <strong>{pct(R.profitShare.floorMargin)}</strong> margin, and capped at
            <strong> {R.profitShare.ceilingMonths} month</strong> at {pct(R.profitShare.targetMargin)} margin and above.
          </p>
        </div>

        {/* 6. Data checks */}
        <h2 className={H2}>6. Data checks (flag &amp; block)</h2>
        <div className={card}>
          <div className={li}>{dot}<span>Each client&apos;s <strong>contribution shares must total 100%</strong> (±1 percentage point). If they don&apos;t, that assignment is <strong>blocked</strong> and excluded from payouts until corrected.</span></div>
          <div className={li}>{dot}<span>An external vendor&apos;s pass-through cost should carry at least a <strong>{pct(R.vendorMarkupMin)} markup</strong>.</span></div>
          <div className={li}>{dot}<span>All money is rounded to two decimals using <strong>banker&apos;s rounding</strong> (round-half-to-even) to avoid an upward bias across many payouts.</span></div>
        </div>

        {/* 7. The sheets */}
        <h2 className={H2}>7. What you upload each cycle</h2>
        <div className={card}>
          <div className={li}>{dot}<span><strong>People</strong> — name, role, net monthly salary, start date, eligible-to-lead, utilisation.</span></div>
          <div className={li}>{dot}<span><strong>Assignments</strong> — client, type (project/retainer), lead, business developer, lead source, revenue, direct cost, vendor cost, markup, dates.</span></div>
          <div className={li}>{dot}<span><strong>Contributions</strong> — a client × person matrix of shares (enter as % or a fraction).</span></div>
          <div className={li}>{dot}<span><strong>Firm P&amp;L</strong> — cycle revenue, delivery cost, total expenses (entered on the cycle page).</span></div>
          <p className="mt-3 text-muted">
            Download a blank template for each sheet on the cycle page, fill it, and upload it back.
          </p>
        </div>
      </div>
    </div>
  );
}
