import { requireUser, isAdmin } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, getMedicalRate, amountForBand } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL } from "@/lib/labels";
import { BenefitsSelector } from "@/components/benefits/BenefitsSelector";
import { BenefitClaims, type ClaimableBenefit, type ClaimRow } from "@/components/benefits/BenefitClaims";
import { BenefitsTabs } from "@/components/benefits/BenefitsTabs";
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
    select: { employmentType: true, tenureBand: true, monthlySalary: true },
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

  let planYear, ceilingRow, guaranteed, catalog, medicalRate, existing;
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

    existing = planYear
      ? await prisma.benefitSelection.findUnique({
          where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
          include: { lines: { include: { catalogItem: true } } },
        })
      : null;
  } catch {
    // Most likely the benefits schema/seed (003 + 004) hasn't been applied yet.
    return (
      <div>
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Benefits</h1>
        <SetupNotice module="Benefits" files="003_seed_benefits.sql + 004_benefits_categories.sql" isAdmin={isAdmin(me.role)} />
      </div>
    );
  }

  const initialItems: Record<string, number> = {};
  for (const line of existing?.lines ?? []) {
    if (!line.catalogItem.isMedical) initialItems[line.catalogItem.key] = line.amount;
  }
  const initialMedical = {
    selected: (existing?.lines ?? []).some((l) => l.catalogItem.isMedical),
    spouse: existing?.medicalSpouse ?? false,
    childrenUnder18: existing?.medicalChildrenUnder18 ?? 0,
    children18Plus: existing?.medicalChildren18Plus ?? 0,
  };

  // Claimed-benefit locks: a basket item with an active claim (pending or reimbursed) can't be
  // deselected or reduced below what's already claimed once HR reopens the basket. Keyed by
  // catalog key → total active-claimed amount. Computed whenever a plan year exists (claims
  // only exist post-submission, so this is empty for first-time drafts).
  const claimedByKey: Record<string, number> = {};
  if (planYear) {
    const activeClaims = await prisma.benefitClaim.findMany({
      where: {
        userId: me.id,
        planYearId: planYear.id,
        status: { in: ["PENDING", "RELEASED"] },
        catalogItemId: { not: null },
      },
      select: { catalogItemId: true, amount: true },
    });
    const idToKey = new Map(catalog.map((c) => [c.id, c.key]));
    for (const c of activeClaims) {
      const key = c.catalogItemId ? idToKey.get(c.catalogItemId) : undefined;
      if (key) claimedByKey[key] = (claimedByKey[key] ?? 0) + c.amount;
    }
  }

  // Claims (Phase-2): once submitted, assemble the claimable + automatic benefits.
  const submitted = existing?.status === "SUBMITTED";
  const claimable: ClaimableBenefit[] = [];
  const automatic: string[] = [];
  if (submitted && planYear) {
    const claims = await prisma.benefitClaim.findMany({
      where: { userId: me.id, planYearId: planYear.id },
      orderBy: { createdAt: "desc" },
    });
    const byG = new Map<string, ClaimRow[]>();
    const byC = new Map<string, ClaimRow[]>();
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
      const map = c.guaranteedBenefitId ? byG : byC;
      const key = c.guaranteedBenefitId ?? c.catalogItemId ?? "";
      const arr = map.get(key) ?? [];
      arr.push(row);
      map.set(key, arr);
    }
    for (const g of guaranteed ?? []) {
      if (g.claimType === "NONE") automatic.push(g.name);
      else
        claimable.push({
          kind: "guaranteed",
          id: g.id,
          name: g.name,
          claimType: g.claimType,
          allocated: amountForBand(user.tenureBand!, g) ?? user.monthlySalary ?? null,
          claims: byG.get(g.id) ?? [],
        });
    }
    for (const line of existing?.lines ?? []) {
      // Medical is active cover / automatic — list it as no-action, not claimable.
      if (line.catalogItem.isMedical || line.catalogItem.claimType === "NONE") {
        automatic.push(line.catalogItem.name);
      } else
        claimable.push({
          kind: "catalog",
          id: line.catalogItem.id,
          name: line.catalogItem.name,
          claimType: line.catalogItem.claimType,
          allocated: line.amount,
          claims: byC.get(line.catalogItem.id) ?? [],
        });
    }
  }

  const guaranteedSection = (
    <section className="mt-6 overflow-hidden rounded-xl border border-line">
      <div className="bg-navy-800 px-6 py-4 text-white">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-300">You receive automatically</div>
        <h2 className="font-serif text-xl">Guaranteed benefits</h2>
      </div>
      {/* Cards side by side on one row; amount pinned to the bottom so all align (F4). */}
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
      {/* Sticky header — keeps "Your benefits" + type·tenure in view while scrolling (F3).
          id lets the tab bar measure this header's height and pin flush beneath it. */}
      <div id="benefits-header" className="sticky top-0 z-20 -mx-6 bg-paper/95 px-6 pb-3 pt-1 backdrop-blur md:-mx-10 md:px-10">
        {eyebrow}
        <h1 className="mt-1 font-serif text-3xl text-ink">Your benefits</h1>
        <p className="mt-1 text-muted">
          {EMPLOYMENT_TYPE_LABEL[user.employmentType]} · {TENURE_BAND_LABEL[user.tenureBand]}
        </p>
      </div>

      <div className="mt-2">
        <a href="/benefits/policy" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          How the benefits basket works →
        </a>
      </div>

      {/* Once submitted: tabs sit above everything (guaranteed benefits live inside the
          "Your benefits" tab). Draft/other states: guaranteed band, then the basket. */}
      {planYear && ceilingRow && medicalRate && catalog.length > 0 && submitted ? (
        <BenefitsTabs
          claimCount={claimable.reduce((n, b) => n + b.claims.filter((c) => c.status === "PENDING").length, 0)}
          benefitsPanel={
            <>
              {guaranteedSection}
              <BenefitsSelector
                employmentType={user.employmentType}
                ceiling={ceilingRow.amount}
                catalog={catalog.map((c) => ({ key: c.key, name: c.name, description: c.description, category: c.category, isMedical: c.isMedical }))}
                medicalRate={{ self: medicalRate.self, spouse: medicalRate.spouse, childUnder18: medicalRate.childUnder18, child18Plus: medicalRate.child18Plus }}
                initialItems={initialItems}
                initialMedical={initialMedical}
                initialStatus={existing?.status ?? "NONE"}
                lockedClaimed={claimedByKey}
              />
            </>
          }
          claimsPanel={<BenefitClaims claimable={claimable} automatic={automatic} error={claimError} />}
        />
      ) : (
        <>
          {guaranteedSection}
          <h2 className="mt-10 font-serif text-2xl text-ink">Your flexible basket</h2>
          {!planYear ? (
            <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
              Benefits selection isn&apos;t open right now. You can view your guaranteed benefits above.
            </div>
          ) : !ceilingRow || !medicalRate || catalog.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
              Benefits aren&apos;t fully configured yet. Please check back soon.
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">Select benefits, set amounts, then submit for {planYear.name}.</p>
              <BenefitsSelector
                employmentType={user.employmentType}
                ceiling={ceilingRow.amount}
                catalog={catalog.map((c) => ({ key: c.key, name: c.name, description: c.description, category: c.category, isMedical: c.isMedical }))}
                medicalRate={{ self: medicalRate.self, spouse: medicalRate.spouse, childUnder18: medicalRate.childUnder18, child18Plus: medicalRate.child18Plus }}
                initialItems={initialItems}
                initialMedical={initialMedical}
                initialStatus={existing?.status ?? "NONE"}
                lockedClaimed={claimedByKey}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
