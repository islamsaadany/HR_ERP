"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishCourse, unpublishCourse } from "@/app/(app)/admin/learning/actions";
import { BTN_GHOST, BTN_NAVY } from "@/components/learning/ui";

/**
 * Publish / Return to draft, lifted out of the Content tab and up into the page header.
 *
 * It belongs beside the status chip, not below the tabs: it is a property of the COURSE, not of
 * whichever tab you happen to be on, and putting it here removes an entire row of chrome that
 * previously sat between the tabs and the first piece of content.
 *
 * The publish gate can refuse with a specific reason ("First Section has no lessons"), so the
 * refusal is shown here rather than swallowed — it is the one message an operator has to see.
 */
export function PublishToggle({
  courseId,
  status,
}: {
  courseId: string;
  status: "DRAFT" | "PUBLISHED";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={pending}
        className={status === "PUBLISHED" ? BTN_GHOST : BTN_NAVY}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result =
              status === "PUBLISHED"
                ? await unpublishCourse(courseId)
                : await publishCourse(courseId);
            if (!result.ok) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {status === "PUBLISHED" ? "Return to draft" : "Publish"}
      </button>
      {error ? (
        <p
          role="alert"
          className="absolute right-0 top-full z-10 mt-1.5 w-[300px] rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700 shadow-sm"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
