import { notFound } from "next/navigation";
import { requireDataRequestManager } from "@/lib/roles";
import { campaignTracker } from "@/lib/profile/campaigns";
import { campaignField, campaignFieldLabel } from "@/lib/profile/campaign-fields";
import { formatDate } from "@/lib/labels";
import { closeCampaign } from "../actions";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

const CHIP: Record<string, string> = {
  PENDING: "border border-line bg-paper text-muted",
  FILLED: "border border-green-200 bg-green-50 text-green-700",
  CONFIRMED: "border border-green-200 bg-green-50 text-green-700",
  CORRECTED: "border border-gold-300 bg-gold-100 text-gold-800",
};
const CHIP_LABEL: Record<string, string> = {
  PENDING: "Pending",
  FILLED: "Filled",
  CONFIRMED: "Confirmed",
  CORRECTED: "Corrected",
};

/** The tracker (spec 033, US2): who still owes what, per field, with the entered values. */
export default async function DataRequestTrackerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDataRequestManager();
  const { id } = await params;
  const campaign = await campaignTracker(id);
  if (!campaign) notFound();

  const active = campaign.targets.filter((t) => t.user.status === "ACTIVE");
  const left = campaign.targets.filter((t) => t.user.status !== "ACTIVE");
  const completed = active.filter((t) => t.fields.every((f) => f.status !== "PENDING"));

  return (
    <div>
      <BackLink href="/admin/data-requests" label="Data requests" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Data requests
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl text-ink">{campaign.title}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-navy-50 px-3 py-1.5 text-sm font-bold text-navy-700">
            {completed.length} / {active.length} complete
          </span>
          <a
            href={`/api/admin/data-requests/${campaign.id}/export`}
            className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Download CSV
          </a>
          {campaign.closedAt ? (
            <span className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-bold text-muted">
              Closed {formatDate(campaign.closedAt)}
            </span>
          ) : (
            <form action={closeCampaign}>
              <input type="hidden" name="id" value={campaign.id} />
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-red-300 hover:text-red-600"
              >
                Close campaign
              </button>
            </form>
          )}
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        {campaign.audience} · launched {formatDate(campaign.createdAt)} by{" "}
        {campaign.createdBy?.name ?? "—"}. Answers are already on the employee records — this
        page is the receipt, not an approval queue.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr>
              <th className="bg-navy-800 px-4 py-2.5 text-left font-semibold text-white">Employee</th>
              {campaign.fields.map((key) => (
                <th key={key} className="bg-navy-800 px-4 py-2.5 text-left font-semibold text-white">
                  {campaignFieldLabel(key)}
                </th>
              ))}
              <th className="bg-navy-800 px-4 py-2.5 text-left font-semibold text-white">Status</th>
            </tr>
          </thead>
          <tbody>
            {active.map((t) => {
              const done = t.fields.every((f) => f.status !== "PENDING");
              return (
                <tr key={t.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{t.user.name}</div>
                    <div className="text-xs text-muted">{t.user.email}</div>
                  </td>
                  {campaign.fields.map((key) => {
                    const f = t.fields.find((x) => x.field === key);
                    if (!f) return <td key={key} className="px-4 py-3 text-muted">—</td>;
                    return (
                      <td key={key} className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${CHIP[f.status]}`}>
                          {CHIP_LABEL[f.status]}
                        </span>
                        {f.value != null && f.status !== "PENDING" ? (
                          <div className="mt-1 max-w-[260px] break-words text-xs text-ink">
                            {campaignField(key)?.display(f.value) ?? f.value}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        done
                          ? "border border-green-200 bg-green-50 text-green-700"
                          : "border border-line bg-paper text-muted"
                      }`}
                    >
                      {done ? "Complete" : "Pending"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {left.length > 0 ? (
        <p className="mt-3 text-xs text-muted">
          {left.length} previously targeted {left.length === 1 ? "person has" : "people have"} left
          the company and no longer count toward completion.
        </p>
      ) : null}
    </div>
  );
}
