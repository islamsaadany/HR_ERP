import Link from "next/link";
import { requireLearningManager } from "@/lib/learning/managers";
import { isAdmin } from "@/lib/roles";
import { listTracks } from "@/lib/learning/tracks";
import { BackLink } from "@/components/admin/BackLink";
import { AutoRefresh } from "@/components/AutoRefresh";
import { NewTrackForm } from "@/components/learning/NewTrackForm";
import { CHIP } from "@/components/learning/ui";

export const dynamic = "force-dynamic";

/**
 * Admin → Learning → Tracks (spec 043, mockup-approved 2026-09-16).
 *
 * A track is a named, ordered path of courses handed to a person or a group. Being on one grants
 * its courses, which is why this list lives inside Learning rather than beside it: it is a way of
 * handing out courses, and it belongs with the courses.
 *
 * It refreshes itself because somebody else assigns and edits tracks while this sits open — the
 * same reason the course list does.
 */
export default async function TracksPage() {
  const actor = await requireLearningManager();
  const tracks = await listTracks();

  return (
    <div>
      <AutoRefresh />
      <BackLink href="/admin/learning" label="Learning" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Learning
      </p>
      <h1 className="mt-1 font-serif text-3xl text-ink">Tracks</h1>
      <p className="mt-1 max-w-[70ch] text-muted">
        A track is a path of courses in the order you want them done. Hand it to a person or a whole
        group and they hold those courses — you build the path once.
      </p>

      <NewTrackForm />

      {tracks.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line bg-surface p-5 text-sm text-muted">
          No tracks yet. Create one above — a good first one is the path a new joiner follows.
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {tracks.map((track) => (
            <li key={track.id}>
              <Link
                href={`/admin/learning/tracks/${track.id}`}
                className="ff-card flex items-center gap-3 rounded-xl border border-line bg-surface p-4 hover:border-navy-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-bold text-navy-800">{track.name}</span>
                    <span className={CHIP.navy}>
                      {track.courseCount} course{track.courseCount === 1 ? "" : "s"}
                    </span>
                    {/* The count is PEOPLE, with groups expanded — not a row count, which would
                        report a track given to one 40-person group as reaching 1. A track nobody is
                        on says so in words rather than showing a zero that reads like a fault. */}
                    {track.peopleCount > 0 ? (
                      <span className={CHIP.done}>{track.peopleCount} on it</span>
                    ) : (
                      <span className={CHIP.muted}>nobody yet</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {track.courseCount === 0
                      ? "No courses in it yet"
                      : track.courseTitles.slice(0, 4).join(" · ")}
                    {track.courseCount > 4 ? ` · +${track.courseCount - 4} more` : ""}
                    {track.withDeadline > 0 ? ` — ${track.withDeadline} with a deadline` : ""}
                  </span>
                </span>
                <span aria-hidden className="text-sm text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin(actor.role) ? null : (
        <p className="mt-6 text-xs text-muted">
          You are running Learning by appointment — tracks are yours to build and assign.
        </p>
      )}
    </div>
  );
}
