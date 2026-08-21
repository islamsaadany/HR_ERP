import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CHIP } from "@/components/learning/ui";

export type Block = {
  id: string;
  type: "VIDEO" | "TEXT" | "FILE";
  text: string | null;
  externalUrl: string | null;
  videoSource: "YOUTUBE" | "VIMEO" | "DRIVE" | "DIRECT_FILE" | null;
  fileName: string | null;
  fileSizeBytes: number | null;
};

const humanSize = (bytes: number | null) =>
  bytes == null ? "" : bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/**
 * A lesson's content blocks.
 *
 * TEXT is markdown rendered by `react-markdown`, which does not pass raw HTML through — the same
 * choice Knowledge articles make, and the reason this module needs no HTML sanitiser.
 *
 * The VIDEO block is rendered by the client player, not here; this component draws everything
 * around it.
 */
export function LessonContent({ blocks }: { blocks: Block[] }) {
  const nonVideo = blocks.filter((b) => b.type !== "VIDEO");
  if (nonVideo.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {nonVideo.map((block) =>
        block.type === "TEXT" ? (
          <div
            key={block.id}
            className="prose-sm max-w-none text-[14px] leading-relaxed text-ink [&_a]:text-navy-700 [&_a]:underline [&_h2]:mt-4 [&_h2]:font-serif [&_h2]:text-lg [&_li]:my-0.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text ?? ""}</ReactMarkdown>
          </div>
        ) : (
          <a
            key={block.id}
            href={`/api/learning/blocks/${block.id}/file`}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-navy-300"
          >
            <span aria-hidden className="text-lg">📎</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-navy-800">
                {block.fileName ?? "Attachment"}
              </span>
              <span className="text-xs text-muted">{humanSize(block.fileSizeBytes)}</span>
            </span>
            <span className={CHIP.navy}>Download</span>
          </a>
        )
      )}
    </div>
  );
}
