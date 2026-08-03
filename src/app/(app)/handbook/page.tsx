import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/labels";
import { HandbookExplorer } from "@/components/HandbookExplorer";

export const dynamic = "force-dynamic";

export default async function HandbookPage() {
  await requireUser();
  await requireModuleEnabled("handbook");
  const [sections, resources] = await Promise.all([
    prisma.handbookSection.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      select: { slug: true, title: true, summary: true, body: true, actionLabel: true, actionHref: true },
    }),
    prisma.resource.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] }),
  ]);

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Handbook &amp; Resources
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Handbook</h1>
      <p className="mt-1 text-muted">Look anything up — company, process, and policies.</p>

      <div className="mt-8">
        {sections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
            The handbook is being prepared.
          </div>
        ) : (
          <HandbookExplorer
            sections={sections.map((s) => ({
              slug: s.slug,
              title: s.title,
              summary: s.summary,
              body: s.body ?? "",
              actionLabel: s.actionLabel,
              actionHref: s.actionHref,
            }))}
            resources={resources.map((r) => ({
              id: r.id,
              title: r.title,
              category: r.category,
              dateLabel: formatDate(r.createdAt),
            }))}
          />
        )}
      </div>
    </div>
  );
}
