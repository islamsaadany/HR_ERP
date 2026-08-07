import { requireAdmin } from "@/lib/roles";
import { SectionForm } from "@/components/admin/SectionForm";
import { createSection } from "../actions";
export const dynamic = "force-dynamic";
export default async function NewSectionPage() {
  await requireAdmin();
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin · Handbook</p>
      <h1 className="mt-1 mb-6 font-serif text-3xl text-ink">New section</h1>
      <SectionForm action={createSection} submitLabel="Create section" values={{ title: "", slug: null, summary: null, body: "", order: 0, active: true }} />
    </div>
  );
}
