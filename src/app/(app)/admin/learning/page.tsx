import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/labels";
import { BackLink } from "@/components/admin/BackLink";
import { NewCourseForm } from "@/components/learning/NewCourseForm";
import { CHIP } from "@/components/learning/ui";

export const dynamic = "force-dynamic";

export default async function AdminLearningPage() {
  await requireAdmin();

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
    },
  });

  return (
    <div>
      <BackLink href="/admin" label="Admin" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Admin</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Learning</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        Build training courses and choose who they reach. A course stays a draft — invisible to
        everyone — until you publish it.
      </p>

      <NewCourseForm />

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
                    <span className={course.status === "PUBLISHED" ? CHIP.done : CHIP.attention}>
                      {course.status === "PUBLISHED" ? "Published" : "Draft"}
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
