import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  EMPLOYMENT_TYPE_LABEL,
  TENURE_BAND_LABEL,
  TENURE_BAND_ORDER,
} from "@/lib/labels";
import { CLAIM_TYPE_LABEL } from "@/lib/benefits/claims";
import { BackLink } from "@/components/admin/BackLink";
import type { EmploymentType, TenureBand } from "@prisma/client";
import {
  editMedicalCommitment,
  removeMedicalCommitment,
  setClaimType,
  releaseClaim,
  rejectClaim,
} from "./actions";
import {
  updatePoolCeilings,
  updateGuaranteedAmounts,
  updateCatalogItem,
  toggleCatalogItem,
  createCatalogItem,
  updateMedicalRateCard,
} from "./config-actions";
import { PlanYearDialog } from "@/components/admin/PlanYearDialog";
import { AdminBenefitsTabs } from "@/components/admin/AdminBenefitsTabs";
import { EditableSection } from "@/components/admin/EditableSection";
import { ManualReleaseModal } from "@/components/admin/ManualReleaseModal";

export const dynamic = "force-dynamic";
const egp = (n: number) => "EGP " + n.toLocaleString();
const CLAIM_TYPES = ["NONE", "NOTE", "PROOF"] as const;

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
            // Claims awaiting HR review: new SUBMITTED + legacy PENDING.
            where: { planYearId: active.id, status: { in: ["SUBMITTED", "PENDING"] } },
            include: {
              user: { select: { name: true } },
              guaranteedBenefit: { select: { name: true } },
              catalogItem: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      prisma.guaranteedBenefit.findMany({ orderBy: [{ employmentType: "asc" }, { order: "asc" }] }),
      prisma.benefitCatalogItem.findMany({ orderBy: { order: "asc" } }),
      prisma.poolCeiling.findMany(),
      prisma.user.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);
  const rateCard = await prisma.medicalRateCard.findFirst();

  const ceilOf = (t: EmploymentType, b: TenureBand) =>
    poolCeilings.find((c) => c.employmentType === t && c.tenureBand === b)?.amount ?? "";

  const GB_BAND_COLS = [
    { key: "band6mo2y", band: "BAND_6MO_2Y" },
    { key: "band2to4y", band: "BAND_2_4Y" },
    { key: "band4to7y", band: "BAND_4_7Y" },
    { key: "band7to10y", band: "BAND_7_10Y" },
  ] as const;

  const isSalaryDriven = (g: {
    band6mo2y: number | null;
    band2to4y: number | null;
    band4to7y: number | null;
    band7to10y: number | null;
  }) => g.band6mo2y == null && g.band2to4y == null && g.band4to7y == null && g.band7to10y == null;

  // ── Manual-entry benefit list: guaranteed + active catalog items ─────────
  const manualBenefits = [
    ...guaranteedBenefits.map((g) => ({
      value: `guaranteed:${g.id}`,
      label: `${g.name} (${EMPLOYMENT_TYPE_LABEL[g.employmentType]})`,
      group: "Guaranteed" as const,
    })),
    ...catalogItems
      .filter((c) => c.active)
      .map((c) => ({ value: `catalog:${c.id}`, label: c.name, group: "Flexible basket" as const })),
  ];

  // ── Edit forms (server-action) reused inside EditableSection editViews ───
  const guaranteedEditTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => g.employmentType === t);
    return (
      <form action={updateGuaranteedAmounts} className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.key} className="py-2 pr-4 font-medium">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-6">
                    <div className="text-ink">{g.name}</div>
                    {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                  </td>
                  {isSalaryDriven(g) ? (
                    <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven — 1 month salary (not a fixed amount)</td>
                  ) : (
                    GB_BAND_COLS.map((c) => {
                      const v = g[c.key] ?? "";
                      return (
                        <td key={c.key} className="py-2 pr-4">
                          <input
                            key={`${g.id}_${c.key}-${v}`}
                            type="number"
                            name={`gb_${g.id}_${c.key}`}
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
    const rows = guaranteedBenefits.filter((g) => g.employmentType === t);
    return (
      <div className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{EMPLOYMENT_TYPE_LABEL[t]}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-6 font-medium">Benefit</th>
                {GB_BAND_COLS.map((c) => (
                  <th key={c.key} className="py-2 pr-4 font-medium text-right">{TENURE_BAND_LABEL[c.band]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-t border-line align-top">
                  <td className="py-2 pr-6">
                    <div className="text-ink">{g.name}</div>
                    {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                  </td>
                  {isSalaryDriven(g) ? (
                    <td colSpan={4} className="py-2 text-xs text-muted">Salary-driven</td>
                  ) : (
                    GB_BAND_COLS.map((c) => (
                      <td key={c.key} className="py-2 pr-4 text-right tabular-nums text-ink">
                        {g[c.key] != null ? (g[c.key] as number).toLocaleString() : "—"}
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const typeSelect = (kind: string, id: string, current: string) => (
    <form action={setClaimType} className="flex items-center gap-1.5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <select
        key={`${id}-${current}`}
        name="claimType"
        defaultValue={current}
        className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
      >
        {CLAIM_TYPES.map((t) => (
          <option key={t} value={t}>{CLAIM_TYPE_LABEL[t]}</option>
        ))}
      </select>
      <button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50">Set</button>
    </form>
  );

  // ── Tab 1: Submissions & Claims ─────────────────────────────────────────
  const submissionsPanel = (
    <div className="space-y-6">
      {/* Claims to review */}
      <section className="rounded-xl border border-line bg-surface p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Claims to review {pendingClaims.length ? `· ${pendingClaims.length}` : ""}</h2>
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
        {pendingClaims.length === 0 ? (
          <p className="text-sm text-muted">No pending claims.</p>
        ) : (
          <ul className="space-y-3">
            {pendingClaims.map((c) => (
              <li key={c.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium text-ink">{c.user.name}</span>
                    <span className="ml-2 text-sm text-muted">
                      {c.guaranteedBenefit?.name ?? c.catalogItem?.name} · <span className="tabular-nums">{egp(c.amount)}</span>
                    </span>
                  </div>
                  <span className="text-xs text-muted">{formatDate(c.createdAt)}</span>
                </div>
                {c.note ? <p className="mt-1 text-sm text-ink">“{c.note}”</p> : null}
                {c.proofUrl ? (
                  <a href={`/api/claims/${c.id}/proof`} target="_blank" rel="noopener" className="mt-1 inline-block text-sm text-navy-600 underline">
                    {c.proofName ?? "View proof"}
                  </a>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={releaseClaim}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-700">Release payment</button>
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

  // ── Tab 2: Benefits Catalogue (one table, view-first) ───────────────────
  const catalogueRead = (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Category</th>
            <th className="py-2 pr-4 font-medium text-right">Order</th>
            <th className="py-2 pr-4 font-medium">Claim requirement</th>
            <th className="py-2 pr-4 font-medium text-right">Coverage %</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {catalogItems.map((c) => (
            <tr key={c.id} className={"border-b border-line last:border-0 " + (c.active ? "" : "opacity-60")}>
              <td className="py-2 pr-4 text-ink">
                {c.name}
                {c.isMedical ? <span className="ml-1.5 rounded-full bg-navy-50 px-1.5 py-0.5 text-[10px] font-semibold text-navy-700">Medical</span> : null}
              </td>
              <td className="py-2 pr-4 text-muted">{c.category ?? "—"}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-muted">{c.order}</td>
              <td className="py-2 pr-4"><span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">{CLAIM_TYPE_LABEL[c.claimType]}</span></td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">{c.isMedical ? "100%" : `${c.coverageRate}%`}</td>
              <td className="py-2 text-muted">{c.active ? "Visible" : "Hidden"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const catalogueEdit = (
    <div className="space-y-2">
      {catalogItems.map((c) => (
        <div key={c.id} className={"rounded-lg border border-line p-3 " + (c.active ? "" : "opacity-60")}>
          <form action={updateCatalogItem} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={c.id} />
            <div className="min-w-[150px] flex-1">
              <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Name</label>
              <input name="name" defaultValue={c.name} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
            </div>
            <div className="min-w-[140px]">
              <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Category</label>
              <input name="category" defaultValue={c.category ?? ""} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
            </div>
            <div className="w-16">
              <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Order</label>
              <input name="order" type="number" min={0} defaultValue={c.order} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums" />
            </div>
            <div className="w-20" title={c.isMedical ? "Medical is always 100% covered" : "Company coverage % (0–100)"}>
              <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Coverage %</label>
              <input name="coverageRate" type="number" min={1} max={100} defaultValue={c.coverageRate} disabled={c.isMedical} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums disabled:opacity-60" />
            </div>
            <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">Save</button>
          </form>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-[11px] uppercase tracking-wide text-muted">Claim requirement</span>
            {typeSelect("catalog", c.id, c.claimType)}
            <span className="text-xs text-muted">· {c.active ? "Visible" : "Hidden"}</span>
            <form action={toggleCatalogItem}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="active" value={c.active ? "false" : "true"} />
              <button className="text-xs font-semibold text-navy-600 hover:text-navy-800">{c.active ? "Hide" : "Show"}</button>
            </form>
          </div>
        </div>
      ))}
      <form action={createCatalogItem} className="mt-2 flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div className="min-w-[160px] flex-1">
          <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">New item name</label>
          <input name="name" placeholder="e.g. Eyewear allowance" className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
        </div>
        <div className="min-w-[150px]">
          <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Category</label>
          <input name="category" placeholder="e.g. Wellbeing" className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
        </div>
        <div className="w-24">
          <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Coverage %</label>
          <input name="coverageRate" type="number" min={1} max={100} defaultValue={100} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums" />
        </div>
        <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Add item</button>
      </form>
    </div>
  );

  const cataloguePanel = (
    <EditableSection
      title="Benefits Catalogue"
      description="The flexible benefits employees can pick — name, category, order, claim requirement, and company coverage %. Hidden items stay out of the basket but are never deleted."
      readView={catalogueRead}
      editView={catalogueEdit}
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

  const guaranteedReqRead = (
    <ul className="divide-y divide-line">
      {guaranteedBenefits.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-sm text-ink">{g.name} <span className="text-xs text-muted">({EMPLOYMENT_TYPE_LABEL[g.employmentType]})</span></span>
          <span className="rounded-full bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-700">{CLAIM_TYPE_LABEL[g.claimType]}</span>
        </li>
      ))}
    </ul>
  );
  const guaranteedReqEdit = (
    <ul className="divide-y divide-line">
      {guaranteedBenefits.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-sm text-ink">{g.name} <span className="text-xs text-muted">({EMPLOYMENT_TYPE_LABEL[g.employmentType]})</span></span>
          {typeSelect("guaranteed", g.id, g.claimType)}
        </li>
      ))}
    </ul>
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
        description="Fixed entitlements each employee receives automatically, by tenure band — separate from the flexible basket. Loans are salary-driven."
        readView={<>{guaranteedReadTable("FULL_TIME")}<div className="mt-4">{guaranteedReadTable("PART_TIME")}</div></>}
        editView={<>{guaranteedEditTable("FULL_TIME")}<div className="mt-6">{guaranteedEditTable("PART_TIME")}</div></>}
      />
      <EditableSection
        title="Guaranteed claim requirements"
        description="What each guaranteed benefit needs before it's reimbursed: Automatic (paid, no claim), Request (optional note), or Proof required."
        readView={guaranteedReqRead}
        editView={guaranteedReqEdit}
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
            Proration window · <span className="font-semibold">{formatDate(active.startDate)} → {formatDate(active.endDate)}</span> · mid-year starters are prorated against this window.
          </p>
        ) : (
          <p className="mt-4 rounded-lg border border-gold-500 bg-gold-100 px-4 py-3 text-sm text-gold-800">
            <strong>Proration off</strong> — “{active.name}” has no start/end dates, so mid-year starters receive full amounts. Set dates via <strong>Plan year</strong> to enable proration.
          </p>
        )
      ) : null}

      <AdminBenefitsTabs
        tabs={[
          { id: "submissions", label: "Submissions & Claims", badge: pendingClaims.length, node: submissionsPanel },
          { id: "catalogue", label: "Benefits Catalogue", node: cataloguePanel },
          { id: "amounts", label: "Amounts", node: amountsPanel },
        ]}
      />
    </div>
  );
}
