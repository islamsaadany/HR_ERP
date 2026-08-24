"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  sendTestToSelf,
  setCongratsLeadDays,
  setDisplayName,
} from "@/app/(app)/admin/communications/settings-actions";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

type Result = { ok: boolean; error?: string; message?: string };

export function CommsSettingsForm({
  fromName,
  congratsLeadDays,
  canSend,
}: {
  fromName: string;
  congratsLeadDays: number;
  /** False when the secrets are missing — the test button would only ever fail. */
  canSend: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<Result>) {
    setNote(null);
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "That didn't work.");
      else {
        setNote(result.message ?? "Saved.");
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-[720px] space-y-4">
      <form className="rounded-xl border border-line bg-surface p-4" action={(fd) => run(() => setDisplayName(fd))}>
        <h2 className="text-[13px] font-bold text-navy-800">Who emails come from</h2>
        <p className="mb-2 mt-0.5 text-[11.5px] text-muted">
          The name people see in their inbox. The address itself is set in the environment, because
          it is tied to the domain verified with the mail provider.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className={LABEL} htmlFor="fromName">Sender name</label>
            <input id="fromName" name="fromName" defaultValue={fromName} placeholder="People of Forefront Group" className={INPUT} />
          </div>
          <button type="submit" disabled={pending} className={BTN_GHOST}>Save</button>
        </div>
        <p className="mt-2 rounded-r-lg border-l-[3px] border-gold-500 bg-gold-100 px-3 py-2 text-[12px] text-gold-800">
          <b>This changes every email the platform sends</b>, not only announcements — a benefit-claim
          notification and a holiday announcement will arrive under this name too. There is one
          sender name for the whole platform.
        </p>
      </form>

      <form className="rounded-xl border border-line bg-surface p-4" action={(fd) => run(() => setCongratsLeadDays(fd))}>
        <h2 className="text-[13px] font-bold text-navy-800">How far ahead congratulations are prepared</h2>
        <p className="mb-2 mt-0.5 text-[11.5px] text-muted">
          Birthdays and joining anniversaries are drafted this many days before the day, so whoever
          sends them has time to read and adjust the words.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[120px]">
            <label className={LABEL} htmlFor="congratsLeadDays">Days ahead</label>
            <input
              id="congratsLeadDays"
              name="congratsLeadDays"
              type="number"
              min={0}
              max={30}
              defaultValue={congratsLeadDays}
              className={INPUT}
            />
          </div>
          <button type="submit" disabled={pending} className={BTN_GHOST}>Save</button>
        </div>
      </form>

      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-bold text-navy-800">Send yourself a test</h2>
        <p className="mb-2 mt-0.5 text-[11.5px] text-muted">
          The real design, the real sender name, the real address — before anybody else receives
          one. It goes to your own address and nowhere else.
        </p>
        <button
          type="button"
          disabled={pending || !canSend}
          onClick={() => run(() => sendTestToSelf())}
          className={BTN_NAVY}
          title={canSend ? undefined : "Email is not configured"}
        >
          {pending ? "Sending…" : "Send me a test"}
        </button>
      </div>

      {note ? (
        <p className={`${CHIP.done} block w-fit px-3 py-1.5 text-[12.5px]`}>{note}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
