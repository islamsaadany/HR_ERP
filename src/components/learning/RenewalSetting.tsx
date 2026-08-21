"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { countLapsedByRenewal, setCourseRenewal } from "@/app/(app)/admin/learning/actions";
import { RENEWAL_CHOICES } from "@/lib/learning/renewal";
import { BTN_NAVY, INPUT, LABEL } from "@/components/learning/ui";

/**
 * How often this course must be redone.
 *
 * The warning is the point. Lapsing is derived from the completion date, so setting "every year"
 * on a course people finished 18 months ago puts it back on their lists the moment you save —
 * which is correct, and would be an unpleasant surprise if we let it happen quietly.
 */
export function RenewalSetting({
  courseId,
  renewAfterMonths,
}: {
  courseId: string;
  renewAfterMonths: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<number | null>(renewAfterMonths);
  const [affected, setAffected] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = choice !== renewAfterMonths;

  function preview(next: number | null) {
    setChoice(next);
    setSaved(false);
    setAffected(null);
    if (next !== null) {
      startTransition(async () => setAffected(await countLapsedByRenewal(courseId, next)));
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <label className={LABEL} htmlFor="renewal">How often must this be redone?</label>
      <select
        id="renewal"
        className={INPUT}
        value={choice ?? ""}
        onChange={(e) => preview(e.target.value ? Number(e.target.value) : null)}
      >
        {RENEWAL_CHOICES.map((c) => (
          <option key={c.label} value={c.months ?? ""}>
            {c.label}
          </option>
        ))}
      </select>

      {affected !== null && affected > 0 ? (
        <p className="mt-2 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12.5px] text-gold-800">
          <b>
            {affected} {affected === 1 ? "person has" : "people have"}
          </b>{" "}
          a completion older than that, so saving this puts the course back on their list today.
        </p>
      ) : null}

      {saved ? (
        <p className="mt-2 text-[12.5px] text-green-700">Saved.</p>
      ) : null}

      {dirty ? (
        <button
          type="button"
          disabled={pending}
          className={`${BTN_NAVY} mt-3`}
          onClick={() =>
            startTransition(async () => {
              await setCourseRenewal(courseId, choice);
              setSaved(true);
              setAffected(null);
              router.refresh();
            })
          }
        >
          Save
        </button>
      ) : null}
    </div>
  );
}
