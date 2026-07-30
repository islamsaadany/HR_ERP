import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ArticleRenderer } from "@/components/knowledge/ArticleRenderer";

export const dynamic = "force-dynamic";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireUser();
  const { slug } = await params;
  const section = await prisma.handbookSection.findFirst({
    where: { slug, active: true },
  });
  if (!section) notFound();

  return (
    <article className="max-w-3xl">
      <Link href="/handbook" className="text-sm text-muted hover:text-ink">
        ← Handbook
      </Link>
      <h1 className="mt-3 font-serif text-3xl text-ink">{section.title}</h1>
      {section.summary ? (
        <p className="mt-2 text-lg text-muted">{section.summary}</p>
      ) : null}
      <div className="mt-6">
        {section.body ? (
          <ArticleRenderer body={section.body} />
        ) : (
          <p className="text-[15px] text-muted">Content coming soon.</p>
        )}
      </div>
      {section.actionHref && section.actionLabel ? (
        <div className="mt-6">
          <Link
            href={section.actionHref}
            className="inline-flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
          >
            {section.actionLabel} <span aria-hidden>→</span>
          </Link>
        </div>
      ) : null}
    </article>
  );
}
