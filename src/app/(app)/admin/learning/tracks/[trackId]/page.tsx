import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireLearningManager } from "@/lib/learning/managers";
import { trackAssignments, trackWithSteps } from "@/lib/learning/tracks";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { TrackBuilder, type BuilderStep } from "@/components/learning/TrackBuilder";
import { TrackAssignees } from "@/components/learning/TrackAssignees";
import { TrackHeaderActions } from "@/components/learning/TrackHeaderActions";

export const dynamic = "force-dynamic";

/**
 * One track — its courses, and who is on it (spec 043, mockup-approved 2026-09-16).
 *
 * Both halves on one page rather than behind tabs: a track is a short thing, and what it contains
 * and who gets it are the two questions somebody opening it has. Splitting them would mean
 * answering one and hiding the other.
 */
export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  await requireLearningManager();
  const { trackId } = await params;

  const [track, assignees, published, people, groups] = await Promise.all([
    trackWithSteps(trackId),
    trackAssignments(trackId),
    prisma.course.findMany({
      where: { status: "PUBLISHED" },
      orderBy: [{ order: "asc" }, { title: "asc" }],
      select: { id: true, title: true },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    prisma.learnerGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { members: true } } },
    }),
  ]);
  if (!track) notFound();

  // A course already in the track is not offered again — the write refuses it anyway, but offering
  // it would be offering something that cannot work.
  const inTrack = new Set(track.steps.map((s) => s.courseId));
  const addable = published.filter((c) => !inTrack.has(c.id));

  const steps: BuilderStep[] = track.steps.map((s) => ({
    id: s.id,
    courseId: s.courseId,
    title: s.course.title,
    dueDays: s.dueDays,
    dueOn: s.dueOn,
  }));

  const peopleOnIt = assignees.reduce(
    (total, a) => total + (a.user ? 1 : (a.group?._count.members ?? 0)),
    0
  );

  return (
    <div>
      <AutoRefresh />
      <BackLink href="/admin/learning/tracks" label="Tracks" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
            Admin · Learning · Track
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">{track.name}</h1>
          {track.description ? (
            <p className="mt-1 max-w-[70ch] text-muted">{track.description}</p>
          ) : null}
        </div>
        <TrackHeaderActions
          trackId={track.id}
          name={track.name}
          description={track.description}
          peopleCount={peopleOnIt}
        />
      </div>

      <section className="mt-7">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 border-b border-line pb-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Courses</h2>
          <span className="text-[11.5px] text-muted">
            the order everybody on this track meets them in
          </span>
        </div>
        <TrackBuilder trackId={track.id} steps={steps} addable={addable} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 border-b border-line pb-1.5">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">
            Who is on it
          </h2>
          <span className="text-[11.5px] text-muted">
            {peopleOnIt === 0
              ? "nobody yet — this track is reaching no one"
              : `${peopleOnIt} ${peopleOnIt === 1 ? "person" : "people"}, groups counted`}
          </span>
        </div>
        <TrackAssignees
          trackId={track.id}
          assignees={assignees}
          people={people}
          groups={groups.map((g) => ({ id: g.id, name: g.name, members: g._count.members }))}
        />
      </section>
    </div>
  );
}
