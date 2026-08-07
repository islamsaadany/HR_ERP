import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { computeCycle, type CycleAssignment } from "@/lib/incentive/compute";
import type { AssignmentType } from "@/lib/incentive/rules";
import { CycleReportView } from "@/components/incentive/CycleReport";
import { FirmFiguresCard } from "@/components/incentive/FirmFiguresCard";
import { saveFirmFigures, uploadSheet } from "../actions";

export const dynamic = "force-dynamic";

export default async function CyclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warn?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { id } = await params;
  const { warn, error } = await searchParams;

  const cycle = await prisma.incentiveCycle.findUnique({
    where: { id },
    include: { people: true, assignments: true, contributions: true },
  });
  if (!cycle) notFound();

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
    { revenue: cycle.revenue, deliveryCost: cycle.deliveryCost, totalExpenses: cycle.totalExpenses }
  );

  const saveFirm = saveFirmFigures.bind(null, cycle.id);

  const uploads: { kind: "people" | "assignments" | "contributions"; label: string; count: number }[] = [
    { kind: "people", label: "People", count: cycle.people.length },
    { kind: "assignments", label: "Assignments", count: cycle.assignments.length },
    { kind: "contributions", label: "Contributions", count: cycle.contributions.length },
  ];

  return (
    <div>
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
            <div className="flex gap-2 text-xs">
              <a href="/api/incentive/template/people" className="text-navy-700 hover:underline">people</a>
              <a href="/api/incentive/template/assignments" className="text-navy-700 hover:underline">assignments</a>
              <a href="/api/incentive/template/contributions" className="text-navy-700 hover:underline">contributions</a>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted">Download a template, fill it, upload it back. Re-uploading replaces that sheet.</p>
          <div className="mt-3 space-y-2">
            {uploads.map((u) => (
              <form key={u.kind} action={uploadSheet.bind(null, cycle.id, u.kind)} encType="multipart/form-data" className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-sm text-ink">{u.label}<span className="text-muted"> ({u.count})</span></span>
                <input type="file" name="file" accept=".csv,text/csv" className="min-w-0 flex-1 text-xs text-muted file:mr-2 file:rounded file:border-0 file:bg-navy-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white" />
                <button className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50">Upload</button>
              </form>
            ))}
          </div>
        </div>
      </div>

      {cycle.people.length === 0 && cycle.assignments.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          Upload the people, assignments, and contributions sheets to see the computed payout.
        </p>
      ) : (
        <CycleReportView report={report} />
      )}
    </div>
  );
}
