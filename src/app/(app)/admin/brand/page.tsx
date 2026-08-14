import { requireSuperUser } from "@/lib/roles";
import { getBusinessUnitsWithUsage } from "@/lib/business-units";
import { BackLink } from "@/components/admin/BackLink";
import { BusinessUnitsManager } from "@/components/admin/BusinessUnitsManager";

export const dynamic = "force-dynamic";

export default async function AdminBrandPage() {
  await requireSuperUser();
  const units = await getBusinessUnitsWithUsage();

  return (
    <div className="max-w-3xl">
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Branding</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Branding</h1>
      <p className="mt-1 text-muted">
        Each business unit has its own name, colors, and logo — an employee assigned to a unit sees its brand. Mark one
        unit <strong>Default</strong> (the <em>Make default</em> button) and its brand is shown to anyone not assigned to
        a unit, on the sign-in page, and as the app icon. Admin, HR, and Finance keep the same access — only the look
        changes.
      </p>

      <BusinessUnitsManager units={units} />
    </div>
  );
}
