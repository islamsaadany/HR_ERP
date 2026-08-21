import { prisma } from "@/lib/prisma";
import { hasLapsed } from "@/lib/learning/renewal";

/**
 * Start (or resume) a learner's enrollment. A PLAIN function — deliberately not a server action.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 * The player page needs this to run while it renders: opening a course is what starts it. The logic
 * originally lived in the `openCourse` server action and the page simply called it — which also
 * dragged `revalidatePath()` into the render, and Next.js throws on that:
 *
 *   "Route /learning/[courseId] used revalidatePath during render, which is unsupported."
 *
 * That produced a blank "server-side exception" on Continue course. It stayed hidden for a while
 * because during impersonation `requireLearner()` threw first and the action returned before
 * reaching the revalidate — so lifting the impersonation restriction is what made it fire on every
 * visit rather than none.
 *
 * So the rule this module encodes: **the work lives here, the cache invalidation lives in the
 * action.** A page may call this; only an action may revalidate.
 */
export async function ensureEnrollment(userId: string, courseId: string): Promise<void> {
  const enrollment = await prisma.courseEnrollment.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId },
    update: {},
    select: { id: true, completedAt: true, completionCount: true },
  });

  // A LAPSED course is cleared here, at the moment the learner comes back to redo it — not by a
  // scheduled sweep. Nobody's ticks vanish while they aren't looking, and there is no job that
  // could half-finish across the company.
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { renewAfterMonths: true },
  });
  if (!course || !hasLapsed(enrollment.completedAt, course.renewAfterMonths)) return;

  await prisma.$transaction([
    prisma.lessonProgress.updateMany({
      where: { enrollmentId: enrollment.id },
      data: { completedAt: null, videoWatchedSec: 0, lastPositionSec: 0 },
    }),
    prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: {
        completedAt: null,
        // Their history is kept: the first completion, and how many times they have done it.
        completionCount: Math.max(enrollment.completionCount, 1),
        startedAt: new Date(),
      },
    }),
  ]);
}
