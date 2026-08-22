import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireLearningManager } from "@/lib/learning/managers";
import { formatDate } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { NewCourseForm } from "@/components/learning/NewCourseForm";
import { CHIP } from "@/components/learning/ui";
import { SuggestionQueue, type Suggestion } from "@/components/learning/SuggestionQueue";
import { averageStars } from "@/lib/learning/materials";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function AdminLearningPage() {
  await requireLearningManager();

  const courses = await prisma.course.findMany({
    orderBy: [{ status: "asc" }, { order: "asc" }],
    select: {
      id: true,
      title: true,
      summary: true,
      status: true,
      visibility: true,
      publishedAt: true,
      _count: { select: { sections: true, enrollments: true, audiences: true, assignments: true } },
      ratings: { select: { stars: true } },
    },
  });

  // Employees suggest resources; nothing reaches the library until HR approves it here. ONE queue
  // for the whole module — reviewing four suggestions should not mean opening four courses.
  const pending = await prisma.courseResource.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      name: true,
      url: true,
      createdAt: true,
      course: { select: { id: true, title: true } },
      suggestedBy: { select: { name: true } },
    },
  });
  const suggestions: Suggestion[] = pending.map((p) => ({
    id: p.id,
    kind: p.kind,
    name: p.name,
    url: p.url,
    courseId: p.course.id,
    courseTitle: p.course.title,
    suggestedByName: p.suggestedBy?.name ?? null,
    createdAt: p.createdAt,
  }));

  return (
    <div>
      {/* Employees suggest resources and finish courses while this page sits open. */}
      <AutoRefresh />
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Learning</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Build training courses and choose who they reach. A course stays a draft — invisible to
        everyone — until you publish it.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
        <Link href="/admin/learning/groups" className="text-muted hover:text-ink">
          Manage groups →
        </Link>
        <Link href="/admin/learning/settings" className="text-muted hover:text-ink">
          Setup: who runs Learning →
        </Link>
      </div>

      <NewCourseForm />

      <SuggestionQueue suggestions={suggestions} />

      {courses.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          No courses yet. Create one above to get started.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                href={`/admin/learning/${course.id}`}
                className="ff-card flex items-center gap-4 rounded-xl border border-line bg-surface p-4 hover:border-navy-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold text-navy-800">{course.title}</span>
                    {/* Three states since 2026-08-22. "Paused" is not "Draft": one has never been
                        live, the other was and is meant to be again. */}
                    <span className={course.status === "PUBLISHED" ? CHIP.done : CHIP.attention}>
                      {course.status === "PUBLISHED"
                        ? "Published"
                        : course.status === "HIDDEN"
                          ? "Paused"
                          : "Draft"}
                    </span>
                    {course.status === "PUBLISHED" && course.visibility === "OPEN" ? (
                      <span className={CHIP.navy}>Everyone</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {course._count.sections} section{course._count.sections === 1 ? "" : "s"} ·{" "}
                    {course._count.enrollments} started
                    {course.visibility === "RESTRICTED" ? (
                      <>
                        {" "}
                        · {course._count.audiences + course._count.assignments} access route
                        {course._count.audiences + course._count.assignments === 1 ? "" : "s"}
                      </>
                    ) : null}
                    {course.publishedAt ? <> · published {formatDate(course.publishedAt)}</> : null}
                    {course.ratings.length > 0 ? (
                      <>
                        {" "}
                        · ★ {averageStars(course.ratings.map((r) => r.stars))} from{" "}
                        {course.ratings.length}{" "}
                        {course.ratings.length === 1 ? "rating" : "ratings"}
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="text-sm text-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
