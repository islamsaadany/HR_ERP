import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { createPlanYear, setPlanYearStatus, reopenSelection } from "./actions";

export const dynamic = "force-dynamic";
const egp = (n: number) => "EGP " + n.toLocaleString();

export default async function AdminBenefitsPage() {
  await requireAdmin();
  const planYears = await prisma.planYear.findMany({ orderBy: { createdAt: "desc" } });
  const active = planYears.find((p) => p.status === "OPEN") ?? planYears[0];

  const selections = active
    ? await prisma.benefitSelection.findMany({
        where: { planYearId: active.id },
        include: { user: { select: { name: true } }, lines: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Benefits</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Benefits configuration</h1>

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
        <p className="mt-3 text-xs text-muted">Pool ceilings, guaranteed amounts, medical rate card, and the catalog are seeded (`003_seed_benefits.sql`). Editing UI for those is a follow-up.</p>
      </section>

      {/* Submissions */}
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="mb-4 font-serif text-lg text-ink">Submissions {active ? `· ${active.name}` : ""}</h2>
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
                        {s.status === "SUBMITTED" ? (
                          <form action={reopenSelection}>
                            <input type="hidden" name="id" value={s.id} />
                            <button className="text-sm font-medium text-navy-600 hover:text-navy-800">Reopen</button>
                          </form>
                        ) : null}
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
}
