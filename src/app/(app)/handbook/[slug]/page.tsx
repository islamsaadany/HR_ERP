import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

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
      <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
        {section.body || "Content coming soon."}
      </div>
    </article>
  );
}
