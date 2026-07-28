import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getActivePlanYear, getMedicalRate, amountForBand } from "@/lib/benefits/config";
import { EMPLOYMENT_TYPE_LABEL, TENURE_BAND_LABEL } from "@/lib/labels";
import { BenefitsSelector } from "@/components/benefits/BenefitsSelector";

export const dynamic = "force-dynamic";
const egp = (n: number | null) => (n == null ? "Available" : "EGP " + n.toLocaleString());

export default async function BenefitsPage() {
  const me = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { employmentType: true, tenureBand: true },
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

  const [planYear, ceilingRow, guaranteed, catalog, medicalRate] = await Promise.all([
    getActivePlanYear(),
    prisma.poolCeiling.findUnique({
      where: { employmentType_tenureBand: { employmentType: user.employmentType, tenureBand: user.tenureBand } },
    }),
    prisma.guaranteedBenefit.findMany({ where: { employmentType: user.employmentType }, orderBy: { order: "asc" } }),
    prisma.benefitCatalogItem.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    getMedicalRate(),
  ]);

  const existing = planYear
    ? await prisma.benefitSelection.findUnique({
        where: { userId_planYearId: { userId: me.id, planYearId: planYear.id } },
        include: { lines: { include: { catalogItem: true } } },
      })
    : null;

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

  return (
    <div>
      {eyebrow}
      <h1 className="mt-1 font-serif text-3xl text-ink">Your benefits</h1>
      <p className="mt-1 text-muted">
        {EMPLOYMENT_TYPE_LABEL[user.employmentType]} · {TENURE_BAND_LABEL[user.tenureBand]}
      </p>

      {/* Guaranteed */}
      <section className="mt-6 overflow-hidden rounded-xl border border-line">
        <div className="bg-navy-800 px-6 py-4 text-white">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gold-300">You receive automatically</div>
          <h2 className="font-serif text-xl">Guaranteed benefits</h2>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {guaranteed.map((g) => (
            <div key={g.id} className="bg-surface p-4">
              <div className="text-sm font-medium text-ink">{g.name}</div>
              {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
              <div className="mt-1 font-serif text-lg text-navy-800">
                {egp(amountForBand(user.tenureBand!, g))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Basket */}
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
          {existing?.status === "SUBMITTED" ? null : (
            <p className="mt-1 text-sm text-muted">Select benefits, set amounts, then submit for {planYear.name}.</p>
          )}
          <BenefitsSelector
            employmentType={user.employmentType}
            ceiling={ceilingRow.amount}
            catalog={catalog.map((c) => ({ key: c.key, name: c.name, description: c.description, isMedical: c.isMedical }))}
            medicalRate={{ self: medicalRate.self, spouse: medicalRate.spouse, childUnder18: medicalRate.childUnder18, child18Plus: medicalRate.child18Plus }}
            initialItems={initialItems}
            initialMedical={initialMedical}
            initialStatus={existing?.status ?? "NONE"}
          />
        </>
      )}
    </div>
  );
}
