"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadSheet, type UploadState } from "@/app/(app)/incentive/actions";

/**
 * One interactive sheet-upload row. Uses useActionState so the result is shown inline —
 * a real success/warning/error message — instead of the old silent redirect. On success it
 * refreshes the page so the row counts and the computed report update.
 */
export function SheetUpload({
  cycleId,
  kind,
  label,
  count,
}: {
  cycleId: string;
  kind: "people" | "assignments" | "contributions";
  label: string;
  count: number;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    uploadSheet.bind(null, cycleId, kind),
    null
  );

  useEffect(() => {
    if (state?.ok) {
      setFileName("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form action={formAction} encType="multipart/form-data">
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-sm text-ink">
          {label}
          <span className="text-muted"> ({count})</span>
        </span>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface p-1">
          <span className="shrink-0 rounded bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white">Choose…</span>
          <span
            className={
              "min-w-0 flex-1 truncate text-xs " +
              (fileName ? "font-semibold text-navy-800" : "text-muted")
            }
          >
            {fileName || "No file chosen"}
          </span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
          />
        </label>
        <button
          disabled={pending || !fileName}
          className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>

      {state && !state.ok ? (
        <p className="mt-1.5 rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-700">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="mt-1.5 rounded bg-navy-50 px-2.5 py-1.5 text-xs text-navy-700">{state.message}</p>
      ) : null}
      {state?.warnings && state.warnings.length > 0 ? (
        <p className="mt-1 rounded bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Notes: {state.warnings.join(" · ")}
        </p>
      ) : null}
    </form>
  );
}
