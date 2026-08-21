"use client";

import { useState } from "react";

export type Checkpoint = {
  id: string;
  atSec: number;
  prompt: string;
  options: string[];
  correctIndex: number;
};

/**
 * A question that pauses the video until it is answered.
 *
 * The answer is NEVER stored (FR-032). This exists to make someone think for a second in the
 * middle of a video, not to assess them — so a wrong answer says so and lets them try again rather
 * than recording a failure against their name.
 */
export function CheckpointPrompt({
  checkpoint,
  onPass,
}: {
  checkpoint: Checkpoint;
  onPass: () => void;
}) {
  const [wrong, setWrong] = useState<number | null>(null);

  return (
    <div className="absolute inset-0 grid place-items-center bg-navy-900/90 p-5">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface p-5">
        <p className="mb-3 text-sm font-semibold text-ink">{checkpoint.prompt}</p>
        {checkpoint.options.map((option, i) => (
          <button
            key={i}
            type="button"
            onClick={() => (i === checkpoint.correctIndex ? onPass() : setWrong(i))}
            className={`mb-1.5 flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] ${
              wrong === i ? "border-red-300 bg-red-50 text-red-700" : "border-line hover:border-navy-800 hover:bg-navy-50/40"
            }`}
          >
            <span
              aria-hidden
              className="h-3 w-3 flex-none rounded-full border-[1.5px] border-navy-200"
            />
            {option}
          </button>
        ))}
        <p className="mt-2 text-[11.5px] text-muted">
          {wrong !== null
            ? "Not quite — have another go."
            : "The video continues once you answer. This isn't scored or recorded."}
        </p>
      </div>
    </div>
  );
}
