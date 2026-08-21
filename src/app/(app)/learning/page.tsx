import { requireUser } from "@/lib/roles";
import { requireModuleEnabled } from "@/lib/modules";
import { myLearning } from "@/lib/learning/queries";
import { CourseCard } from "@/components/learning/CourseCard";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

/**
 * "My learning" — deliberately a list of OBLIGATIONS, not a catalogue.
 *
 * There is no browse, no search and no enrol button, because there is nothing to browse: an
 * employee sees exactly the courses that reach them. Unfinished sit above finished, so the page
 * answers "what do I still owe?" at a glance rather than making someone scan for it.
 *
 * It refreshes itself because HR assigns courses while people have the page open — a server page
 * painted once would sit there claiming there was nothing to do.
 */
export default async function LearningPage() {
  await requireModuleEnabled("learning");
  const user = await requireUser();
  const courses = await myLearning(user.id);

  const outstanding = courses.filter((c) => c.completedAt === null);
  const finished = courses.filter((c) => c.completedAt !== null);

  return (
    <div>
      <AutoRefresh />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">Learning</p>
      <h1 className="mt-1 font-serif text-3xl text-ink">My learning</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        {courses.length === 0
          ? "Nothing has been assigned to you yet. When it is, it will appear here."
          : outstanding.length > 0
            ? `You have ${outstanding.length} ${outstanding.length === 1 ? "course" : "courses"} to finish.`
            : "You're up to date — everything assigned to you is complete."}
      </p>

      {outstanding.length > 0 ? (
        <section className="mt-6">
          {outstanding.map((c) => (
            <CourseCard key={c.courseId} course={c} />
          ))}
        </section>
      ) : null}

      {finished.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted">
            Completed
          </h2>
          {finished.map((c) => (
            <CourseCard key={c.courseId} course={c} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
