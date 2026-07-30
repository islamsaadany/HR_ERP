import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { HandbookBrowser } from "@/components/HandbookBrowser";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function HandbookPage() {
  await requireUser();
  const [sections, resources] = await Promise.all([
    prisma.handbookSection.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      select: { slug: true, title: true, summary: true },
    }),
    prisma.resource.findMany({ orderBy: [{ category: "asc" }, { order: "asc" }] }),
  ]);

  // group resources by category
  const byCat = new Map<string, typeof resources>();
  for (const r of resources) {
    const list = byCat.get(r.category) ?? [];
    list.push(r);
    byCat.set(r.category, list);
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Handbook &amp; Resources
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Handbook</h1>
      <p className="mt-1 text-muted">Look anything up — company, process, and policies.</p>

      <div className="mt-6">
        {sections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
            The handbook is being prepared.
          </div>
        ) : (
          <HandbookBrowser sections={sections} />
        )}
      </div>

      <h2 className="mt-12 font-serif text-2xl text-ink">Resources</h2>
      <p className="mt-1 text-muted">Downloadable company files.</p>
      {resources.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No resources yet.</p>
      ) : (
        <div className="mt-4 space-y-6">
          {Array.from(byCat.entries()).map(([cat, list]) => (
            <div key={cat}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{cat}</h3>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-surface">
                {list.map((r) => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <a href={`/api/resources/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-navy-700 hover:underline">
                        {r.title}
                      </a>
                      <div className="text-xs text-muted">{formatDate(r.createdAt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
