import Link from "next/link";
import { formatDate } from "@/lib/labels";
import { ProgressBar } from "@/components/learning/ProgressBar";
import { CHIP } from "@/components/learning/ui";
import type { RosterMember } from "@/lib/learning/tracks";

/**
 * How the people on a track are getting on (spec 043, US4).
 *
 * The panel above this one shows what was ASSIGNED — a group stays a group there, because assigning
 * a group is a statement about the group. This one answers the other question: who is actually on
 * it, groups expanded, and how far each has got. Neither is a substitute for the other, which is why
 * both are here.
 *
 * Every figure is `trackRoster`'s, computed through the same derivations the deadline email reads.
 * Nothing is counted in this file.
 */
export function TrackRoster({
  members,
  stepCount,
  openablePlanIds,
}: {
  members: RosterMember[];
  stepCount: number;
  /**
   * Whose plan THIS viewer may actually open. Whoever runs Learning is not automatically a
   * manager, and their plan page refuses anyone who is neither — so a link offered to everybody
   * would bounce silently, which reads exactly like a broken product.
   */
  openablePlanIds: Set<string>;
}) {
  if (members.length === 0) return null;

  if (stepCount === 0) {
    return (
      <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
        {members.length} {members.length === 1 ? "person is" : "people are"} on this track, but it
        has no published courses yet — so it is handing out nothing. Add a course above.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {members.map((member) => (
        <li
          key={member.userId}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-bold text-navy-800">{member.name}</span>
              {/* Named, so nobody wonders why a person they never added is on the list. */}
              {member.viaGroupName ? (
                <span className={CHIP.muted}>via {member.viaGroupName}</span>
              ) : null}
              {member.overdue > 0 ? (
                <span className={CHIP.danger}>
                  {member.overdue} overdue
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-[11.5px] text-muted">
              Joined this track {formatDate(member.joinedAt)} · {member.done} of {member.total} done
            </span>
          </span>
          <ProgressBar percent={(member.done / member.total) * 100} width={120} />
          {openablePlanIds.has(member.userId) ? (
            <Link
              href={`/learning/team/${member.userId}`}
              className="flex-none rounded-lg border border-line bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-navy-700 hover:bg-navy-50"
            >
              Their plan
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
