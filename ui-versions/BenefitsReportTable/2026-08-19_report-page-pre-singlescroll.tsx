import { requireBenefitsReporting, isAdmin } from "@/lib/roles";
import { listCycles, defaultCycleId, cycleReport } from "@/lib/benefits/report";
import { BackLink } from "@/components/admin/BackLink";
import { BenefitsReportTable } from "@/components/admin/BenefitsReportTable";

export const dynamic = "force-dynamic";

/**
 * Benefits Reporting (spec 034) — the read-only cycle overview for HR Admin / Finance /
 * Super User. All computation lives in lib/benefits/report (the same engine primitives
 * the claim path enforces); this page just picks the cycle and hands the rows to the
 * client table. Mockup signed off 2026-08-18.
 */
export default async function BenefitsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const me = await requireBenefitsReporting();
  const { cycle } = await searchParams;
  const cycles = await listCycles();
  const selectedId = cycles.find((c) => c.id === cycle)?.id ?? defaultCycleId(cycles);
  const report = selectedId ? await cycleReport(selectedId) : null;

  return (
    <div>
      {/* Finance can't open Benefits Management — send them back where they came from. */}
      {isAdmin(me.role) ? (
        <BackLink href="/admin/benefits" label="Benefits Management" />
      ) : (
        <BackLink href="/finance" label="Payments" />
      )}
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Benefits
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Benefits Reporting</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Where the whole company stands this cycle — computed by the same engine that enforces
        claims, so every row matches the employee&apos;s own Benefits page. Read-only.
        {report?.planYear.window ? (
          <>
            {" "}
            Cycle window: <span className="font-medium text-ink">{report.planYear.window}</span>.
          </>
        ) : null}
      </p>

      {!report ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          There is no benefits cycle to report on yet. Open a plan year in Benefits Management
          and this page will fill in on its own.
        </div>
      ) : (
        <BenefitsReportTable
          rows={report.rows}
          cycleName={report.planYear.name}
          departments={report.departments}
          cycles={cycles.map((c) => ({
            id: c.id,
            label: `${c.name}${c.status === "OPEN" ? " (open)" : ""}`,
          }))}
          selectedCycleId={report.planYear.id}
        />
      )}
    </div>
  );
}
