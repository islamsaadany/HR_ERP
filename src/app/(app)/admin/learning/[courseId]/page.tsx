import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { BackLink } from "@/components/admin/BackLink";
import { CourseBuilder, type BuilderSection } from "@/components/learning/CourseBuilder";

export const dynamic = "force-dynamic";

/**
 * The course builder. Content only in this release — the Access and People tabs land with US2 and
 * US4, and are deliberately absent rather than stubbed, so nothing on screen implies a capability
 * that is not there yet.
 */
export default async function CourseBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  await requireAdmin();
  const { courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      summary: true,
      status: true,
      sections: {
        where: { deletedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          lessons: {
            where: { deletedAt: null },
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              isRequired: true,
              estimatedMinutes: true,
              minWatchPercent: true,
              blocks: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  type: true,
                  text: true,
                  externalUrl: true,
                  videoSource: true,
                  fileName: true,
                },
              },
              _count: { select: { checkpoints: true } },
            },
          },
        },
      },
    },
  });
  if (!course) notFound();

  const sections: BuilderSection[] = course.sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      isRequired: l.isRequired,
      estimatedMinutes: l.estimatedMinutes,
      minWatchPercent: l.minWatchPercent,
      blocks: l.blocks,
      checkpointCount: l._count.checkpoints,
    })),
  }));

  return (
    <div>
      <BackLink href="/admin/learning" label="Learning" />
      <h1 className="font-serif text-3xl text-ink">{course.title}</h1>
      {course.summary ? <p className="mt-1 max-w-[70ch] text-muted">{course.summary}</p> : null}

      <div className="mt-5">
        <CourseBuilder courseId={course.id} status={course.status} sections={sections} />
      </div>
    </div>
  );
}
