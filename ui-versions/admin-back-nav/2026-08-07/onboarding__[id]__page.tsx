import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ActivityForm } from "@/components/admin/ActivityForm";
import { updateActivity } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const a = await prisma.onboardingActivity.findUnique({ where: { id } });
  if (!a) notFound();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Onboarding
      </p>
      <h1 className="mt-1 mb-6 font-serif text-3xl text-ink">Edit activity</h1>
      <ActivityForm
        action={updateActivity.bind(null, id)}
        submitLabel="Save changes"
        values={{
          title: a.title,
          description: a.description,
          type: a.type,
          stage: a.stage,
          track: a.track,
          linkUrl: a.linkUrl,
          order: a.order,
          active: a.active,
        }}
      />
    </div>
  );
}
