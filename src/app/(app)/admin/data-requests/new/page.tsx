import { requireDataRequestManager } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { CAMPAIGN_FIELDS } from "@/lib/profile/campaign-fields";
import { CampaignComposer } from "@/components/admin/CampaignComposer";
import { BackLink } from "@/components/admin/BackLink";

export const dynamic = "force-dynamic";

/** Compose a new data request (spec 033, US2). */
export default async function NewDataRequestPage() {
  await requireDataRequestManager();

  const [departments, employees] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE", department: { not: null } },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, department: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <BackLink href="/admin/data-requests" label="Data requests" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Data requests
      </p>
      <h1 className="mt-1 mb-2 font-serif text-3xl text-ink">New data request</h1>
      <p className="mb-6 max-w-2xl text-muted">
        Pick the fields and who to ask. Everyone targeted sees a popup on their next visit and a
        sidebar reminder until they answer; answers write straight to their profile and the
        registry.
      </p>
      <CampaignComposer
        fields={CAMPAIGN_FIELDS.map((f) => ({ key: f.key, label: f.label }))}
        departments={departments.map((d) => d.department!)}
        employees={employees}
      />
    </div>
  );
}
