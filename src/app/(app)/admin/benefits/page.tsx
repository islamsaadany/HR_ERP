import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate, EMPLOYMENT_TYPE_LABEL } from "@/lib/labels";
import { CLAIM_TYPE_LABEL } from "@/lib/benefits/claims";
import {
  createPlanYear,
  setPlanYearStatus,
  reopenSelection,
  resetSelection,
  setClaimType,
  releaseClaim,
  rejectClaim,
} from "./actions";

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

  const [selections, pendingClaims, guaranteedBenefits, catalogItems] = await Promise.all([
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
  ]);

  const typeSelect = (kind: string, id: string, current: string) => (
    <form action={setClaimType} className="flex items-center gap-1.5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <select name="claimType" defaultValue={current} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
        {CLAIM_TYPES.map((t) => (
          <option key={t} value={t}>{CLAIM_TYPE_LABEL[t]}</option>
        ))}
      </select>
      <button className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-50">Set</button>
    </form>
  );

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Benefits</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Benefits configuration</h1>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Plan years */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Plan-year window</h2>
        <ul className="divide-y divide-line">
          {planYears.length === 0 ? <li className="py-2 text-sm text-muted">No plan years yet.</li> : null}
          {planYears.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-3">
              <div>
                <span className="font-medium text-ink">{p.name}</span>
                <span className={"ml-2 rounded-full px-2 py-0.5 text-xs font-semibold " + (p.status === "OPEN" ? "bg-navy-50 text-navy-700" : "bg-gray-100 text-muted")}>{p.status}</span>
              </div>
              <form action={setPlanYearStatus}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="status" value={p.status === "OPEN" ? "CLOSED" : "OPEN"} />
                <button className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50">
                  {p.status === "OPEN" ? "Close" : "Open"}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={createPlanYear} className="mt-4 flex items-end gap-2">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-1">New plan year</label>
            <input name="name" placeholder="e.g. 2027" className="rounded-lg border border-line px-3 py-2 text-sm" />
          </div>
          <button className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">Open new year</button>
        </form>
      </section>

      {/* Claims to review */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
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
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
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

      {/* Claim requirements */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
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
    </div>
  );
}
