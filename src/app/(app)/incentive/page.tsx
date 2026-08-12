import Link from "next/link";
import { requireIncentiveAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { createCycle, deleteCycle } from "./actions";

export const dynamic = "force-dynamic";

export default async function IncentiveHome({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireIncentiveAccess();
  const { error } = await searchParams;
  const cycles = await prisma.incentiveCycle.findMany({ orderBy: { createdAt: "desc" } });

  const input =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Confidential · Super User &amp; Finance</p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Incentive Scheme</h1>
          <p className="mt-1 text-muted">
            Partner-compensation cycles (Business Partner Fee, Commission, Profit Share). Upload the four
            sheets per cycle; all figures are computed server-side.
          </p>
        </div>
        <Link
          href="/incentive/how-it-works"
          className="mt-1 flex-none rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-50"
        >
          How it works
        </Link>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

      <form action={createCycle} className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">New cycle label</label>
          <input name="label" placeholder="H1-2026" className={input} />
        </div>
        <button type="submit" className="rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700">
          Create cycle
        </button>
      </form>

      <div className="mt-6 space-y-2">
        {cycles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            No cycles yet. Create one to upload its sheets.
          </p>
        ) : (
          cycles.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4">
              <Link href={`/incentive/${c.id}`} className="min-w-0">
                <div className="font-medium text-ink">{c.label}</div>
                <div className="text-xs text-muted">
                  {c.status === "final" ? "Final" : "Draft"} · created {c.createdAt.toISOString().slice(0, 10)}
                </div>
              </Link>
              <form action={deleteCycle}>
                <input type="hidden" name="id" value={c.id} />
                <button className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-red-300 hover:text-red-600">
                  Delete
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
