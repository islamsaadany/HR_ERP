import Link from "next/link";
import { notFound } from "next/navigation";
import { requireIncentiveAccess } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { computeCycle, type CycleAssignment } from "@/lib/incentive/compute";
import { getIncentiveConfig } from "@/lib/incentive/config";
import type { AssignmentType } from "@/lib/incentive/rules";
import { CycleReportView } from "@/components/incentive/CycleReport";
import { FirmFiguresCard } from "@/components/incentive/FirmFiguresCard";
import { SheetUpload } from "@/components/incentive/SheetUpload";
import { DownloadTemplates } from "@/components/incentive/DownloadTemplates";
import { saveFirmFigures } from "../actions";
import { canReleaseAnything } from "@/lib/finance/unit-heads";
import { payoutLines } from "@/lib/incentive/payouts";

export const dynamic = "force-dynamic";

export default async function CyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warn?: string; error?: string }>;
}) {
  const viewer = await requireIncentiveAccess();
  const { id } = await params;
  const { warn, error } = await searchParams;

  const cycle = await prisma.incentiveCycle.findUnique({
    where: { id },
    include: { people: true, assignments: true, contributions: true },
  });
  if (!cycle) notFound();

  const incentiveConfig = await getIncentiveConfig();

  const report = computeCycle(
    cycle.people.map((p) => ({
      name: p.name,
      role: p.role,
      netMonthlySalary: p.netMonthlySalary,
      eligibleToLead: p.eligibleToLead,
      utilization: p.utilization,
    })),
    cycle.assignments.map(
      (a): CycleAssignment => ({
        client: a.client,
        type: a.type as AssignmentType,
        lead: a.lead,
        bd: a.bd,
        leadSource: a.leadSource,
        revenue: a.revenue,
        directCost: a.directCost,
        vendorCost: a.vendorCost,
        markupPct: a.markupPct,
        status: a.status,
      })
    ),
    cycle.contributions.map((c) => ({ client: c.client, person: c.person, share: c.share })),
    { revenue: cycle.revenue, deliveryCost: cycle.deliveryCost, totalExpenses: cycle.totalExpenses },
    incentiveConfig
  );

  const saveFirm = saveFirmFigures.bind(null, cycle.id);

  // What each person's two payable halves are doing, for the Payment column — and whether
  // this viewer heads any unit at all, which decides if the Release door is even drawn.
  const [canRelease, lines] = await Promise.all([
    canReleaseAnything(viewer.id),
    payoutLines(cycle.id, report),
  ]);
  const paymentState: Record<string, "blocked" | "released" | "paid" | "open"> = {};
  for (const l of lines) {
    paymentState[l.key] = l.blocked
      ? "blocked"
      : l.released?.confirmed
      ? "paid"
      : l.released
      ? "released"
      : "open";
  }

  const uploads: { kind: "people" | "assignments" | "contributions"; label: string; count: number }[] = [
    { kind: "people", label: "People", count: cycle.people.length },
    { kind: "assignments", label: "Assignments", count: cycle.assignments.length },
    { kind: "contributions", label: "Contributions", count: cycle.contributions.length },
  ];

  const hasData = cycle.people.length > 0 || cycle.assignments.length > 0;

  return (
    <div>
      {/* Header + inputs stay at the normal reading width; only the wide report
          tables below break out to the full-width page (see AppShell). */}
      <div className="max-w-6xl">
        <Link href="/incentive" className="text-sm text-muted hover:text-ink">← Incentive Scheme</Link>
        <div className="mt-2 flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Super User · Confidential</p>
        </div>
        <h1 className="mt-1 font-serif text-3xl text-ink">{cycle.label}</h1>

        {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}
        {warn ? <p className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">Uploaded with notes: {warn}</p> : null}

        {/* Inputs: firm figures + sheet uploads */}
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <FirmFiguresCard
            revenue={cycle.revenue}
            deliveryCost={cycle.deliveryCost}
            totalExpenses={cycle.totalExpenses}
            action={saveFirm}
          />

          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-ink">Upload sheets (CSV)</div>
              <DownloadTemplates cycleId={cycle.id} />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Templates come pre-filled from what we already hold — people from the Consulting &amp; Data teams,
              and clients carried from the previous cycle. Fill the remaining columns and upload it back;
              re-uploading replaces that sheet.
            </p>
            <div className="mt-3 space-y-3">
              {uploads.map((u) => (
                <SheetUpload key={u.kind} cycleId={cycle.id} kind={u.kind} label={u.label} count={u.count} />
              ))}
            </div>
          </div>
        </div>

        {!hasData ? (
          <p className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            Upload the people, assignments, and contributions sheets to see the computed payout.
          </p>
        ) : null}
      </div>

      {hasData ? (
        <CycleReportView
          report={report}
          cycleId={cycle.id}
          canRelease={canRelease}
          paymentState={paymentState}
          review={{
            people: cycle.people.map((p) => ({
              // The id travels to the browser so an edited row can be matched back
              // to its stored row — that is what carries the two retired columns
              // (eligibleToLead, utilization) across a save.
              id: p.id,
              name: p.name,
              employeeId: p.employeeId,
              role: p.role,
              netMonthlySalary: p.netMonthlySalary,
              startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
            })),
            assignments: cycle.assignments.map((a) => ({
              id: a.id,
              client: a.client,
              type: a.type,
              lead: a.lead,
              bd: a.bd,
              leadSource: a.leadSource,
              revenue: a.revenue,
              directCost: a.directCost,
              vendorCost: a.vendorCost,
              markupPct: a.markupPct,
              startDate: a.startDate ? a.startDate.toISOString().slice(0, 10) : null,
              closeDate: a.closeDate ? a.closeDate.toISOString().slice(0, 10) : null,
              status: a.status,
            })),
            contributions: cycle.contributions.map((c) => ({ client: c.client, person: c.person, share: c.share })),
          }}
        />
      ) : null}
    </div>
  );
}
