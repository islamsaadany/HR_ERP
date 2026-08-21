"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markLessonComplete, markLessonIncomplete } from "@/app/(app)/learning/actions";
import { ProgressBar } from "@/components/learning/ProgressBar";
import { BTN_GHOST, BTN_NAVY, CHIP } from "@/components/learning/ui";

export type PlayerLesson = {
  id: string;
  title: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  minWatchPercent: number;
  completed: boolean;
  watchedSec: number;
};

export type PlayerSection = { id: string; title: string; lessons: PlayerLesson[] };

/**
 * The course player's shell: lesson list, and the mark-complete control with its gate message.
 *
 * The gate is stated as a FACT ("you've watched 62% — watch 80% to complete"), not as a blocked
 * action. It reads as information the learner can act on rather than the system telling them off,
 * and it is the wording the approved mockup carries.
 *
 * The disabled button is a courtesy only. The server re-checks the gate against stored watched
 * seconds on every attempt, so re-enabling this in devtools changes nothing.
 */
export function CoursePlayer({
  courseId,
  sections,
  currentLessonId,
  percent,
  writesBlocked,
  children,
}: {
  courseId: string;
  sections: PlayerSection[];
  currentLessonId: string;
  percent: number;
  /** Set when an admin is impersonating — writes are refused server-side (FR-026). */
  writesBlocked: string | null;
  /** The video player for the current lesson, rendered by the server component. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const all = sections.flatMap((s) => s.lessons);
  const current = all.find((l) => l.id === currentLessonId) ?? all[0];
  const requiredTotal = all.filter((l) => l.isRequired).length;
  const requiredDone = all.filter((l) => l.isRequired && l.completed).length;

  const gated = !!current && current.minWatchPercent > 0 && current.watchedSec <= 0;

  function toggle() {
    if (!current) return;
    setError(null);
    startTransition(async () => {
      const result = current.completed
        ? await markLessonIncomplete(current.id)
        : await markLessonComplete(current.id);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid items-start gap-4 md:grid-cols-[250px_1fr]">
      <nav className="overflow-hidden rounded-xl border border-line bg-surface" aria-label="Lessons">
        {sections.map((section) => (
          <div key={section.id}>
            <p className="px-3 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
              {section.title}
            </p>
            {section.lessons.map((lesson) => {
              const active = lesson.id === currentLessonId;
              return (
                <Link
                  key={lesson.id}
                  href={`/learning/${courseId}?lesson=${lesson.id}`}
                  className={`flex items-center gap-2 border-l-[3px] px-3 py-2 text-[13px] ${
                    active
                      ? "border-navy-800 bg-navy-50/60 font-bold text-navy-800"
                      : "border-transparent text-ink hover:bg-navy-50/30"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`inline-grid h-4 w-4 flex-none place-items-center rounded-full border text-[10px] ${
                      lesson.completed
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-line text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                  {!lesson.isRequired ? <span className={CHIP.muted}>Optional</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="border-t border-line p-3">
          <ProgressBar percent={percent} width={9999} />
          <p className="mt-1 text-[11px] text-muted">
            {requiredDone} of {requiredTotal} required lessons
          </p>
        </div>
      </nav>

      <div>
        {children}

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <strong className="text-[15px] text-navy-800">{current?.title}</strong>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {current?.estimatedMinutes ? `${current.estimatedMinutes} min` : null}
              {current && !current.isRequired ? " · optional" : null}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={pending || (gated && !current?.completed) || !!writesBlocked}
            className={current?.completed ? BTN_GHOST : BTN_NAVY}
            title={writesBlocked ?? undefined}
          >
            {current?.completed ? "Mark not done" : "Mark complete"}
          </button>
        </div>

        {writesBlocked ? (
          <p className="mt-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
            {writesBlocked}
          </p>
        ) : gated && !current?.completed ? (
          <p className="mt-3 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
            Watch <b>{current?.minWatchPercent}%</b> of the video to complete this lesson. Skipping
            ahead doesn&rsquo;t count, and rewinding never loses what you&rsquo;ve already watched.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
