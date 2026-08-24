"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createOneOnOne, type ActionResult } from "@/app/(app)/reviews/one-on-ones/actions";

export function NewOneOnOneForm({
  counterparts,
}: {
  counterparts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (_prev, formData) => {
      const result = await createOneOnOne(formData);
      if (result.ok && result.id) router.push(`/reviews/one-on-ones/${result.id}`);
      return result;
    },
    null
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      {state && !state.ok && (
        <p
          role="alert"
          tabIndex={-1}
          className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
          With
          <select
            name="counterpartId"
            className="mt-1 block rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink"
          >
            {counterparts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted">
          Held on
          <input
            type="date"
            name="heldOn"
            defaultValue={today}
            className="mt-1 block rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-ink"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-navy-800 px-4 py-2 text-[12.5px] font-semibold text-white disabled:opacity-45"
        >
          {pending ? "Starting…" : "Record a 1:1"}
        </button>
      </div>
    </form>
  );
}
