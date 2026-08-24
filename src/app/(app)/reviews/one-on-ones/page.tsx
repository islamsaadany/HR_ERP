import Link from "next/link";
import { requireRealUser } from "@/lib/reviews/access";
import { requireModuleEnabled } from "@/lib/modules";
import { formatDate } from "@/lib/labels";
import { currentManagerOf, currentReportsOf, myOneOnOnes } from "@/lib/reviews/queries";
import { NewOneOnOneForm } from "@/components/reviews/NewOneOnOneForm";

export const dynamic = "force-dynamic";

export default async function OneOnOnesPage() {
  const me = await requireRealUser();
  await requireModuleEnabled("reviews");

  const [manager, reports, records] = await Promise.all([
    currentManagerOf(me.id),
    currentReportsOf(me.id),
    myOneOnOnes(me.id),
  ]);

  // 1:1s are between a manager and their direct report. Anyone else is not an
  // option here, and the server refuses it too.
  const counterparts = [
    ...(manager ? [{ id: manager.id, name: manager.name }] : []),
    ...reports.map((r) => ({ id: r.id, name: r.name })),
  ];

  return (
    <div className="max-w-3xl">
      <Link href="/reviews" className="text-xs font-semibold text-navy-600 hover:underline">
        ← Reviews
      </Link>

      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Reviews &amp; 1:1s
      </p>
      <h1 className="mt-1 font-serif text-2xl text-navy-900">1:1s</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        Held whenever something needs a conversation, rather than waiting for the quarter.
        Both of you write; the outcome is agreed by both, and then it can be brought to the
        review.
      </p>

      {counterparts.length === 0 ? (
        <p className="mt-5 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          You have no manager and no direct reports, so there is nobody to hold a 1:1 with
          here.
        </p>
      ) : (
        <div className="mt-5">
          <NewOneOnOneForm counterparts={counterparts} />
        </div>
      )}

      {records.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-muted">
          No 1:1s recorded yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {records.map((r) => {
            const other = r.employeeId === me.id ? r.manager : r.employee;
            return (
              <li key={r.id}>
                <Link
                  href={`/reviews/one-on-ones/${r.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-navy-50"
                >
                  <span className="min-w-[84px] shrink-0 tabular-nums text-muted">
                    {formatDate(r.heldOn)}
                  </span>
                  <span className="font-semibold text-navy-900">{other.name}</span>
                  <span className="text-xs text-muted">
                    {r._count.notes} {r._count.notes === 1 ? "note" : "notes"}
                  </span>
                  <span
                    className={`ml-auto rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                      r.finalAt
                        ? "border-green-200 bg-green-50 text-green-700"
                        : r.outcome
                          ? "border-gold-300 bg-gold-100 text-gold-800"
                          : "border-line bg-paper text-muted"
                    }`}
                  >
                    {r.finalAt ? "Agreed" : r.outcome ? "Not agreed yet" : "No outcome"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
