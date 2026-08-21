import { isEmbedVideo } from "@/lib/learning/video";
import { CHIP } from "@/components/learning/ui";

/**
 * The video surface.
 *
 * This release renders the embed/file plainly. The instrumented player — resume, watch-gating and
 * checkpoints — lands in US3 (`VideoLesson.tsx`), which replaces the inner element here while
 * keeping this frame. Splitting it this way means US1 ships a working video lesson without
 * pretending the gate is live before it is.
 */
export function VideoFrame({
  url,
  source,
  title,
}: {
  url: string;
  source: "YOUTUBE" | "VIMEO" | "DRIVE" | "DIRECT_FILE" | null;
  title: string;
}) {
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-navy-900">
        {isEmbedVideo(url) ? (
          <iframe
            src={url}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : (
          <video src={url} controls playsInline className="h-full w-full" />
        )}
      </div>
      {source === "DRIVE" ? (
        <p className="mt-2 text-[11.5px] text-muted">
          <span className={CHIP.muted}>Google Drive</span>{" "}
          Playback can&rsquo;t be measured for this source, so this lesson has no watch requirement.
        </p>
      ) : null}
    </div>
  );
}
