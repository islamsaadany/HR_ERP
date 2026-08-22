"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteBlock, upsertLessonBlock } from "@/app/(app)/admin/learning/actions";
import { videoSourceFor } from "@/lib/learning/video";
import { LessonVideoSettings, type CheckpointRow } from "@/components/learning/LessonVideoSettings";
import { BTN_DANGER, BTN_GHOST, BTN_NAVY, CHIP, INPUT, LABEL } from "@/components/learning/ui";

export type EditableBlock = {
  id: string;
  type: "VIDEO" | "TEXT" | "FILE";
  text: string | null;
  externalUrl: string | null;
  videoSource: "YOUTUBE" | "VIMEO" | "DRIVE" | "DIRECT_FILE" | null;
  fileName: string | null;
};

export type EditableLesson = {
  id: string;
  title: string;
  isRequired: boolean;
  estimatedMinutes: number | null;
  videoDurationSec: number | null;
  minWatchPercent: number;
  blocks: EditableBlock[];
  checkpoints: CheckpointRow[];
};

const SOURCE_LABEL: Record<string, string> = {
  YOUTUBE: "YouTube",
  VIMEO: "Vimeo",
  DRIVE: "Google Drive",
  DIRECT_FILE: "Direct file",
};

/**
 * The right-hand lesson editor.
 *
 * Video is a LINK field — the platform hosts no video (research D8), so there is no upload control
 * here by design. As soon as a link is typed we classify it and say what we can do with it, rather
 * than letting someone set a watch requirement and discover at publish time that Google Drive
 * can't report playback.
 */
export function LessonEditor({
  courseId,
  lesson,
  pending,
  onSave,
  onDelete,
}: {
  courseId: string;
  lesson: EditableLesson;
  pending: boolean;
  onSave: (input: {
    title: string;
    isRequired: boolean;
    estimatedMinutes: number | null;
    minWatchPercent: number;
  }) => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [blockPending, startBlock] = useTransition();
  const [blockError, setBlockError] = useState<string | null>(null);

  const [title, setTitle] = useState(lesson.title);
  const [isRequired, setIsRequired] = useState(lesson.isRequired);
  const [minutes, setMinutes] = useState(lesson.estimatedMinutes?.toString() ?? "");
  const [watch, setWatch] = useState(lesson.minWatchPercent.toString());

  const videoBlock = lesson.blocks.find((b) => b.type === "VIDEO");
  const textBlock = lesson.blocks.find((b) => b.type === "TEXT");
  const [videoUrl, setVideoUrl] = useState(videoBlock?.externalUrl ?? "");
  const [text, setText] = useState(textBlock?.text ?? "");

  // Classified as you type, so the consequence of a Drive link is visible before saving.
  const draftSource = videoUrl.trim() ? videoSourceFor(videoUrl.trim()) : null;
  const untrackable = draftSource === "DRIVE";

  function saveBlock(type: "VIDEO" | "TEXT", value: string, blockId: string | null) {
    setBlockError(null);
    startBlock(async () => {
      const r = await upsertLessonBlock(courseId, { lessonId: lesson.id, blockId, type, value });
      if (!r.ok) setBlockError(r.error);
      else router.refresh();
    });
  }

  const busy = pending || blockPending;

  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <label className={LABEL} htmlFor="lesson-title">Lesson title</label>
      <input
        id="lesson-title"
        className={INPUT}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {/* Three small settings on one line, each sized to what it actually holds — Minutes takes two
          digits, not a sentence. Labels shortened to match (layout A, approved 2026-08-21). */}
      <div className="mt-2.5 grid grid-cols-[88px_96px_1fr] gap-2">
        <div>
          <label className={LABEL} htmlFor="lesson-minutes">Minutes</label>
          <input
            id="lesson-minutes"
            className={INPUT}
            inputMode="numeric"
            // Left blank on purpose once a video has been watched: the measured length shows
            // beneath, and typing over it should be a deliberate act, not the default.
            placeholder={
              lesson.videoDurationSec
                ? `≈${Math.max(1, Math.ceil(lesson.videoDurationSec / 60))}`
                : "—"
            }
            title={
              lesson.videoDurationSec
                ? "Measured from the video. Type a number only if you want to override it."
                : "Optional. Once someone watches the video, its real length appears here."
            }
            value={minutes}
            onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="lesson-watch">Must watch</label>
          <input
            id="lesson-watch"
            className={INPUT}
            inputMode="numeric"
            value={watch}
            disabled={untrackable}
            title="Percent of the video that must be watched. 0 for no requirement."
            onChange={(e) => {
              const n = Math.min(100, Number(e.target.value.replace(/\D/g, "") || 0));
              setWatch(String(n));
            }}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="lesson-required">Progress</label>
          <select
            id="lesson-required"
            className={INPUT}
            value={isRequired ? "required" : "optional"}
            onChange={(e) => setIsRequired(e.target.value === "required")}
          >
            <option value="required">Required — counts</option>
            <option value="optional">Optional</option>
          </select>
        </div>
      </div>

      <div className="mt-2.5">
        <label className={LABEL} htmlFor="lesson-video">Video link</label>
        <input
          id="lesson-video"
          className={`${INPUT} font-mono text-[12.5px]`}
          value={videoUrl}
          placeholder="https://vimeo.com/…"
          onChange={(e) => setVideoUrl(e.target.value)}
        />
        <div className="mt-1 flex items-center gap-2">
          {draftSource ? (
            <span className={untrackable ? CHIP.attention : CHIP.navy}>
              {SOURCE_LABEL[draftSource]}
            </span>
          ) : null}
          <span className="text-[11.5px] text-muted">
            {draftSource == null
              ? "Unlisted Vimeo or YouTube. Video isn't hosted here."
              : untrackable
                ? "Playback can't be measured — this lesson can't be gated."
                : "Playback can be measured, so a watch requirement will work."}
          </span>
          {videoUrl.trim() && videoUrl.trim() !== (videoBlock?.externalUrl ?? "") ? (
            <button
              type="button"
              disabled={busy}
              className={BTN_GHOST}
              onClick={() => saveBlock("VIDEO", videoUrl, videoBlock?.id ?? null)}
            >
              Save link
            </button>
          ) : null}
        </div>
      </div>

      {untrackable ? (
        <p className="mt-2 rounded-r-lg border-l-[3px] border-red-500 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          Google Drive can&rsquo;t report playback, so this lesson can&rsquo;t be gated or carry a
          checkpoint. The video will still play.
        </p>
      ) : null}

      <LessonVideoSettings
        courseId={courseId}
        lessonId={lesson.id}
        trackable={!untrackable && !!videoBlock}
        checkpoints={lesson.checkpoints}
      />

      {/* Notes start closed — most lessons have none, and an empty textarea was costing ~120px of
          height on every lesson to show nothing. The chip says whether there is anything inside. */}
      <details className="mt-2.5 rounded-lg border border-line bg-surface" open={!!textBlock?.text}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[12.5px] font-semibold text-navy-700 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition-transform">›</span>
          Notes
          <span className={CHIP.muted}>{textBlock?.text ? "written" : "empty"}</span>
        </summary>
        <div className="px-2.5 pb-2.5">
          <textarea
            id="lesson-text"
            aria-label="Lesson notes, markdown"
            className={`${INPUT} min-h-[90px]`}
            value={text}
            placeholder="Markdown…"
            onChange={(e) => setText(e.target.value)}
          />
          {text.trim() !== (textBlock?.text ?? "") ? (
            <button
              type="button"
              disabled={busy}
              className={`${BTN_GHOST} mt-1.5`}
              onClick={() => saveBlock("TEXT", text, textBlock?.id ?? null)}
            >
              Save notes
            </button>
          ) : null}
        </div>
      </details>

      {blockError ? (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {blockError}
        </p>
      ) : null}

      {/* The per-block list that used to sit here is gone (2026-08-21). It listed the video and
          the notes with their own Remove buttons — the same two things the Video link field and the
          Notes box above already show and already edit. Two ways to delete the same thing, one of
          them unlabelled, is worse than one. */}

      <div className="mt-3 flex justify-between gap-2">
        <button
          type="button"
          disabled={busy || !title.trim()}
          className={BTN_NAVY}
          onClick={() =>
            onSave({
              title,
              isRequired,
              estimatedMinutes: minutes ? Number(minutes) : null,
              minWatchPercent: untrackable ? 0 : Number(watch || 0),
            })
          }
        >
          Save lesson
        </button>
        <button type="button" disabled={busy} className={BTN_DANGER} onClick={onDelete}>
          Delete lesson
        </button>
      </div>
    </div>
  );
}
