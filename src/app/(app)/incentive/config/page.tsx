import Link from "next/link";
import { requireSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getIncentiveConfig } from "@/lib/incentive/config";
import { IncentiveConfigTables } from "@/components/incentive/IncentiveConfigTables";
import { resetIncentiveConfig } from "./actions";

export const dynamic = "force-dynamic";

export default async function IncentiveConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; reset?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { saved, reset, error } = await searchParams;

  const cfg = await getIncentiveConfig();
  let customised = false;
  try {
    customised = (await prisma.incentiveConfig.findUnique({ where: { id: "singleton" }, select: { id: true } })) != null;
  } catch {
    customised = false;
  }

  const t = cfg.contributorTiers;
  // Flat name → stored fraction map the tables render from.
  const values: Record<string, number> = {
    envelopeRate: cfg.envelopeRate,
    marginGate: cfg.marginGate,
    tier1Min: t[0].min, tier1Deduction: t[0].deduction,
    tier2Min: t[1].min, tier2Deduction: t[1].deduction,
    tier3Min: t[2].min, tier3Deduction: t[2].deduction,
    maxTotalDeduction: cfg.maxTotalDeduction,
    contributorCapMonths: cfg.contributorCapMonths,
    contributorFloorMonths: cfg.contributorFloorMonths,
    commissionReferred: cfg.commissionReferred,
    commissionSelfGenerated: cfg.commissionSelfGenerated,
    retainerCommissionMonths: cfg.retainerCommissionMonths,
    cycleMonths: cfg.cycleMonths,
    vendorMarkupMin: cfg.vendorMarkupMin,
    profitTargetMargin: cfg.profitShare.targetMargin,
    profitFloorMargin: cfg.profitShare.floorMargin,
    profitCeilingMonths: cfg.profitShare.ceilingMonths,
    profitLeadFeeOffsetShare: cfg.profitShare.leadFeeOffsetShare,
    pricingFloorMultiple: cfg.pricingFloorMultiple,
  };

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
        The money knobs behind every payout, shown as simple tables. Click <strong>Edit</strong> to change values —
        shares/rates are <strong>percentages</strong>, months and the pricing floor are plain numbers. Each value has an
        <strong> ⓘ</strong> that explains it.
      </p>

      {saved ? <p className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm font-medium text-green-700">✓ Configuration saved. It now drives all cycle calculations.</p> : null}
      {reset ? <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-navy-700">Restored the built-in defaults.</p> : null}
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6">
        <IncentiveConfigTables values={values} customised={customised} />
      </div>

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
