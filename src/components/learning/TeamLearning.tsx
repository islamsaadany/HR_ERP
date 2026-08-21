import Link from "next/link";
import { formatDate } from "@/lib/labels";
import { ProgressBar } from "@/components/learning/ProgressBar";
import { CHIP } from "@/components/learning/ui";
import type { TeamMemberLearning } from "@/lib/learning/queries";

/**
 * A manager's view of their team's training.
 *
 * Deliberately read-only and deliberately narrow: names, courses, progress. No routes, no
 * withdraw, no assignment. A manager needs to know who still owes something; who to chase is
 * theirs, and everything else is HR's.
 */
export function TeamLearning({ team }: { team: TeamMemberLearning[] }) {
  const owing = team.filter((m) => m.outstanding > 0).length;

  return (
    <div>
      <p className="mt-1 max-w-[70ch] text-muted">
        {team.length === 0
          ? "Nobody reports to you at the moment."
          : owing === 0
            ? "Everyone on your team is up to date."
            : `${owing} of your ${team.length} ${team.length === 1 ? "report" : "reports"} still ${owing === 1 ? "has" : "have"} training to finish.`}
      </p>

      <div className="mt-6 space-y-3">
        {team.map((member) => (
          <div key={member.userId} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14.5px] font-bold text-navy-800">{member.name}</span>
              {member.title ? (
                <span className="text-xs text-muted">{member.title}</span>
              ) : null}
              <span className="flex-1" />
              {member.courses.length === 0 ? (
                <span className={CHIP.muted}>No courses assigned</span>
              ) : member.outstanding === 0 ? (
                <span className={CHIP.done}>✓ Up to date</span>
              ) : (
                <span className={CHIP.attention}>
                  {member.outstanding} to finish
                </span>
              )}
            </div>

            {member.courses.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {member.courses.map((course) => (
                  <li key={course.courseId} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[13px]">{course.title}</span>
                    {course.grandfatheredOnly && !course.completedAt ? (
                      <span className={CHIP.attention}>No longer assigned</span>
                    ) : null}
                    <ProgressBar percent={course.percent} width={120} />
                    <span className="w-[110px] text-right text-[11.5px] text-muted">
                      {course.completedAt ? `Done ${formatDate(course.completedAt)}` : "In progress"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-muted">
        Your current direct reports. Training is assigned by HR — if something looks wrong here,{" "}
        <Link href="/directory" className="text-navy-700 underline">
          check the reporting line
        </Link>{" "}
        or speak to HR.
      </p>
    </div>
  );
}
