import { requireUser, isAdmin } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, getMedicalRateBands, amountForBand, getMedicalCommitment, planYearWindow, poolCeilingFor, eligibilityWhere, isSalaryDriven, medicalScopeFor } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL } from "@/lib/labels";
import { flexCap } from "@/lib/benefits/rules";
import { classifyEligibility, prorate, poolCycleFraction, cycleWholeMonths } from "@/lib/benefits/proration";
import { annualPremiumForPerson, type Band } from "@/lib/benefits/rates";
import { deriveTenureBand } from "@/lib/tenure";
import {
  BenefitsBoard,
  type BoardClaim,
  type BoardGuaranteed,
  type BoardFlex,
  type BoardGroup,
  type BoardMedicalPerson,
  type BoardMedicalCommitted,
} from "@/components/benefits/BenefitsBoard";

/** Dependant shape used for medical pricing (spec 023). */
type MedDependant = { id: string; name: string | null; dateOfBirth: Date; kind: "CHILD" | "SPOUSE" };

/** Build the age-band priced people list for the board: the employee first, then each dependant. */
function buildMedicalPeople(
  dob: Date | null,
  dependants: MedDependant[],
  bands: Band[],
  refDate: Date
): BoardMedicalPerson[] {
  if (!dob || bands.length === 0) return [];
  const price = (d: Date): { age: number; bandLabel: string; premiumEGP: number } => {
    const { amount, ageAtCommit, overTop } = annualPremiumForPerson(d, refDate, bands);
    const band = bands.find((b) => ageAtCommit >= b.minAge && (b.maxAge == null || ageAtCommit <= b.maxAge))
      ?? bands[bands.length - 1];
    const bandLabel = `${band.minAge}–${band.maxAge ?? "+"}${overTop ? " (top)" : ""}`;
    return { age: ageAtCommit, bandLabel, premiumEGP: Math.trunc(amount) };
  };
  const self = price(dob);
  const employee: BoardMedicalPerson = { id: null, label: "You", kind: "SELF", ...self };
  const deps = dependants.map((d): BoardMedicalPerson => ({
    id: d.id,
    label: `${d.kind === "SPOUSE" ? "Spouse" : "Child"}${d.name ? ` · ${d.name}` : ""}`,
    kind: d.kind,
    ...price(d.dateOfBirth),
  }));
  return [employee, ...deps];
}

/** Map a committed medical row (with its snapshot) to the board's committed shape — employee first. */
function mapCommitted(
  commitment: { premium: number; coveredPeople: { dependantId: string | null; label: string; premiumEGP: number }[] } | null
): BoardMedicalCommitted {
  if (!commitment) return null;
  const self = commitment.coveredPeople.find((p) => !p.dependantId);
  const others = commitment.coveredPeople.filter((p) => p.dependantId);
  const people = [...(self ? [self] : []), ...others].map((p) => ({ label: p.label, premiumEGP: p.premiumEGP }));
  return { premium: commitment.premium, people };
}
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
      dateOfBirth: true,
      benefitsOrientationSeenAt: true,
      dependants: { select: { id: true, name: true, dateOfBirth: true, kind: true }, orderBy: { dateOfBirth: "asc" } },
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
    const [entryCeiling, medBands, medCommitment, medScope] = await Promise.all([
      poolCeilingFor(user.employmentType, null),
      getMedicalRateBands(),
      getMedicalCommitment(me.id, medPlanYear.id),
      medicalScopeFor(user.employmentType),
    ]);
    if (entryCeiling == null || medBands.length === 0) {
      return (
        <div>
          {medHeader}
          <SetupNotice module="Benefits" files="003_seed_benefits.sql + 034_medical_age_rate_card.sql" isAdmin={isAdmin(me.role)} />
        </div>
      );
    }
    const medPeople = buildMedicalPeople(user.dateOfBirth, user.dependants, medBands, new Date());
    return (
      <div>
        {medHeader}
        <BenefitsBoard
          medicalOnly
          ceiling={prorate(entryCeiling, medicalEligibility.fraction)}
          medicalOffered={medScope.offered}
          familyMedical={medScope.family}
          medicalPremiumFraction={medicalEligibility.fraction}
          medicalProration={medicalEligibility.status === "PRORATED" ? { months: medicalEligibility.remainingWholeMonths } : null}
          poolUsed={0}
          poolRemaining={0}
          cap={0}
          guaranteed={[]}
          automatic={[]}
          groups={[]}
          medicalPeople={medPeople}
          medicalMissingDob={!user.dateOfBirth}
          medicalCommitted={mapCommitted(medCommitment)}
          planYearOpen
          error={claimError}
          claimSuccess={claimOk === "1"}
        />
      </div>
    );
  }

  let planYear, ceilingRow, guaranteed, catalog, medicalBands, medicalCommitment;
  try {
    [planYear, ceilingRow, guaranteed, catalog, medicalBands] = await Promise.all([
      getActivePlanYear(),
      prisma.poolCeiling.findUnique({
        where: { employmentType_tenureBand: { employmentType: user.employmentType, tenureBand: user.tenureBand } },
      }),
      prisma.guaranteedBenefit.findMany({ where: eligibilityWhere(user.employmentType), orderBy: { order: "asc" } }),
      prisma.benefitCatalogItem.findMany({ where: { active: true, ...eligibilityWhere(user.employmentType) }, orderBy: { order: "asc" } }),
      getMedicalRateBands(),
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

  // Cycle-length proration (spec 019, revised): the flexible pool and Professional-development
  // budget scale to the LENGTH of the plan-year cycle (e.g. a 6-month cycle → 6/12), applied to
  // every eligible employee. A not-yet-6-month employee still gets nothing (fraction 0).
  const planWindow = planYearWindow(planYear);
  const poolEligibility = classifyEligibility(user.startDate, 6, planWindow);
  const poolFraction = poolCycleFraction(poolEligibility, planWindow);
  const cycleMonths = cycleWholeMonths(planWindow);
  const isProrated = poolFraction > 0 && poolFraction < 1;
  // Medical uses the 3-month threshold and stays mid-cycle-joiner proration (not cycle-length).
  const medicalEligibility = classifyEligibility(user.startDate, 3, planWindow);

  const orientation = {
    employeeName: user.name ?? "",
    employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[user.employmentType],
    tenureBandLabel: TENURE_BAND_LABEL[user.tenureBand],
    ceiling: ceilingRow ? prorate(ceilingRow.amount, poolFraction) : null,
    guaranteed: guaranteed.map((g) => ({
      name: g.name,
      amount: amountForBand(user.employmentType!, user.tenureBand!, g),
      salaryDriven: isSalaryDriven(g),
    })),
    categories: Array.from(new Set(catalog.map((c) => c.category).filter((c): c is string => !!c))),
    autoOpen: !!(planYear && ceilingRow && medicalBands.length > 0 && catalog.length > 0) && !user.benefitsOrientationSeenAt,
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
  if (!ceilingRow || medicalBands.length === 0 || catalog.length === 0) {
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
    if (c.status !== "REJECTED") claimsCoveredTotal += c.amount; // every non-rejected claim draws from the pool
    const map = c.guaranteedBenefitId ? byG : byC;
    const key = c.guaranteedBenefitId ?? c.catalogItemId ?? "";
    const arr = map.get(key) ?? [];
    arr.push(row);
    map.set(key, arr);
  }

  const proratedCeiling = prorate(ceilingRow.amount, poolFraction);
  const cap = flexCap(proratedCeiling);
  const medicalPremium = medicalCommitment?.premium ?? 0;
  const poolUsed = medicalPremium + claimsCoveredTotal;
  const poolRemaining = Math.max(0, proratedCeiling - poolUsed);

  // Guaranteed band (all guaranteed benefits for this employment type). Only benefits flagged
  // `prorated` (Professional development) shrink to the cycle length; the rest stay full.
  const guaranteedBoard: BoardGuaranteed[] = guaranteed.map((g) => {
    const fullAmount = amountForBand(user.employmentType!, user.tenureBand!, g) ?? user.monthlySalary ?? null;
    const allocated = g.prorated && fullAmount != null ? prorate(fullAmount, poolFraction) : fullAmount;
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

  // Medical eligibility (spec 021): computed from the eligible, active medical catalogue items.
  // Medical is rendered by the board's own single section, so it is excluded from the flex groups.
  const medItems = catalog.filter((c) => c.isMedical);
  const familyMedical = medItems.some((m) => m.medicalScope === "FAMILY");
  const personalMedical = medItems.some((m) => m.medicalScope === "PERSONAL" || m.medicalScope == null);
  const medicalOffered = familyMedical || personalMedical;

  // Flexible catalog grouped by category (preserving catalog order). Non-medical "automatic"
  // (NONE) items are surfaced as a note, not claimable.
  const automatic: string[] = [];
  const order: string[] = [];
  const groupMap = new Map<string, BoardFlex[]>();
  for (const item of catalog) {
    if (item.isMedical) continue; // medical has its own section
    if (item.claimType === "NONE") {
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
      isMedical: false,
      coverageRate: item.coverageRate,
      claimType: item.claimType,
      allocated: cap,
      claims: byC.get(item.id) ?? [],
    });
  }
  const groups: BoardGroup[] = order.map((cat) => ({ category: cat, items: groupMap.get(cat)! }));

  // Medical priced per person by age band (spec 023) — the employee + their dependants.
  const medPeople = buildMedicalPeople(user.dateOfBirth, user.dependants, medicalBands, new Date());

  return (
    <div>
      {header}
      <BenefitsBoard
        ceiling={proratedCeiling}
        poolUsed={poolUsed}
        poolRemaining={poolRemaining}
        cap={cap}
        proration={isProrated ? { months: cycleMonths } : null}
        medicalOffered={medicalOffered}
        familyMedical={familyMedical}
        medicalPremiumFraction={medicalEligibility.fraction}
        guaranteed={guaranteedBoard}
        automatic={automatic}
        groups={groups}
        medicalPeople={medPeople}
        medicalMissingDob={!user.dateOfBirth}
        medicalCommitted={mapCommitted(medicalCommitment)}
        planYearOpen={!!planYear}
        error={claimError}
        claimSuccess={claimOk === "1"}
      />
    </div>
  );
}
