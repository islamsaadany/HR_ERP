"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCheckpoint, upsertCheckpoint } from "@/app/(app)/admin/learning/actions";
import { BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type CheckpointRow = {
  id: string;
  atSec: number;
  prompt: string;
  options: string[];
  correctIndex: number;
};

const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

const parseTime = (v: string): number | null => {
  const t = v.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(\d+):([0-5]?\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Checkpoint authoring — questions that pause the video mid-play.
 *
 * Absent entirely when the lesson's video can't be measured, rather than shown-and-disabled: a
 * greyed-out control invites someone to keep trying, while its absence plus the explanation on the
 * watch-% field says the whole story once.
 *
 * Time is entered as m:ss or plain seconds, because "4:30" is how anyone reads a video.
 */
export function LessonVideoSettings({
  courseId,
  lessonId,
  trackable,
  checkpoints,
}: {
  courseId: string;
  lessonId: string;
  trackable: boolean;
  checkpoints: CheckpointRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [at, setAt] = useState("");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", ""]);
  const [correct, setCorrect] = useState(0);

  if (!trackable) return null;

  function submit() {
    const atSec = parseTime(at);
    if (atSec === null) {
      setError("Enter the moment as m:ss, like 4:30.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await upsertCheckpoint(courseId, {
        lessonId,
        checkpointId: null,
        atSec,
        prompt,
        options,
        correctIndex: correct,
      });
      if (!r.ok) setError(r.error);
      else {
        setAdding(false);
        setAt("");
        setPrompt("");
        setOptions(["", "", ""]);
        setCorrect(0);
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <span className={LABEL}>Checkpoints</span>
      {checkpoints.length === 0 && !adding ? (
        <p className="text-[12px] text-muted">
          None yet. A checkpoint pauses the video and asks a question before it continues.
        </p>
      ) : null}

      <ul className="space-y-1">
        {checkpoints.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-[13px]"
          >
            <span className={CHIP.muted}>{mmss(c.atSec)}</span>
            <span className="min-w-0 flex-1 truncate">{c.prompt}</span>
            <span className="text-[11px] text-muted">
              {c.options.length} options · not scored
            </span>
            <button
              type="button"
              disabled={pending}
              className="text-xs text-red-700 hover:underline"
              onClick={() =>
                startTransition(async () => {
                  await deleteCheckpoint(courseId, c.id);
                  router.refresh();
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-2 rounded-lg border border-line p-3">
          <div className="flex gap-2">
            <div className="w-[110px]">
              <label className={LABEL} htmlFor="cp-at">At (m:ss)</label>
              <input id="cp-at" className={INPUT} value={at} placeholder="4:30" onChange={(e) => setAt(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={LABEL} htmlFor="cp-q">Question</label>
              <input id="cp-q" className={INPUT} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
          </div>
          <p className={`${LABEL} mt-2`}>Answers — click the circle to mark the right one</p>
          {options.map((opt, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-2">
              <button
                type="button"
                aria-label={`Mark answer ${i + 1} correct`}
                onClick={() => setCorrect(i)}
                className={`h-4 w-4 flex-none rounded-full border-2 ${
                  correct === i ? "border-navy-800 bg-navy-800" : "border-navy-200"
                }`}
              />
              <input
                className={INPUT}
                value={opt}
                placeholder={`Answer ${i + 1}`}
                onChange={(e) =>
                  setOptions(options.map((o, j) => (j === i ? e.target.value : o)))
                }
              />
            </div>
          ))}
          {error ? (
            <p role="alert" className="mt-1 text-xs text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={pending} className={BTN_NAVY} onClick={submit}>
              Add checkpoint
            </button>
            <button
              type="button"
              className="text-xs text-muted hover:underline"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={`${BTN_GHOST} mt-2`} onClick={() => setAdding(true)}>
          + Add checkpoint
        </button>
      )}
    </div>
  );
}
