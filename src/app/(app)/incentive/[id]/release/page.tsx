import Link from "next/link";
import { notFound } from "next/navigation";
import { requireIncentiveAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { loadCycleReport } from "@/lib/incentive/load";
import { payoutLines, isReleasable, type PayoutLine } from "@/lib/incentive/payouts";
import { releasableUnitIds, headsForUnit } from "@/lib/finance/unit-heads";
import { confirmersForUnit } from "@/lib/finance/confirmers";
import { ReleasePanel } from "@/components/incentive/ReleasePanel";
import { BlockedLines } from "@/components/incentive/BlockedLines";

export const dynamic = "force-dynamic";

/**
 * Choosing what to release from a cycle (spec 009 FR-006g).
 *
 * One card per business unit, because a release becomes one transaction in one bank
 * account: mixing two units is not something the operator has to avoid, it is not offered.
 * A unit somebody else heads is shown read-only so the whole cycle can be seen — you can
 * look at it, you cannot send it.
 */
export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireIncentiveAccess();
  const { id } = await params;

  const cycle = await loadCycleReport(id);
  if (!cycle) notFound();

  const [lines, mine, units] = await Promise.all([
    payoutLines(id, cycle.report),
    releasableUnitIds(viewer.id),
    prisma.businessUnit.findMany({
      select: { id: true, name: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
  ]);

  const byUnit = new Map<string, PayoutLine[]>();
  const blocked: PayoutLine[] = [];
  for (const l of lines) {
    if (l.blocked) blocked.push(l);
    else byUnit.set(l.businessUnitId!, [...(byUnit.get(l.businessUnitId!) ?? []), l]);
  }

  // Only units that actually have something in this cycle are worth drawing.
  const shown = units.filter((u) => (byUnit.get(u.id) ?? []).length > 0);

  const people = await Promise.all(
    shown.map(async (u) => ({
      id: u.id,
      heads: await headsForUnit(u.id),
      confirmers: await confirmersForUnit(u.id),
    }))
  );
  const peopleFor = new Map(people.map((p) => [p.id, p]));

  return (
    <div className="max-w-5xl">
      <Link href={`/incentive/${id}`} className="text-sm text-muted hover:text-ink">
        ← {cycle.label}
      </Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Super User · Confidential
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Release payments</h1>
      <p className="mt-2 max-w-prose text-sm text-muted">
        Releasing puts a payment in Finance&rsquo;s queue — money the company has agreed it owes. Nobody
        is paid, and nobody is told, until the transaction is confirmed at the bank.
      </p>

      {blocked.length > 0 ? <BlockedLines lines={blocked} cycleId={id} /> : null}

      {shown.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          There is nothing to release in this cycle yet.
        </p>
      ) : null}

      {shown.map((u) => {
        const unitLines = (byUnit.get(u.id) ?? []).filter((l) => isReleasable(l) || l.released);
        const p = peopleFor.get(u.id);
        return (
          <ReleasePanel
            key={u.id}
            cycleId={id}
            businessUnitId={u.id}
            businessUnitName={u.name}
            yours={mine.includes(u.id)}
            headNames={(p?.heads ?? []).map((h) => h.name)}
            confirmerNames={(p?.confirmers ?? []).map((c) => c.name ?? c.email)}
            lines={unitLines.map((l) => ({
              key: l.key,
              personName: l.personName,
              matchedName: l.matchedName,
              employeeId: l.employeeId,
              kind: l.kind,
              amount: l.amount,
              nameMismatch: l.nameMismatch,
              released: l.released ? { amount: l.released.amount, confirmed: l.released.confirmed } : null,
            }))}
          />
        );
      })}
    </div>
  );
}
