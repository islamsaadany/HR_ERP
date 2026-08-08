import { requireUser, isAdmin } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, getMedicalRate, amountForBand, getMedicalCommitment } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL } from "@/lib/labels";
import { flexCap } from "@/lib/benefits/rules";
import { BenefitClaims, type ClaimableBenefit, type ClaimRow } from "@/components/benefits/BenefitClaims";
import { MedicalCommitmentCard } from "@/components/benefits/MedicalCommitmentCard";
import { BenefitsOrientation } from "@/components/benefits/BenefitsOrientation";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";
const egp = (n: number | null) => (n == null ? "Available" : "EGP " + n.toLocaleString());

export default async function BenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ claimError?: string; claimOk?: string }>;
}) {
  const me = await requireUser();
  await requireModuleEnabled("benefits");
  const { claimError } = await searchParams;
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      name: true,
      employmentType: true,
      tenureBand: true,
      monthlySalary: true,
      benefitsOrientationSeenAt: true,
    },
  });

  const eyebrow = (
    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Benefits</p>
  );

  if (!user?.employmentType || !user?.tenureBand) {
    return (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Benefits</h1>
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Your employment type or tenure isn&apos;t set yet. Contact HR to enable your benefits.
        </div>
      </div>
    );
  }

  let planYear, ceilingRow, guaranteed, catalog, medicalRate, medicalCommitment;
  try {
    [planYear, ceilingRow, guaranteed, catalog, medicalRate] = await Promise.all([
      getActivePlanYear(),
      prisma.poolCeiling.findUnique({
        where: { employmentType_tenureBand: { employmentType: user.employmentType, tenureBand: user.tenureBand } },
      }),
      prisma.guaranteedBenefit.findMany({ where: { employmentType: user.employmentType }, orderBy: { order: "asc" } }),
      prisma.benefitCatalogItem.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
      getMedicalRate(),
    ]);
    medicalCommitment = planYear ? await getMedicalCommitment(me.id, planYear.id) : null;
  } catch {
    // Most likely the benefits schema/seed hasn't been applied yet.
    return (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Benefits</h1>
        <SetupNotice module="Benefits" files="003_seed_benefits.sql + 025_claim_based_allowance.sql" isAdmin={isAdmin(me.role)} />
      </div>
    );
  }

  // Claims for this plan year, grouped by benefit; sum covered (pending + released) for the pool.
  const byC = new Map<string, ClaimRow[]>();
  const byG = new Map<string, ClaimRow[]>();
  let claimsCoveredTotal = 0;
  if (planYear) {
    const claims = await prisma.benefitClaim.findMany({
      where: { userId: me.id, planYearId: planYear.id },
      orderBy: { createdAt: "desc" },
    });
    for (const c of claims) {
      const row: ClaimRow = {
        amount: c.amount,
        status: c.status,
        note: c.note,
        proofName: c.proofName,
        proofUrl: c.proofUrl,
        decisionNote: c.decisionNote,
        createdAt: c.createdAt,
      };
      if (c.status === "PENDING" || c.status === "RELEASED") claimsCoveredTotal += c.amount;
      const map = c.guaranteedBenefitId ? byG : byC;
      const key = c.guaranteedBenefitId ?? c.catalogItemId ?? "";
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
  }

  const cap = ceilingRow ? flexCap(ceilingRow.amount) : 0;
  const medicalPremium = medicalCommitment?.premium ?? 0;
  const poolRemaining = ceilingRow ? Math.max(0, ceilingRow.amount - medicalPremium - claimsCoveredTotal) : 0;
  const poolUsedTotal = medicalPremium + claimsCoveredTotal;

  // Claimable + automatic benefits.
  const claimable: ClaimableBenefit[] = [];
  const automatic: string[] = [];
  for (const g of guaranteed ?? []) {
    if (g.claimType === "NONE") {
      automatic.push(g.name);
    } else {
      claimable.push({
        kind: "guaranteed",
        id: g.id,
        name: g.name,
        claimType: g.claimType,
        coverageRate: null,
        allocated: amountForBand(user.tenureBand!, g) ?? user.monthlySalary ?? null,
        claims: byG.get(g.id) ?? [],
      });
    }
  }
  for (const item of catalog ?? []) {
    if (item.isMedical) continue; // medical is committed via the card, never claimed
    if (item.claimType === "NONE") {
      automatic.push(item.name);
    } else {
      claimable.push({
        kind: "catalog",
        id: item.id,
        name: item.name,
        claimType: item.claimType,
        coverageRate: item.coverageRate,
        allocated: cap,
        claims: byC.get(item.id) ?? [],
      });
    }
  }

  // Orientation tour (spec 017/018): personalized, auto-opens first-run until seen.
  const configured = !!(planYear && ceilingRow && medicalRate && catalog.length > 0);
  const orientation = {
    employeeName: user.name ?? "",
    employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[user.employmentType],
    tenureBandLabel: TENURE_BAND_LABEL[user.tenureBand],
    ceiling: ceilingRow?.amount ?? null,
    guaranteed: guaranteed.map((g) => {
      const salaryDriven =
        g.band6mo2y == null && g.band2to4y == null && g.band4to7y == null && g.band7to10y == null;
      return { name: g.name, amount: amountForBand(user.tenureBand!, g), salaryDriven };
    }),
    categories: Array.from(new Set(catalog.map((c) => c.category).filter((c): c is string => !!c))),
    autoOpen: configured && !user.benefitsOrientationSeenAt,
  };

  const guaranteedSection = (
    <section className="mt-6 overflow-hidden rounded-xl border border-line">
      <div className="bg-navy-800 px-6 py-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-300">You receive automatically</div>
        <h2 className="font-serif text-xl">Guaranteed benefits</h2>
      </div>
      <div className="grid gap-px bg-line" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {guaranteed.map((g) => (
          <div key={g.id} className="flex flex-col bg-surface p-4">
            <div className="text-sm font-medium text-ink">{g.name}</div>
            <div className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-muted">{g.note ?? ""}</div>
            <div className="mt-auto pt-2 font-serif text-lg text-navy-800">
              {egp(amountForBand(user.tenureBand!, g) ?? user.monthlySalary ?? null)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div>
      <div id="benefits-header" className="sticky top-0 z-20 -mx-6 bg-paper/95 px-6 pb-3 pt-1 backdrop-blur md:-mx-10 md:px-10">
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Your benefits</h1>
        <p className="mt-1 text-muted">
          {EMPLOYMENT_TYPE_LABEL[user.employmentType]} · {TENURE_BAND_LABEL[user.tenureBand]}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <a href="/benefits/policy" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          How the benefits pool works →
        </a>
        <BenefitsOrientation {...orientation} />
      </div>

      {!planYear ? (
        <>
          {guaranteedSection}
          <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            Benefits selection isn&apos;t open right now. You can view your guaranteed benefits above.
          </div>
        </>
      ) : !configured || !ceilingRow ? (
        <>
          {guaranteedSection}
          <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            Benefits aren&apos;t fully configured yet. Please check back soon.
          </div>
        </>
      ) : (
        <>
          {/* Pool summary */}
          <section className="mt-6 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-3xl font-serif text-ink tabular-nums">{egp(poolRemaining)}</div>
                <div className="text-sm text-muted">left of your {egp(ceilingRow.amount)} annual pool (company share)</div>
              </div>
              <div className="text-sm text-muted">
                Used {egp(poolUsedTotal)} · per-benefit cap {egp(cap)}
              </div>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-navy-50">
              <div
                className="h-full rounded-full bg-gold-500"
                style={{ width: `${Math.min(100, ceilingRow.amount > 0 ? (poolUsedTotal / ceilingRow.amount) * 100 : 0)}%` }}
              />
            </div>
          </section>

          {/* Medical — the one commitment */}
          {medicalRate ? (
            <MedicalCommitmentCard
              committed={
                medicalCommitment
                  ? {
                      spouse: medicalCommitment.spouse,
                      childrenUnder18: medicalCommitment.childrenUnder18,
                      children18Plus: medicalCommitment.children18Plus,
                      premium: medicalCommitment.premium,
                    }
                  : null
              }
              rate={{
                self: medicalRate.self,
                spouse: medicalRate.spouse,
                childUnder18: medicalRate.childUnder18,
                child18Plus: medicalRate.child18Plus,
              }}
              ceiling={ceilingRow.amount}
              open={!!planYear}
            />
          ) : null}

          {guaranteedSection}

          <BenefitClaims claimable={claimable} automatic={automatic} error={claimError} />
        </>
      )}
    </div>
  );
}
