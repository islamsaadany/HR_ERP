import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  EMPLOYMENT_TYPE_LABEL,
  TENURE_BAND_LABEL,
  TENURE_BAND_ORDER,
} from "@/lib/labels";
import { CLAIM_TYPE_LABEL } from "@/lib/benefits/claims";
import type { EmploymentType, TenureBand } from "@prisma/client";
import {
  reopenSelection,
  resetSelection,
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

  const [selections, pendingClaims, guaranteedBenefits, catalogItems, poolCeilings] = await Promise.all([
    active
      ? prisma.benefitSelection.findMany({
          where: { planYearId: active.id },
          include: { user: { select: { name: true } }, lines: true },
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    active
      ? prisma.benefitClaim.findMany({
          where: { planYearId: active.id, status: "PENDING" },
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

  const guaranteedTable = (t: EmploymentType) => {
    const rows = guaranteedBenefits.filter((g) => g.employmentType === t);
    return (
      <form action={updateGuaranteedAmounts} className="mt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {EMPLOYMENT_TYPE_LABEL[t]}
        </h3>
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
              {rows.map((g) => {
                const salaryDriven =
                  g.band6mo2y == null && g.band2to4y == null && g.band4to7y == null && g.band7to10y == null;
                return (
                  <tr key={g.id} className="border-t border-line align-top">
                    <td className="py-2 pr-6">
                      <div className="text-ink">{g.name}</div>
                      {g.note ? <div className="text-xs text-muted">{g.note}</div> : null}
                    </td>
                    {salaryDriven ? (
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
                );
              })}
            </tbody>
          </table>
        </div>
        <button className="mt-3 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          Save {EMPLOYMENT_TYPE_LABEL[t].toLowerCase()} amounts
        </button>
      </form>
    );
  };

  const typeSelect = (kind: string, id: string, current: string) => (
    <form action={setClaimType} className="flex items-center gap-1.5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      {/* key includes `current` so the dropdown re-mounts with the saved value after a
          save — otherwise React resets the uncontrolled field and it appears to revert. */}
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

  // ── Configuration panel ───────────────────────────────────────────────
  const configPanel = (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="font-serif text-lg text-ink">Pool ceilings</h2>
      <p className="mt-1 text-sm text-muted">
        The annual pool (EGP) each employee can allocate, by employment type and tenure band. This is the
        maximum claimable for the year and drives the 50% single-benefit cap.
      </p>
      <form action={updatePoolCeilings} className="mt-4">
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
        <button className="mt-4 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          Save ceilings
        </button>
      </form>
    </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">Guaranteed amounts</h2>
        <p className="mt-1 text-sm text-muted">
          The fixed entitlements each employee receives automatically, by tenure band — separate from the
          flexible basket. Loans are salary-driven, not a fixed figure.
        </p>
        {guaranteedTable("FULL_TIME")}
        <div className="mt-6">{guaranteedTable("PART_TIME")}</div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">Basket catalog</h2>
        <p className="mt-1 text-sm text-muted">
          The flexible benefits employees can pick. Hidden items stay out of the basket but are never deleted,
          so existing selections keep working.
        </p>
        <div className="mt-4 space-y-2">
          {catalogItems.map((c) => (
            <div key={c.id} className={"rounded-lg border border-line p-3 " + (c.active ? "" : "opacity-60")}>
              <form action={updateCatalogItem} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={c.id} />
                <div className="min-w-[160px] flex-1">
                  <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Name</label>
                  <input name="name" defaultValue={c.name} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
                </div>
                <div className="min-w-[150px]">
                  <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Category</label>
                  <input name="category" defaultValue={c.category ?? ""} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
                </div>
                <div className="w-20">
                  <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Order</label>
                  <input name="order" type="number" min={0} defaultValue={c.order} className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm tabular-nums" />
                </div>
                <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">Save</button>
              </form>
              <div className="mt-2 flex items-center gap-3">
                {c.isMedical ? <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[11px] font-semibold text-navy-700">Medical</span> : null}
                <span className="text-xs text-muted">{c.active ? "Visible" : "Hidden"}</span>
                <form action={toggleCatalogItem}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                  <button className="text-xs font-semibold text-navy-600 hover:text-navy-800">
                    {c.active ? "Hide" : "Show"}
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
        <form action={createCatalogItem} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4">
          <div className="min-w-[160px] flex-1">
            <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">New item name</label>
            <input name="name" placeholder="e.g. Eyewear allowance" className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
          </div>
          <div className="min-w-[150px]">
            <label className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">Category</label>
            <input name="category" placeholder="e.g. Wellbeing" className="w-full rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
          </div>
          <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Add item</button>
        </form>
      </section>

      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="font-serif text-lg text-ink">Medical rate card</h2>
        <p className="mt-1 text-sm text-muted">
          Annual premiums (EGP) used to price medical cover, from the insurer&apos;s figures. Medical is exempt
          from the 50% cap but never exceeds the pool ceiling.
        </p>
        <form action={updateMedicalRateCard} className="mt-4 flex flex-wrap items-end gap-3">
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
      </section>
    </div>
  );

  // ── Submissions & claims panel ────────────────────────────────────────
  const submissionsPanel = (
    <div className="space-y-6">
      {/* Claims to review */}
      <section className="rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Claims to review {pendingClaims.length ? `· ${pendingClaims.length}` : ""}</h2>
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
                  <a href={c.proofUrl} target="_blank" rel="noopener" className="mt-1 inline-block text-sm text-navy-600 underline">
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
          <h2 className="font-serif text-lg text-ink">Submissions {active ? `· ${active.name}` : ""}</h2>
          {active && selections.length > 0 ? (
            <a
              href={`/api/admin/benefits/export?planYearId=${active.id}`}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              Export CSV
            </a>
          ) : null}
        </div>
        {selections.length === 0 ? (
          <p className="text-sm text-muted">No baskets yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Total</th>
                  <th className="py-2 pr-4 font-medium">Submitted</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {selections.map((s) => {
                  const total = s.lines.reduce((sum, l) => sum + l.amount, 0);
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <td className="py-2 pr-4 text-ink">{s.user.name}</td>
                      <td className="py-2 pr-4">
                        <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (s.status === "SUBMITTED" ? "bg-navy-50 text-navy-700" : "bg-gold-100 text-gold-800")}>{s.status}</span>
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-ink">{egp(total)}</td>
                      <td className="py-2 pr-4 text-muted">{s.submittedAt ? formatDate(s.submittedAt) : "—"}</td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {s.status === "SUBMITTED" ? (
                            <form action={reopenSelection}>
                              <input type="hidden" name="id" value={s.id} />
                              <button className="text-sm font-medium text-navy-600 hover:text-navy-800">Reopen</button>
                            </form>
                          ) : null}
                          <form action={resetSelection}>
                            <input type="hidden" name="id" value={s.id} />
                            <button className="text-sm font-medium text-muted hover:text-red-600">Reset</button>
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

  // ── Claim requirements panel ──────────────────────────────────────────
  const requirementsPanel = (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="mb-1 font-serif text-lg text-ink">Claim requirements</h2>
      <p className="mb-4 text-sm text-muted">
        What each benefit needs before it&apos;s reimbursed: <strong>Automatic</strong> (paid, no claim),
        <strong> Request</strong> (optional note), or <strong>Proof required</strong> (upload reviewed before release).
      </p>

      <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted">Guaranteed</h3>
      <ul className="mt-1 divide-y divide-line">
        {guaranteedBenefits.map((g) => (
          <li key={g.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm text-ink">
              {g.name} <span className="text-xs text-muted">({EMPLOYMENT_TYPE_LABEL[g.employmentType]})</span>
            </span>
            {typeSelect("guaranteed", g.id, g.claimType)}
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Flexible basket</h3>
      <ul className="mt-1 divide-y divide-line">
        {catalogItems.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm text-ink">
              {c.name}
              {c.isMedical ? <span className="ml-1 text-xs text-muted">(cover — usually Automatic)</span> : null}
            </span>
            {typeSelect("catalog", c.id, c.claimType)}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Benefits</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Benefits configuration</h1>
        </div>
        <PlanYearDialog planYears={planYears} activeName={active?.name} />
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <AdminBenefitsTabs
        tabs={[
          { id: "config", label: "Configuration", node: configPanel },
          { id: "submissions", label: "Submissions & claims", badge: pendingClaims.length, node: submissionsPanel },
          { id: "requirements", label: "Claim requirements", node: requirementsPanel },
        ]}
      />
    </div>
  );
}
