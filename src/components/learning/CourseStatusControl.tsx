"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  hideCourse,
  publishCourse,
  unhideCourse,
  unpublishCourse,
} from "@/app/(app)/admin/learning/actions";
import { BTN_GHOST, BTN_NAVY, CHIP } from "@/components/learning/ui";

export type CourseStatus = "DRAFT" | "PUBLISHED" | "HIDDEN";

/**
 * The course's status ladder, in the page header beside the title (spec 038 follow-up, 2026-08-22).
 *
 *   Draft  →  Published  →  Paused
 *
 * Three states rather than two, because "still being written" and "was live, temporarily off" are
 * different things to anybody reading a list of courses, and calling the second one a Draft is a
 * lie about a course that ran for a year.
 *
 * Colour, per the house rule: GREEN is a done-state and nothing else (Published), GOLD is
 * attention (Draft — unfinished; Paused — deliberately off), never red, because none of these is
 * an error.
 *
 * The publish gate refuses with a specific reason ("First Section has no lessons"), so the refusal
 * is shown here rather than swallowed — it is the one message an operator has to see. Un-pausing
 * re-runs the same gate: content can be emptied while a course sits paused, and letting it come
 * back broken would make pausing the way round the check.
 */
export function CourseStatusControl({
  courseId,
  status,
}: {
  courseId: string;
  status: CourseStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else router.refresh();
    });
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <span className={status === "PUBLISHED" ? CHIP.done : CHIP.attention}>
        {status === "PUBLISHED" ? "Published" : status === "HIDDEN" ? "Paused" : "Draft"}
      </span>

      {status === "DRAFT" ? (
        <button
          type="button"
          disabled={pending}
          className={BTN_NAVY}
          onClick={() => run(() => publishCourse(courseId))}
        >
          Publish
        </button>
      ) : null}

      {status === "PUBLISHED" ? (
        <>
          <button
            type="button"
            disabled={pending}
            className={BTN_GHOST}
            onClick={() => run(() => hideCourse(courseId))}
            title="Nobody can open it, including people halfway through. Their progress is kept."
          >
            Pause
          </button>
          <button
            type="button"
            disabled={pending}
            className={BTN_GHOST}
            onClick={() => run(() => unpublishCourse(courseId))}
          >
            Return to draft
          </button>
        </>
      ) : null}

      {status === "HIDDEN" ? (
        <>
          <button
            type="button"
            disabled={pending}
            className={BTN_NAVY}
            onClick={() => run(() => unhideCourse(courseId))}
          >
            Put it back
          </button>
          <button
            type="button"
            disabled={pending}
            className={BTN_GHOST}
            onClick={() => run(() => unpublishCourse(courseId))}
          >
            Return to draft
          </button>
        </>
      ) : null}

      <span className="text-[11.5px] text-muted">
        {status === "DRAFT"
          ? "Nobody can see this — not even on a direct link."
          : status === "HIDDEN"
            ? "Paused. Nobody can open it, including anyone halfway through — their progress is kept and comes back."
            : "Live. Who sees it is set on the Access tab."}
      </span>

      {error ? (
        <p
          role="alert"
          className="absolute right-0 top-full z-10 mt-1.5 w-[320px] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 shadow-sm"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
