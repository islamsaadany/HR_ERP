"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissFinishPanel, rateCourse } from "@/app/(app)/learning/actions";
import { SuggestForm } from "@/components/learning/MaterialsPanel";
import { formatDate } from "@/lib/labels";

/**
 * The moment a course finishes: rate it, and pass something on (spec 038 materials, 2026-08-22).
 *
 * Shown ONCE per completion, and never blocking — the course is already complete before this
 * appears, and both halves are optional. Skipping is durable (a stored integer, not a client-side
 * dismissal), and a RENEWAL asks again by itself because finishing again moves the count past it.
 *
 * Asking here works because it is the only moment the course is fresh and the person is done with
 * it. A "rate this" prompt on a list somewhere gets ignored.
 */
export function CourseFinishPanel({
  courseId,
  courseTitle,
  completedAt,
  lessonCount,
}: {
  courseId: string;
  courseTitle: string;
  completedAt: Date;
  lessonCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [rated, setRated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function rate(value: number) {
    setStars(value);
    setError(null);
    startTransition(async () => {
      const result = await rateCourse(courseId, value);
      if (!result.ok) {
        setError(result.error);
        setStars(0);
      } else setRated(true);
    });
  }

  function close() {
    startTransition(async () => {
      await dismissFinishPanel(courseId);
      router.refresh();
    });
  }

  const shown = hover || stars;

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-green-700">
            Course complete
          </p>
          <p className="font-serif text-lg text-ink">{courseTitle}</p>
          <p className="text-[12.5px] text-muted">
            Finished on {formatDate(completedAt)} · {lessonCount}{" "}
            {lessonCount === 1 ? "lesson" : "lessons"}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          disabled={pending}
          className="text-[12px] font-semibold text-muted hover:text-ink disabled:opacity-60"
        >
          Close
        </button>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[13px] font-semibold text-ink">How was it?</p>
        <div className="mt-1.5 flex items-center gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              disabled={pending || rated}
              aria-label={`${value} out of 5`}
              onMouseEnter={() => setHover(value)}
              onFocus={() => setHover(value)}
              onClick={() => rate(value)}
              className={`text-2xl leading-none transition-colors disabled:cursor-default ${
                value <= shown ? "text-gold-500" : "text-navy-100"
              }`}
            >
              ★
            </button>
          ))}
          {rated ? (
            <span className="ml-2 text-[12px] font-semibold text-green-700">Thanks — recorded.</span>
          ) : null}
        </div>
        <p className="mt-1.5 text-[11.5px] text-muted">
          Ratings are anonymous. HR sees the average across everyone, never who gave what.
        </p>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-[13px] font-semibold text-ink">Know something good on this topic?</p>
        <p className="mb-2 text-[12px] text-muted">
          A book, an article, a talk, another course — anything that helped you. HR reviews it, and
          if it lands it shows up here for everyone who takes this course.
        </p>
        <SuggestForm courseId={courseId} compact />
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
