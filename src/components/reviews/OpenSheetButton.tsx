"use client";

import { useActionState } from "react";
import { openSheetForQuarter } from "@/app/(app)/reviews/actions";
import type { ActionResult } from "@/app/(app)/reviews/actions";

/** Creates this quarter's sheet for a pair. Idempotent — pressing twice is fine. */
export function OpenSheetButton({
  year,
  quarter,
  counterpartId,
}: {
  year: number;
  quarter: number;
  counterpartId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => openSheetForQuarter(formData),
    null
  );

  return (
    <form action={formAction} className="contents">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="quarter" value={quarter} />
      <input type="hidden" name="counterpartId" value={counterpartId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-45"
      >
        {pending ? "Starting…" : "Start this quarter"}
      </button>
      {state && !state.ok && (
        <p role="alert" className="w-full text-xs text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
