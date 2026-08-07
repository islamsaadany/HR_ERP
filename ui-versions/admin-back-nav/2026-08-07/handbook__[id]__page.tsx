import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { SectionForm } from "@/components/admin/SectionForm";
import { updateSection } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const s = await prisma.handbookSection.findUnique({ where: { id } });
  if (!s) notFound();

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Handbook
      </p>
      <h1 className="mt-1 mb-6 font-serif text-3xl text-ink">Edit section</h1>
      <SectionForm
        action={updateSection.bind(null, id)}
        submitLabel="Save changes"
        values={{
          title: s.title,
          slug: s.slug,
          summary: s.summary,
          body: s.body,
          order: s.order,
          active: s.active,
        }}
      />
    </div>
  );
}
