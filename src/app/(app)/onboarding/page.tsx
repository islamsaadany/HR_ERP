import { requireUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { groupByStage, tracksForUser } from "@/lib/onboarding";
import { OnboardingJourney, type JourneyStage } from "@/components/OnboardingJourney";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const sessionUser = await requireUser();
  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { department: true },
  });

  const tracks = tracksForUser({ department: me?.department ?? null });

  const [activities, completions] = await Promise.all([
    prisma.onboardingActivity.findMany({
      where: { active: true, track: { in: tracks } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.activityCompletion.findMany({
      where: { userId: sessionUser.id },
      select: { activityId: true },
    }),
  ]);

  const doneIds = new Set(completions.map((c) => c.activityId));

  const stages: JourneyStage[] = groupByStage(activities).map(({ stage, items }) => ({
    key: stage,
    label: stage,
    items: items.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
      type: a.type,
      linkUrl: a.linkUrl,
      track: a.track,
      done: doneIds.has(a.id),
    })),
  }));

  const hasContent = activities.length > 0;

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Onboarding
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Your onboarding journey</h1>
      <p className="mt-1 text-muted">
        Work through each stage — read the policies, complete the actions.
      </p>

      {hasContent ? (
        <OnboardingJourney stages={stages} />
      ) : (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-muted">
          No onboarding activities yet. HR will publish them soon.
        </div>
      )}
    </div>
  );
}
