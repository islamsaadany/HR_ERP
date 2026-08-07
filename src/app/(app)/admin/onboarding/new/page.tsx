import { requireAdmin } from "@/lib/roles";
import { ActivityForm } from "@/components/admin/ActivityForm";
import { BackLink } from "@/components/admin/BackLink";
import { createActivity } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewActivityPage() {
  await requireAdmin();
  return (
    <div>
      <BackLink href="/admin/onboarding" label="Onboarding" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Onboarding</p>
      <h1 className="mt-1 mb-6 font-serif text-3xl text-ink">New activity</h1>
      <ActivityForm
        action={createActivity}
        submitLabel="Create activity"
        values={{ title: "", description: null, type: "ACTION", stage: "Week 1", track: "COMMON_CORE", linkUrl: null, order: 0, active: true }}
      />
    </div>
  );
}
