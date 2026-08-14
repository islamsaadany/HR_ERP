import { requireSuperUser } from "@/lib/roles";
import { getBusinessUnitsWithUsage } from "@/lib/business-units";
import { BusinessUnitsManager } from "@/components/admin/BusinessUnitsManager";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

export default async function AdminBusinessUnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  await requireSuperUser();
  const { saved, error } = await searchParams;
  const units = await getBusinessUnitsWithUsage();

  return (
    <div className="max-w-3xl">
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Business Units</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Business Units</h1>
      <p className="mt-1 text-muted">
        Each unit is a group company with its own name, logo, and brand colors. Employees see their own unit&apos;s
        brand across the app; Admin, HR, and Finance keep the same access — only the look changes. Unset employees use
        the deployment default brand.
      </p>

      {saved ? (
        <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-sm text-navy-700">Business units saved.</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <BusinessUnitsManager units={units} />
    </div>
  );
}
