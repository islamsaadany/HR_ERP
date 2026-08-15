import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { groupByStage, TRACK_LABEL } from "@/lib/onboarding";
import { deleteActivity } from "./actions";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

export default async function AdminOnboardingPage() {
  await requireAdmin();
  const activities = await prisma.onboardingActivity.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div>
      <BackLink href="/admin" label="Admin" />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
            Admin · Onboarding
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Onboarding content</h1>
          <p className="mt-1 text-muted">{activities.length} activities</p>
        </div>
        <Link href="/admin/onboarding/new" className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700">
          + New activity
        </Link>
      </div>

      <div className="mt-8 space-y-8">
        {groupByStage(activities).map(({ stage, items }) => {
          return (
            <section key={stage}>
              <h2 className="font-serif text-lg text-ink">{stage}</h2>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{a.title}</span>
                        <span className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-navy-700">
                          {a.type === "POLICY" ? "Read" : "Do"}
                        </span>
                        <span className="text-[10px] text-muted">{TRACK_LABEL[a.track]}</span>
                        {!a.active ? <span className="text-[10px] text-red-500">hidden</span> : null}
                      </div>
                      {a.description ? <p className="truncate text-sm text-muted">{a.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Link href={`/admin/onboarding/${a.id}`} className="text-sm font-medium text-navy-600 hover:text-navy-800">Edit</Link>
                      <form action={deleteActivity}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-sm text-muted hover:text-red-600">Delete</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {activities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
            No activities yet. Add the first one.
          </div>
        ) : null}
      </div>
    </div>
  );
}
