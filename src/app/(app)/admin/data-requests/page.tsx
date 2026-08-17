import Link from "next/link";
import { requireDataRequestManager } from "@/lib/roles";
import { listCampaigns } from "@/lib/profile/campaigns";
import { campaignFieldLabel } from "@/lib/profile/campaign-fields";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** Campaign list (spec 033): every data request, newest first, with completion at a glance. */
export default async function DataRequestsPage() {
  await requireDataRequestManager();
  const campaigns = await listCampaigns();

  return (
    <div className="max-w-4xl">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl text-ink">Data requests</h1>
        <Link
          href="/admin/data-requests/new"
          className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700"
        >
          New request
        </Link>
      </div>
      <p className="mt-2 text-muted">
        Ask the team to fill or verify profile fields. Targeted employees see a popup and a
        sidebar reminder until they answer; answers write straight to the registry.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {campaigns.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
            No requests yet. Create one to start collecting.
          </p>
        ) : (
          campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/admin/data-requests/${c.id}`}
              className="rounded-xl border border-line bg-surface p-5 transition hover:border-navy-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-lg text-ink">{c.title}</span>
                    {c.closedAt ? (
                      <span className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[11px] font-bold text-muted">
                        Closed
                      </span>
                    ) : (
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[11px] font-bold text-green-700">
                        Open
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {c.fields.map(campaignFieldLabel).join(" · ")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {c.audience} · launched {formatDate(c.createdAt)} by {c.createdBy}
                  </p>
                </div>
                <span className="rounded-full bg-navy-50 px-3 py-1.5 text-sm font-bold text-navy-700">
                  {c.completed} / {c.targeted} complete
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      <Link href="/admin" className="mt-8 inline-block text-sm text-muted hover:text-ink">
        ← Back to Admin
      </Link>
    </div>
  );
}
