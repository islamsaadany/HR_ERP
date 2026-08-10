import { requireUser, isAdmin } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, getMedicalRate, amountForBand, getMedicalCommitment, planYearWindow, poolCeilingFor } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL } from "@/lib/labels";
import { flexCap } from "@/lib/benefits/rules";
import { classifyEligibility, prorate } from "@/lib/benefits/proration";
import { deriveTenureBand } from "@/lib/tenure";
import {
  BenefitsBoard,
  type BoardClaim,
  type BoardGuaranteed,
  type BoardFlex,
  type BoardGroup,
} from "@/components/benefits/BenefitsBoard";
import { BenefitsOrientation } from "@/components/benefits/BenefitsOrientation";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

export default async function BenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ claimError?: string; claimOk?: string }>;
}) {
  const me = await requireUser();
  await requireModuleEnabled("benefits");
  const { claimError, claimOk } = await searchParams;
  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      name: true,
      employmentType: true,
      tenureBand: true,
      monthlySalary: true,
      startDate: true,
      benefitsOrientationSeenAt: true,
    },
  });
  // Tenure band is derived from the hire date so the whole page (ceiling, band
  // amounts, labels) always reflects the current band, not a stale stored value.
  const user = dbUser
    ? { ...dbUser, tenureBand: deriveTenureBand(dbUser.startDate).band }
    : null;

  const eyebrow = (
    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Benefits</p>
  );

  if (!user?.employmentType) {
    return (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Benefits</h1>
        <div className="mt-6 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          Your employment type isn&apos;t set yet. Contact HR to enable your benefits.
        </div>
      </div>
    );
  }

  // Sub-6-month employees have no tenure band yet, but medical unlocks at 3 months (spec 019).
  // Show them a medical-only view; the flexible basket + guaranteed benefits unlock at 6 months.
  if (!user.tenureBand) {
    const medPlanYear = await getActivePlanYear();
    const medicalEligibility = classifyEligibility(user.startDate, 3, planYearWindow(medPlanYear));
    const medHeader = (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Your benefits</h1>
        <p className="mt-1 text-muted">{EMPLOYMENT_TYPE_LABEL[user.employmentType]} · Under 6 months</p>
      </div>
    );
    if (!medPlanYear) {
      return (
        <div>
          {medHeader}
          <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            Benefits selection isn&apos;t open right now. Check back when a plan year is open.
          </div>
        </div>
      );
    }
    if (medicalEligibility.status === "NOT_YET") {
      return (
        <div>
          {medHeader}
          <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            Your benefits open with your length of service: medical insurance after 3 months, and the flexible
            basket &amp; guaranteed benefits after 6 months. Contact HR if your start date looks wrong.
          </div>
        </div>
      );
    }
    const [entryCeiling, medRate, medCommitment] = await Promise.all([
      poolCeilingFor(user.employmentType, null),
      getMedicalRate(),
      getMedicalCommitment(me.id, medPlanYear.id),
    ]);
    if (entryCeiling == null || !medRate) {
      return (
        <div>
          {medHeader}
          <SetupNotice module="Benefits" files="003_seed_benefits.sql + 025_claim_based_allowance.sql" isAdmin={isAdmin(me.role)} />
        </div>
      );
    }
    return (
      <div>
        {medHeader}
        <BenefitsBoard
          medicalOnly
          ceiling={prorate(entryCeiling, medicalEligibility.fraction)}
          medicalPremiumFraction={medicalEligibility.fraction}
          medicalProration={medicalEligibility.status === "PRORATED" ? { months: medicalEligibility.remainingWholeMonths } : null}
          poolUsed={0}
          poolRemaining={0}
          cap={0}
          guaranteed={[]}
          automatic={[]}
          groups={[]}
          medicalRate={{ self: medRate.self, spouse: medRate.spouse, childUnder18: medRate.childUnder18, child18Plus: medRate.child18Plus }}
          medicalCommitted={
            medCommitment
              ? {
                  spouse: medCommitment.spouse,
                  childrenUnder18: medCommitment.childrenUnder18,
                  children18Plus: medCommitment.children18Plus,
                  premium: medCommitment.premium,
                }
              : null
          }
          planYearOpen
          error={claimError}
          claimSuccess={claimOk === "1"}
        />
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
    return (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Benefits</h1>
        <SetupNotice module="Benefits" files="003_seed_benefits.sql + 025_claim_based_allowance.sql" isAdmin={isAdmin(me.role)} />
      </div>
    );
  }

  // Mid-year starter proration (spec 019): the flexible pool and Professional-development
  // budget scale to the whole months left in the plan year from the 6-month eligibility date.
  const poolEligibility = classifyEligibility(user.startDate, 6, planYearWindow(planYear));
  const isProrated = poolEligibility.status === "PRORATED";
  // Medical uses the 3-month threshold, so its proration fraction can differ from the pool's.
  const medicalEligibility = classifyEligibility(user.startDate, 3, planYearWindow(planYear));

  const orientation = {
    employeeName: user.name ?? "",
    employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[user.employmentType],
    tenureBandLabel: TENURE_BAND_LABEL[user.tenureBand],
    ceiling: ceilingRow ? prorate(ceilingRow.amount, poolEligibility.fraction) : null,
    guaranteed: guaranteed.map((g) => {
      const salaryDriven =
        g.band6mo2y == null && g.band2to4y == null && g.band4to7y == null && g.band7to10y == null;
      return { name: g.name, amount: amountForBand(user.tenureBand!, g), salaryDriven };
    }),
    categories: Array.from(new Set(catalog.map((c) => c.category).filter((c): c is string => !!c))),
    autoOpen: !!(planYear && ceilingRow && medicalRate && catalog.length > 0) && !user.benefitsOrientationSeenAt,
  };

  const header = (
    <div>
      <div id="benefits-header" className="sticky top-0 z-20 -mx-6 bg-paper/95 px-6 pb-3 pt-1 backdrop-blur md:-mx-10 md:px-10">
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Your benefits</h1>
        <p className="mt-1 text-muted">
          {EMPLOYMENT_TYPE_LABEL[user.employmentType]} · {TENURE_BAND_LABEL[user.tenureBand]}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <BenefitsOrientation {...orientation} />
        <a href="/benefits/policy" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          Read the full guide →
        </a>
      </div>
    </div>
  );

  if (!planYear) {
    return (
      <div>
        {header}
        <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Benefits selection isn&apos;t open right now. Check back when a plan year is open.
        </div>
      </div>
    );
  }
  if (!ceilingRow || !medicalRate || catalog.length === 0) {
    return (
      <div>
        {header}
        <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Benefits aren&apos;t fully configured yet. Please check back soon.
        </div>
      </div>
    );
  }

  // Claims for this plan year, grouped by benefit; sum covered (pending + released) for the pool.
  const byC = new Map<string, BoardClaim[]>();
  const byG = new Map<string, BoardClaim[]>();
  let claimsCoveredTotal = 0;
  const claims = await prisma.benefitClaim.findMany({
    where: { userId: me.id, planYearId: planYear.id },
    orderBy: { createdAt: "desc" },
  });
  for (const c of claims) {
    const row: BoardClaim = {
      amount: c.amount,
      status: c.status,
      note: c.note,
      proofName: c.proofName,
      // Proof lives in a private store; link to the authorized serving route.
      proofUrl: c.proofUrl ? `/api/claims/${c.id}/proof` : null,
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

  const proratedCeiling = prorate(ceilingRow.amount, poolEligibility.fraction);
  const cap = flexCap(proratedCeiling);
  const medicalPremium = medicalCommitment?.premium ?? 0;
  const poolUsed = medicalPremium + claimsCoveredTotal;
  const poolRemaining = Math.max(0, proratedCeiling - poolUsed);

  // Guaranteed band (all guaranteed benefits for this employment type). Only benefits flagged
  // `prorated` (Professional development) shrink for mid-year starters; the rest stay full.
  const guaranteedBoard: BoardGuaranteed[] = guaranteed.map((g) => {
    const fullAmount = amountForBand(user.tenureBand!, g) ?? user.monthlySalary ?? null;
    const allocated = g.prorated && fullAmount != null ? prorate(fullAmount, poolEligibility.fraction) : fullAmount;
    return {
      id: g.id,
      name: g.name,
      note: g.note,
      claimType: g.claimType,
      allocated,
      proratedFrom: g.prorated && isProrated && fullAmount != null && allocated !== fullAmount ? fullAmount : null,
      claims: byG.get(g.id) ?? [],
    };
  });

  // Flexible catalog grouped by category (preserving catalog order). Medical is included (rendered as
  // its commitment row); non-medical "automatic" (NONE) items are surfaced as a note, not claimable.
  const automatic: string[] = [];
  const order: string[] = [];
  const groupMap = new Map<string, BoardFlex[]>();
  for (const item of catalog) {
    if (!item.isMedical && item.claimType === "NONE") {
      automatic.push(item.name);
      continue;
    }
    const cat = item.category ?? "Other";
    if (!groupMap.has(cat)) {
      groupMap.set(cat, []);
      order.push(cat);
    }
    groupMap.get(cat)!.push({
      id: item.id,
      key: item.key,
      name: item.name,
      description: item.description,
      isMedical: item.isMedical,
      coverageRate: item.coverageRate,
      claimType: item.claimType,
      allocated: item.isMedical ? null : cap,
      claims: byC.get(item.id) ?? [],
    });
  }
  const groups: BoardGroup[] = order.map((cat) => ({ category: cat, items: groupMap.get(cat)! }));

  return (
    <div>
      {header}
      <BenefitsBoard
        ceiling={proratedCeiling}
        poolUsed={poolUsed}
        poolRemaining={poolRemaining}
        cap={cap}
        proration={isProrated ? { months: poolEligibility.remainingWholeMonths } : null}
        medicalPremiumFraction={medicalEligibility.fraction}
        guaranteed={guaranteedBoard}
        automatic={automatic}
        groups={groups}
        medicalRate={{
          self: medicalRate.self,
          spouse: medicalRate.spouse,
          childUnder18: medicalRate.childUnder18,
          child18Plus: medicalRate.child18Plus,
        }}
        medicalCommitted={
          medicalCommitment
            ? {
                spouse: medicalCommitment.spouse,
                childrenUnder18: medicalCommitment.childrenUnder18,
                children18Plus: medicalCommitment.children18Plus,
                premium: medicalCommitment.premium,
              }
            : null
        }
        planYearOpen={!!planYear}
        error={claimError}
        claimSuccess={claimOk === "1"}
      />
    </div>
  );
}
