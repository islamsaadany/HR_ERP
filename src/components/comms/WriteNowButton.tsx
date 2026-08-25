"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { writeCongratulation } from "@/app/(app)/admin/communications/actions";

/**
 * Write a congratulation ahead of its day.
 *
 * The whole reason the look-ahead exists: a manager who has five minutes today can write
 * September's messages today. It does not bring the SEND forward — the server refuses that until
 * the day, and the row goes on to say when the button opens.
 */
export function WriteNowButton({
  userId,
  kind,
  occasionYear,
}: {
  userId: string;
  kind: "BIRTHDAY" | "WORK_ANNIVERSARY";
  occasionYear: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await writeCongratulation(userId, kind, occasionYear);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
        className="rounded-lg border border-navy-200 bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-navy-800 hover:bg-navy-50 disabled:opacity-60"
      >
        {pending ? "Writing…" : "Write it now"}
      </button>
      {error ? <span className="text-[12px] text-red-700">{error}</span> : null}
    </span>
  );
}
