import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  EMPLOYMENT_TYPE_LABEL,
  TENURE_BAND_LABEL,
  TENURE_BAND_ORDER,
} from "@/lib/labels";
import { CLAIM_STATUS_LABEL, CLAIM_STATUS_CLASS } from "@/lib/benefits/claims";
import { BackLink } from "@/components/admin/BackLink";
import type { EmploymentType, TenureBand } from "@prisma/client";
import {
  editMedicalCommitment,
  removeMedicalCommitment,
  approveClaim,
  rejectClaim,
} from "./actions";
import {
  updatePoolCeilings,
  updateGuaranteedAmounts,
  updateMedicalRateCard,
} from "./config-actions";
import { isSalaryDriven, isEligibleFor } from "@/lib/benefits/config";
import { PlanYearDialog } from "@/components/admin/PlanYearDialog";
import { AdminBenefitsTabs } from "@/components/admin/AdminBenefitsTabs";
import { EditableSection } from "@/components/admin/EditableSection";
import { ManualReleaseModal } from "@/components/admin/ManualReleaseModal";
import { CatalogueGrid, type CatalogueGridRow } from "@/components/admin/CatalogueGrid";
import { AddCatalogItemModal } from "@/components/admin/AddCatalogItemModal";

export const dynamic = "force-dynamic";
const egp = (n: number) => "EGP " + n.toLocaleString();

export default async function AdminBenefitsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;
  const planYears = await prisma.planYear.findMany({ orderBy: { createdAt: "desc" } });
  const active = planYears.find((p) => p.status === "OPEN") ?? planYears[0];

  const [medicalCommitments, pendingClaims, guaranteedBenefits, catalogItems, poolCeilings, employees] =
    await Promise.all([
      active
        ? prisma.medicalCommitment.findMany({
            where: { planYearId: active.id },
            include: { user: { select: { name: true, employmentType: true, tenureBand: true } } },
            orderBy: { committedAt: "desc" },
          })
        : Promise.resolve([]),
      active
        ? prisma.benefitClaim.findMany({
            // All the plan year's claims — HR keeps visibility; only SUBMITTED ones are actionable.
            where: { planYearId: active.id },
            include: {
              user: { select: { name: true } },
              guaranteedBenefit: { select: { name: true } },
              catalogItem: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      prisma.guaranteedBenefit.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
      prisma.benefitCatalogItem.findMany({ orderBy: { order: "asc" } }),
      prisma.poolCeiling.findMany(),
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  // SUBMITTED claims are the actionable ones (drive the tab badge); show them first.
  const claimsToReview = pendingClaims.filter((c) => c.status === "SUBMITTED").length;
  const sortedClaims = [...pendingClaims].sort(
    (a, b) => (a.status === "SUBMITTED" ? 0 : 1) - (b.status === "SUBMITTED" ? 0 : 1)
  );
  const rateCard = await prisma.medicalRateCard.findFirst();

  const ceilOf = (t: EmploymentType, b: TenureBand) =>
    poolCeilings.find((c) => c.employmentType === t && c.tenureBand === b)?.amount ?? "";

  // Per-employment-type × band amount columns for the numbers-only guaranteed grid (spec 021).
  const GB_BAND_COLS = [
    { ft: "ftBand6mo2y", pt: "ptBand6mo2y", band: "BAND_6MO_2Y" },
    { ft: "ftBand2to4y", pt: "ptBand2to4y", band: "BAND_2_4Y" },
    { ft: "ftBand4to7y", pt: "ptBand4to7y", band: "BAND_4_7Y" },
    { ft: "ftBand7to10y", pt: "ptBand7to10y", band: "BAND_7_10Y" },
  ] as const;
  const colFor = (t: EmploymentType, c: (typeof GB_BAND_COLS)[number]) => (t === "FULL_TIME" ? c.ft : c.pt);

  const eligibilityText = (b: { eligibleFullTime: boolean; eligiblePartTime: boolean }) =>
    b.eligibleFullTime && b.eligiblePartTime ? "Full-time & Part-time" : b.eligibleFullTime ? "Full-time" : b.eligiblePartTime ? "Part-time" : "No one";

  // ── Manual-entry benefit list: guaranteed + active catalog items ─────────
  const manualBenefits = [
    ...guaranteedBenefits.map((g) => ({
      value: `guaranteed:${g.id}`,
      label: `${g.name} (${eligibilityText(g)})`,
      group: "Guaranteed" as const,
    })),
    ...catalogItems
      .filter((c) => c.active)
      .map((c) => ({ value: `catalog:${c.id}`, label: c.name, group: "Flexible basket" as const })),
  ];

  // ── Edit forms (server-action) reused inside EditableSection editViews ───
  // Numbers-only guaranteed amounts grid (spec 021): one form per employment type, listing every
  // benefit eligible for that type; cells write the ft*/pt* columns via `gb_<id>_<column>`.
  const guaranteedEditTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => isEligibleFor(t, g));
    return (
      <form action={updateGuaranteedAmounts} className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.band} className="py-2 pr-4 font-medium">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-3 text-xs text-muted">No {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} benefits — tick eligibility in the Catalogue.</td></tr>
              ) : rows.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-6">
                    <div className="text-ink">{g.name}</div>
                    {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                  </td>
                  {isSalaryDriven(g) ? (
                    <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven — 1 month salary (not a fixed amount)</td>
                  ) : (
                    GB_BAND_COLS.map((c) => {
                      const col = colFor(t, c);
                      const v = g[col] ?? "";
                      return (
                        <td key={c.band} className="py-2 pr-4">
                          <input
                            key={`${g.id}_${col}-${v}`}
                            type="number"
                            name={`gb_${g.id}_${col}`}
                            defaultValue={v}
                            min={0}
                            step={500}
                            className="w-24 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          Save {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} amounts
        </button>
      </form>
    );
  };

  // Read-only guaranteed table.
  const guaranteedReadTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => isEligibleFor(t, g));
    return (
      <div className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.band} className="py-2 pr-4 font-medium text-right">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5} className="py-3 text-xs text-muted">No {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} benefits.</td></tr>
              ) : rows.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-6">
                    <div className="text-ink">{g.name}</div>
                    {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                  </td>
                  {isSalaryDriven(g) ? (
                    <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven</td>
                  ) : (
                    GB_BAND_COLS.map((c) => {
                      const v = g[colFor(t, c)];
                      return (
                        <td key={c.band} className="py-2 pr-4 text-right tabular-nums text-ink">
                          {v != null ? v.toLocaleString() : "—"}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ── Tab 1: Submissions & Claims ─────────────────────────────────────────
  const submissionsPanel = (
    <div className="space-y-6">
      {/* Claims to review */}
      <section className="rounded-xl border border-line bg-surface p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Claims {claimsToReview ? `· ${claimsToReview} to review` : ""}</h2>
          {/* Recording a past claim is an exception (HR back-filling a claim paid outside the
              app), so it sits as a compact secondary action here rather than a full card. */}
          {active ? (
            <ManualReleaseModal
              employees={employees}
              benefits={manualBenefits}
              triggerLabel="＋ Record entry…"
              triggerClassName="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-navy-900 hover:bg-gold-600"
            />
          ) : null}
        </div>
        {sortedClaims.length === 0 ? (
          <p className="text-sm text-muted">No claims yet.</p>
        ) : (
          <ul className="space-y-3">
            {sortedClaims.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-ink">{c.user.name}</span>
                    <span className="ml-2 text-sm text-muted">
                      {c.guaranteedBenefit?.name ?? c.catalogItem?.name} · <span className="tabular-nums">{egp(c.amount)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + CLAIM_STATUS_CLASS[c.status]}>
                      {CLAIM_STATUS_LABEL[c.status]}
                    </span>
                    <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
                  </div>
                </div>
                {c.note ? <p className="mt-1 text-sm text-ink">“{c.note}”</p> : null}
                {c.decisionNote ? <p className="mt-1 text-xs text-red-600">Rejected: {c.decisionNote}</p> : null}
                {c.proofUrl ? (
                  <a href={`/api/claims/${c.id}/proof`} target="_blank" rel="noopener" className="mt-1 inline-block text-sm text-navy-600 underline">
                    {c.proofName ?? "View proof"}
                  </a>
                ) : null}
                {c.status === "SUBMITTED" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <form action={approveClaim}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">Approve</button>
                    </form>
                    <details>
                      <summary className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">Reject</summary>
                      <form action={rejectClaim} className="mt-2 flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input name="reason" placeholder="Reason (optional)" className="rounded-lg border border-line px-3 py-1.5 text-sm" />
                        <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-red-600 hover:border-red-300">Confirm reject</button>
                      </form>
                    </details>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Submissions */}
      <section className="rounded-xl border border-line bg-surface p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Medical commitments {active ? `· ${active.name}` : ""}</h2>
          {active ? (
            <a
              href={`/api/admin/benefits/export?planYearId=${active.id}`}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              Export CSV
            </a>
          ) : null}
        </div>
        <p className="mb-3 text-xs text-muted">
          Medical is the one committed benefit — locked to the employee after they commit. Edit dependants
          (recomputes the premium, capped at their pool) or remove a commitment so they can re-commit.
          Flexible benefits are claimed directly; review those claims below.
        </p>
        {medicalCommitments.length === 0 ? (
          <p className="text-sm text-muted">No medical commitments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Cover</th>
                  <th className="py-2 pr-4 font-medium">Premium</th>
                  <th className="py-2 pr-4 font-medium">Committed</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {medicalCommitments.map((m) => {
                  const deps = [
                    m.spouse ? "spouse" : null,
                    m.childrenUnder18 + m.children18Plus > 0
                      ? `${m.childrenUnder18 + m.children18Plus} child(ren)`
                      : null,
                  ].filter(Boolean);
                  return (
                    <tr key={m.id} className="border-b border-line align-top last:border-0">
                      <td className="py-2 pr-4 text-ink">{m.user.name}</td>
                      <td className="py-2 pr-4 text-muted">You{deps.length ? " + " + deps.join(" + ") : ""}</td>
                      <td className="py-2 pr-4 tabular-nums text-ink">{egp(m.premium)}</td>
                      <td className="py-2 pr-4 text-muted">{formatDate(m.committedAt)}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-end justify-end gap-2">
                          <form action={editMedicalCommitment} className="flex items-end gap-1.5">
                            <input type="hidden" name="id" value={m.id} />
                            <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted">
                              Spouse
                              <input type="checkbox" name="spouse" value="true" defaultChecked={m.spouse} className="mt-1 h-5 w-5" />
                            </label>
                            <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted">
                              &lt;18
                              <input type="number" name="childrenUnder18" min={0} defaultValue={m.childrenUnder18} className="mt-1 w-14 rounded border border-line px-2 py-1 text-sm" />
                            </label>
                            <label className="flex flex-col text-[10px] uppercase tracking-wide text-muted">
                              18+
                              <input type="number" name="children18Plus" min={0} defaultValue={m.children18Plus} className="mt-1 w-14 rounded border border-line px-2 py-1 text-sm" />
                            </label>
                            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-navy-700 hover:bg-navy-50">Save</button>
                          </form>
                          <form action={removeMedicalCommitment}>
                            <input type="hidden" name="id" value={m.id} />
                            <button className="text-sm font-medium text-muted hover:text-red-600">Remove</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );

  // ── Tab 2: Benefits Catalogue (unified inline grid) ─────────────────────
  const catalogueRows: CatalogueGridRow[] = [
    ...guaranteedBenefits.map((g): CatalogueGridRow => ({
      kind: "guaranteed", id: g.id, name: g.name, note: g.note ?? "",
      typeLabel: "Guaranteed", scope: "",
      category: g.category ?? "", claimType: g.claimType,
      eligibleFullTime: g.eligibleFullTime, eligiblePartTime: g.eligiblePartTime,
      coverage: isSalaryDriven(g) ? "Salary" : "Fixed", coverageEditable: false, coverageRate: 0,
      active: true, statusEditable: false, order: g.order,
    })),
    ...catalogItems.map((c): CatalogueGridRow => ({
      kind: "catalog", id: c.id, name: c.name, note: c.description ?? "",
      typeLabel: c.isMedical ? "Medical" : "Flexible",
      scope: c.isMedical ? (c.medicalScope === "FAMILY" ? "Family" : "Personal") : "",
      category: c.category ?? "", claimType: c.claimType,
      eligibleFullTime: c.eligibleFullTime, eligiblePartTime: c.eligiblePartTime,
      coverage: c.isMedical ? "100%" : `${c.coverageRate}%`, coverageEditable: !c.isMedical, coverageRate: c.coverageRate,
      active: c.active, statusEditable: true, order: c.order,
    })),
  ];
  // Category suggestions: the aligned set (spec 021) plus anything already in use.
  const KNOWN_CATEGORIES = [
    "Health & protection", "Wellbeing", "Life & family", "Personal growth",
    "Lifestyle & flexibility", "Allowances", "Financial support",
  ];
  const catalogueCategories = Array.from(
    new Set([...KNOWN_CATEGORIES, ...catalogueRows.map((r) => r.category).filter(Boolean)])
  ).sort();

  const cataloguePanel = (
    <CatalogueGrid
      rows={catalogueRows}
      categories={catalogueCategories}
      toolbarExtra={<AddCatalogItemModal categories={catalogueCategories} />}
    />
  );

  // ── Tab 3: Amounts ──────────────────────────────────────────────────────
  const ceilingsRead = (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-6 font-medium">Tenure band</th>
            <th className="py-2 pr-6 font-medium text-right">Full-time</th>
            <th className="py-2 pr-6 font-medium text-right">Part-time</th>
          </tr>
        </thead>
        <tbody>
          {TENURE_BAND_ORDER.map((b) => (
            <tr key={b} className="border-t border-line">
              <td className="py-2 pr-6 text-ink">{TENURE_BAND_LABEL[b]}</td>
              <td className="py-2 pr-6 text-right tabular-nums text-ink">{ceilOf("FULL_TIME", b) === "" ? "—" : egp(ceilOf("FULL_TIME", b) as number)}</td>
              <td className="py-2 pr-6 text-right tabular-nums text-ink">{ceilOf("PART_TIME", b) === "" ? "—" : egp(ceilOf("PART_TIME", b) as number)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const ceilingsEdit = (
    <form action={updatePoolCeilings}>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 pr-6 font-medium">Tenure band</th>
              <th className="py-2 pr-6 font-medium">Full-time</th>
              <th className="py-2 pr-6 font-medium">Part-time</th>
            </tr>
          </thead>
          <tbody>
            {TENURE_BAND_ORDER.map((b) => (
              <tr key={b} className="border-t border-line">
                <td className="py-2 pr-6 text-ink">{TENURE_BAND_LABEL[b]}</td>
                {(["FULL_TIME", "PART_TIME"] as EmploymentType[]).map((t) => {
                  const v = ceilOf(t, b);
                  return (
                    <td key={t} className="py-2 pr-6">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted">EGP</span>
                        <input
                          key={`${t}_${b}-${v}`}
                          type="number"
                          name={`ceil_${t}_${b}`}
                          defaultValue={v}
                          min={0}
                          step={1000}
                          className="w-32 rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Save ceilings</button>
    </form>
  );

  const rateCardRead = (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-6 font-medium text-right">Self</th>
            <th className="py-2 pr-6 font-medium text-right">Spouse</th>
            <th className="py-2 pr-6 font-medium text-right">Child &lt; 18</th>
            <th className="py-2 pr-6 font-medium text-right">Child 18+</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line tabular-nums text-ink">
            <td className="py-2 pr-6 text-right">{rateCard ? egp(rateCard.self) : "—"}</td>
            <td className="py-2 pr-6 text-right">{rateCard ? egp(rateCard.spouse) : "—"}</td>
            <td className="py-2 pr-6 text-right">{rateCard ? egp(rateCard.childUnder18) : "—"}</td>
            <td className="py-2 pr-6 text-right">{rateCard ? egp(rateCard.child18Plus) : "—"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const rateCardEdit = (
    <form action={updateMedicalRateCard} className="flex flex-wrap items-end gap-3">
      {(
        [
          { name: "self", label: "Self", v: rateCard?.self },
          { name: "spouse", label: "Spouse", v: rateCard?.spouse },
          { name: "childUnder18", label: "Child < 18", v: rateCard?.childUnder18 },
          { name: "child18Plus", label: "Child 18+", v: rateCard?.child18Plus },
        ] as const
      ).map((f) => (
        <div key={f.name} className="w-32">
          <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">{f.label}</label>
          <input
            key={`${f.name}-${f.v ?? ""}`}
            name={f.name}
            type="number"
            min={0}
            step={500}
            defaultValue={f.v ?? ""}
            className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums focus:border-navy-500 focus:outline-none"
          />
        </div>
      ))}
      <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Save rate card</button>
    </form>
  );

  const amountsPanel = (
    <div className="space-y-6">
      <EditableSection
        title="Pool ceilings"
        description="The annual pool (EGP) each employee can allocate, by employment type and tenure band — the maximum company contribution, and the basis for the 50% single-benefit cap."
        readView={ceilingsRead}
        editView={ceilingsEdit}
      />
      <EditableSection
        title="Guaranteed amounts"
        description="Fixed entitlements by tenure band, per employment type — just the numbers. Who's eligible and how it's claimed is set on the Catalogue tab. Loans are salary-driven."
        readView={<>{guaranteedReadTable("FULL_TIME")}<div className="mt-4">{guaranteedReadTable("PART_TIME")}</div></>}
        editView={<>{guaranteedEditTable("FULL_TIME")}<div className="mt-6">{guaranteedEditTable("PART_TIME")}</div></>}
      />
      <EditableSection
        title="Medical rate card"
        description="Annual premiums (EGP) used to price medical cover. Medical is exempt from the 50% cap but never exceeds the pool ceiling."
        readView={rateCardRead}
        editView={rateCardEdit}
      />
    </div>
  );

  return (
    <div>
      <BackLink href="/admin" label="Admin" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Benefits</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Benefits Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/benefits/release"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Release a benefit
          </a>
          <a
            href="/benefits/policy"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Policy page
          </a>
          <PlanYearDialog planYears={planYears} activeName={active?.name} />
        </div>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Proration window (spec 019): show the active year's dates, or warn if unset. */}
      {active ? (
        active.startDate && active.endDate ? (
          <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">
            Proration window · <span className="font-semibold">{formatDate(active.startDate)} → {formatDate(active.endDate)}</span> · the flexible pool &amp; Professional development scale to this window&rsquo;s length; medical is prorated for mid-cycle joiners.
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-gold-500 bg-gold-100 px-4 py-3 text-sm text-gold-800">
            <strong>Proration off</strong> — “{active.name}” has no start/end dates, so full annual amounts apply to everyone. Set dates via <strong>Plan year</strong> to enable proration.
          </p>
        )
      ) : null}

      <AdminBenefitsTabs
        tabs={[
          { id: "submissions", label: "Submissions & Claims", badge: claimsToReview, node: submissionsPanel },
          { id: "catalogue", label: "Benefits Catalogue", node: cataloguePanel },
          { id: "amounts", label: "Amounts", node: amountsPanel },
        ]}
      />
    </div>
  );
}
