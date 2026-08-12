import Link from "next/link";
import { requireSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getIncentiveConfig } from "@/lib/incentive/config";
import { saveIncentiveConfig, resetIncentiveConfig } from "./actions";

export const dynamic = "force-dynamic";

type Field = { name: string; label: string; hint: string; step: string; value: number };

export default async function IncentiveConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; reset?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { saved, reset, error } = await searchParams;

  const cfg = await getIncentiveConfig();
  // Is a custom row saved, or are we on the built-in defaults?
  let customised = false;
  try {
    customised = (await prisma.incentiveConfig.findUnique({ where: { id: "singleton" }, select: { id: true } })) != null;
  } catch {
    customised = false;
  }

  const t = cfg.contributorTiers;
  const sections: { title: string; note?: string; fields: Field[] }[] = [
    {
      title: "Envelope & margin gate",
      fields: [
        { name: "envelopeRate", label: "Envelope rate", hint: "share of gross profit · 0.03 = 3%", step: "0.001", value: cfg.envelopeRate },
        { name: "marginGate", label: "Margin gate", hint: "min gross margin to pay a fee · 0.7 = 70%", step: "0.01", value: cfg.marginGate },
      ],
    },
    {
      title: "Contributor tiers",
      note: "Share threshold → deduction from the Lead's fee. A share below Tier 3's threshold earns nothing.",
      fields: [
        { name: "tier1Min", label: "Tier 1 — min share", hint: "0.7 = 70%", step: "0.01", value: t[0].min },
        { name: "tier1Deduction", label: "Tier 1 — deduction", hint: "0.6 = 60%", step: "0.01", value: t[0].deduction },
        { name: "tier2Min", label: "Tier 2 — min share", hint: "0.5 = 50%", step: "0.01", value: t[1].min },
        { name: "tier2Deduction", label: "Tier 2 — deduction", hint: "0.3 = 30%", step: "0.01", value: t[1].deduction },
        { name: "tier3Min", label: "Tier 3 — min share", hint: "0.2 = 20%", step: "0.01", value: t[2].min },
        { name: "tier3Deduction", label: "Tier 3 — deduction", hint: "0.1 = 10%", step: "0.01", value: t[2].deduction },
      ],
    },
    {
      title: "Contributor limits",
      fields: [
        { name: "maxTotalDeduction", label: "Max total deduction", hint: "Lead keeps ≥ the rest · 0.6 = 60%", step: "0.01", value: cfg.maxTotalDeduction },
        { name: "contributorCapMonths", label: "Payment cap", hint: "months of net salary · 0.5 = half a month", step: "0.05", value: cfg.contributorCapMonths },
        { name: "contributorFloorMonths", label: "Payment floor", hint: "below this, pay nothing · 0.05 = 5% of a month", step: "0.01", value: cfg.contributorFloorMonths },
      ],
    },
    {
      title: "Commission",
      fields: [
        { name: "commissionReferred", label: "Referred rate", hint: "on net revenue · 0.03 = 3%", step: "0.005", value: cfg.commissionReferred },
        { name: "commissionSelfGenerated", label: "Self-generated rate", hint: "sourced & closed · 0.05 = 5%", step: "0.005", value: cfg.commissionSelfGenerated },
        { name: "retainerCommissionMonths", label: "Retainer months", hint: "months of a retainer commissioned, once", step: "1", value: cfg.retainerCommissionMonths },
        { name: "cycleMonths", label: "Cycle length (months)", hint: "a cycle is a half-year = 6", step: "1", value: cfg.cycleMonths },
      ],
    },
    {
      title: "Profit share (proposed)",
      note: "Computed and shown, but excluded from released totals.",
      fields: [
        { name: "profitTargetMargin", label: "Target margin", hint: "one month at this margin · 0.3 = 30%", step: "0.01", value: cfg.profitShare.targetMargin },
        { name: "profitFloorMargin", label: "Floor margin", hint: "nothing below this · 0.15 = 15%", step: "0.01", value: cfg.profitShare.floorMargin },
        { name: "profitCeilingMonths", label: "Ceiling (months)", hint: "cap on entitlement · 1 = one month", step: "0.5", value: cfg.profitShare.ceilingMonths },
        { name: "profitLeadFeeOffsetShare", label: "Lead-fee offset share", hint: "share of the fee that offsets · 0.5 = half", step: "0.05", value: cfg.profitShare.leadFeeOffsetShare },
      ],
    },
    {
      title: "Other",
      fields: [
        { name: "vendorMarkupMin", label: "Vendor markup min", hint: "0.1 = 10%", step: "0.01", value: cfg.vendorMarkupMin },
        { name: "pricingFloorMultiple", label: "Pricing floor multiple", hint: "bill ≥ this × cost/hour · 3.33", step: "0.01", value: cfg.pricingFloorMultiple },
      ],
    },
  ];

  const L = "block text-[11px] uppercase tracking-wide text-muted mb-1";
  const I = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm tabular-nums focus:border-navy-500 focus:outline-none";

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href="/incentive" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          ← Back to Incentive Scheme
        </Link>
        <Link href="/incentive/how-it-works" className="text-sm text-muted hover:text-ink">
          How it works ↗
        </Link>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Incentive · Configuration</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Rule configuration</h1>
      <p className="mt-2 max-w-2xl text-muted">
        The money knobs behind every payout. Values are fractions — <strong>0.03 = 3%</strong>. Saving
        applies to <strong>every cycle&rsquo;s figures immediately</strong>. Currently using{" "}
        <strong className="text-ink">{customised ? "custom saved values" : "the built-in defaults"}</strong>.
      </p>

      {saved ? <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">✓ Configuration saved. It now drives all cycle calculations.</p> : null}
      {reset ? <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-navy-700">Restored the built-in defaults.</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

      <form action={saveIncentiveConfig} className="mt-6 space-y-6">
        {sections.map((s) => (
          <section key={s.title} className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-serif text-lg text-ink">{s.title}</h2>
            {s.note ? <p className="mt-1 text-xs text-muted">{s.note}</p> : null}
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {s.fields.map((f) => (
                <div key={f.name}>
                  <label className={L} htmlFor={f.name}>{f.label}</label>
                  <input id={f.name} name={f.name} type="number" step={f.step} defaultValue={f.value} className={I} />
                  <p className="mt-1 text-[11px] text-muted">{f.hint}</p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-lg bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
            Save configuration
          </button>
          <span className="text-xs text-muted">Applies to all cycle calculations immediately.</span>
        </div>
      </form>

      {customised ? (
        <form action={resetIncentiveConfig} className="mt-4">
          <button type="submit" className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50">
            Restore built-in defaults
          </button>
        </form>
      ) : null}
    </div>
  );
}
