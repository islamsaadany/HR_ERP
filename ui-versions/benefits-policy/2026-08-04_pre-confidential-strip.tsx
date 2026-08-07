import Link from "next/link";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { TENURE_BAND_LABEL, TENURE_BAND_ORDER, EMPLOYMENT_TYPE_LABEL } from "@/lib/labels";
import { MAX_SELECT_FULL_TIME, MAX_SELECT_PART_TIME } from "@/lib/benefits/rules";
import type { EmploymentType, TenureBand } from "@prisma/client";
import { PrintButton } from "@/components/benefits/PrintButton";

export const dynamic = "force-dynamic";
const egp = (n: number | null | undefined) => (n == null ? "—" : "EGP " + n.toLocaleString());

const GB_BAND_COLS = [
  { key: "band6mo2y", band: "BAND_6MO_2Y" },
  { key: "band2to4y", band: "BAND_2_4Y" },
  { key: "band4to7y", band: "BAND_4_7Y" },
  { key: "band7to10y", band: "BAND_7_10Y" },
] as const;

/**
 * "How the benefits basket works" — a read-only explainer generated from the LIVE config
 * (pool ceilings, guaranteed amounts, catalog, rate card, rules), so it never drifts from
 * what employees actually get. Readable by any signed-in employee; Print/Save-as-PDF for an
 * offline copy. Linked from the Benefits page and the admin Benefits page.
 */
export default async function BenefitsPolicyPage() {
  await requireUser();

  const [poolCeilings, guaranteedBenefits, catalogItems, rateCard] = await Promise.all([
    prisma.poolCeiling.findMany(),
    prisma.guaranteedBenefit.findMany({ orderBy: [{ employmentType: "asc" }, { order: "asc" }] }),
    prisma.benefitCatalogItem.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.medicalRateCard.findFirst(),
  ]);

  const ceilOf = (t: EmploymentType, b: TenureBand) =>
    poolCeilings.find((c) => c.employmentType === t && c.tenureBand === b)?.amount ?? null;

  // Group active catalog items by their category for display.
  const byCategory = new Map<string, typeof catalogItems>();
  for (const item of catalogItems) {
    const cat = item.category ?? "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  // Worked example: full-time, 2–4 years.
  const exCeiling = ceilOf("FULL_TIME", "BAND_2_4Y");
  const exCap = exCeiling != null ? Math.floor(exCeiling * 0.5) : null;

  const guaranteedTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => g.employmentType === t);
    if (rows.length === 0) return null;
    return (
      <div className="mt-3">
        <h3 className="text-sm font-semibold text-navy-800">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.key} className="py-2 pr-4 font-medium">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => {
                const salaryDriven =
                  g.band6mo2y == null && g.band2to4y == null && g.band4to7y == null && g.band7to10y == null;
                return (
                  <tr key={g.id} className="border-b border-line last:border-0 align-top">
                    <td className="py-2 pr-4">
                      <div className="text-ink">{g.name}</div>
                      {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                    </td>
                    {salaryDriven ? (
                      <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven — 1 month salary</td>
                    ) : (
                      GB_BAND_COLS.map((c) => (
                        <td key={c.key} className="py-2 pr-4 tabular-nums text-ink">{egp(g[c.key])}</td>
                      ))
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const H2 = "mt-8 font-serif text-xl text-ink";
  const card = "mt-3 rounded-xl border border-line bg-surface p-5";

  return (
    <div>
      {/* Print isolation: only #print-area is visible when printing, regardless of the app shell. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #print-area, #print-area * { visibility: visible !important; }
        #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
        .no-print { display: none !important; }
      }`}</style>

      <div className="no-print flex items-center justify-between gap-3">
        <Link href="/benefits" className="text-sm font-medium text-navy-600 hover:text-navy-800">
          ← Back to Benefits
        </Link>
        <PrintButton />
      </div>

      <div id="print-area" className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Benefits policy</p>
        <h1 className="mt-1 font-serif text-3xl text-ink">How the benefits basket works</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Everyone receives a set of <strong>guaranteed benefits</strong> automatically. On top of that you build
          a <strong>flexible basket</strong> from a shared pool of money, choosing the benefits that suit you. The
          figures below are the current, live configuration.
        </p>

        <h2 className={H2}>The rules</h2>
        <div className={card}>
          <ul className="space-y-2 text-sm text-ink">
            <li>
              <strong>Your pool</strong> is set by your <strong>employment type and tenure band</strong>, and is the
              most you can allocate for the year.
            </li>
            <li>
              <strong>No single flexible benefit may exceed 50% of your pool</strong> — so full-timers choose at least
              two. (Part-time pools aren&apos;t subject to the 50% cap.)
            </li>
            <li>
              <strong>Medical insurance is exempt from the 50% cap</strong> — it may take more than half your pool, but
              never more than the pool ceiling. Premiums follow the company rate card.
            </li>
            <li>
              You may pick up to <strong>{MAX_SELECT_FULL_TIME} flexible benefits if full-time</strong> and up to{" "}
              <strong>{MAX_SELECT_PART_TIME} if part-time</strong>.
            </li>
            <li>
              <strong>Guaranteed benefits are separate</strong> from the basket and are not affected by your choices.
            </li>
          </ul>
        </div>

        <h2 className={H2}>Pool ceilings</h2>
        <p className="mt-1 text-sm text-muted">The annual pool you can allocate, by employment type and tenure.</p>
        <div className={card + " overflow-x-auto"}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Tenure band</th>
                <th className="py-2 pr-6 font-medium">Full-time</th>
                <th className="py-2 pr-6 font-medium">Part-time</th>
              </tr>
            </thead>
            <tbody>
              {TENURE_BAND_ORDER.map((b) => (
                <tr key={b} className="border-b border-line last:border-0">
                  <td className="py-2 pr-6 text-ink">{TENURE_BAND_LABEL[b]}</td>
                  <td className="py-2 pr-6 tabular-nums text-ink">{egp(ceilOf("FULL_TIME", b))}</td>
                  <td className="py-2 pr-6 tabular-nums text-ink">{egp(ceilOf("PART_TIME", b))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className={H2}>Guaranteed benefits</h2>
        <p className="mt-1 text-sm text-muted">Received automatically, by tenure band. Separate from the basket.</p>
        <div className={card}>
          {guaranteedTable("FULL_TIME")}
          {guaranteedTable("PART_TIME")}
        </div>

        <h2 className={H2}>The flexible basket</h2>
        <p className="mt-1 text-sm text-muted">Benefits you can choose from your pool.</p>
        <div className={card}>
          {[...byCategory.entries()].map(([cat, items]) => (
            <div key={cat} className="mb-4 last:mb-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h3>
              <ul className="mt-1 divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="py-2 text-sm">
                    <span className="text-ink">{i.name}</span>
                    {i.isMedical ? (
                      <span className="ml-2 rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">Medical</span>
                    ) : null}
                    {i.description ? <div className="text-xs text-muted">{i.description}</div> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <h2 className={H2}>Medical rate card</h2>
        <p className="mt-1 text-sm text-muted">Annual premiums used to price medical cover.</p>
        <div className={card}>
          {rateCard ? (
            <table className="text-sm">
              <tbody>
                <tr className="border-b border-line"><td className="py-2 pr-8 text-muted">Self</td><td className="py-2 tabular-nums text-ink">{egp(rateCard.self)}</td></tr>
                <tr className="border-b border-line"><td className="py-2 pr-8 text-muted">Spouse</td><td className="py-2 tabular-nums text-ink">{egp(rateCard.spouse)}</td></tr>
                <tr className="border-b border-line"><td className="py-2 pr-8 text-muted">Child (under 18)</td><td className="py-2 tabular-nums text-ink">{egp(rateCard.childUnder18)}</td></tr>
                <tr><td className="py-2 pr-8 text-muted">Child (18+)</td><td className="py-2 tabular-nums text-ink">{egp(rateCard.child18Plus)}</td></tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">Rate card not configured yet.</p>
          )}
        </div>

        {exCeiling != null && exCap != null ? (
          <>
            <h2 className={H2}>A worked example</h2>
            <div className={card}>
              <p className="text-sm text-ink">
                A <strong>full-time</strong> employee with <strong>2–4 years</strong> tenure has a pool of{" "}
                <strong className="tabular-nums">{egp(exCeiling)}</strong>. No single flexible benefit (other than
                medical) may exceed <strong className="tabular-nums">{egp(exCap)}</strong> — half the pool.
              </p>
              <p className="mt-2 text-sm text-ink">They might build a basket like:</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                <li>Personal medical insurance{rateCard ? <> — <span className="tabular-nums">{egp(rateCard.self)}</span> (exempt from the 50% cap)</> : null}</li>
                <li>Gym membership — <span className="tabular-nums">{egp(Math.min(exCap, 6000))}</span></li>
                <li>Personal learning — up to the remaining pool</li>
              </ul>
              <p className="mt-2 text-sm text-muted">
                …choosing between {MAX_SELECT_FULL_TIME} benefits in total, and never allocating more than{" "}
                <span className="tabular-nums">{egp(exCeiling)}</span> altogether.
              </p>
            </div>
          </>
        ) : null}

        <p className="mt-8 text-xs text-muted">
          Figures reflect the current benefits configuration and may change. Your own pool depends on your
          employment type and tenure as recorded by HR.
        </p>
      </div>
    </div>
  );
}
