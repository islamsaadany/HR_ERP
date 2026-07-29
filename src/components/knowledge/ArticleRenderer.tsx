"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./Mermaid";

type Seg =
  | { type: "md"; content: string }
  | { type: "mermaid"; content: string }
  | { type: "callout"; variant: string; content: string };

/** Split the body into Markdown, mermaid, and callout segments (predictable, no raw HTML). */
function segment(body: string): Seg[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const segs: Seg[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.join("").trim()) segs.push({ type: "md", content: buf.join("\n") });
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^```mermaid\s*$/.test(line.trim())) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        code.push(lines[i]);
        i++;
      }
      segs.push({ type: "mermaid", content: code.join("\n") });
      continue;
    }

    const cm = /^>\s*\[!(KEY|TIP|NOTE|WARNING|IMPORTANT)\]\s*(.*)$/i.exec(line);
    if (cm) {
      flush();
      const content: string[] = [];
      if (cm[2].trim()) content.push(cm[2]);
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        content.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      i--;
      segs.push({ type: "callout", variant: cm[1].toUpperCase(), content: content.join("\n") });
      continue;
    }

    buf.push(line);
  }
  flush();
  return segs;
}

const mdComponents: Components = {
  h1: ({ children }) => <h2 className="mt-8 font-serif text-2xl text-ink">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-8 font-serif text-2xl text-ink">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 font-serif text-lg text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-5 text-sm font-semibold uppercase tracking-wide text-gold-600">{children}</h4>,
  p: ({ children }) => <p className="mt-3 text-[15px] leading-relaxed text-ink">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-ink">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] leading-relaxed text-ink">{children}</ol>,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-navy-700 underline underline-offset-2 hover:text-navy-900">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-6 border-line" />,
  blockquote: ({ children }) => (
    <blockquote className="mt-4 border-l-2 border-gold-300 pl-4 text-[15px] italic text-muted">{children}</blockquote>
  ),
  code: ({ className, children }) => {
    const inline = !className;
    return inline ? (
      <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[13px] text-navy-800">{children}</code>
    ) : (
      <code className={className}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-navy-50 p-4 text-[13px] text-navy-900">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-navy-50">{children}</thead>,
  th: ({ children }) => <th className="border border-line px-3 py-2 text-left font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="border border-line px-3 py-2 align-top text-ink">{children}</td>,
};

const CALLOUT: Record<string, { box: string; label: string; name: string }> = {
  KEY: { box: "border-gold-300 bg-gold-50", label: "text-gold-700", name: "Key takeaway" },
  IMPORTANT: { box: "border-gold-300 bg-gold-50", label: "text-gold-700", name: "Important" },
  TIP: { box: "border-navy-200 bg-navy-50", label: "text-navy-700", name: "Tip" },
  NOTE: { box: "border-line bg-surface", label: "text-muted", name: "Note" },
  WARNING: { box: "border-red-300 bg-red-50", label: "text-red-700", name: "Watch out" },
};

function Md({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {content}
    </ReactMarkdown>
  );
}

export function ArticleRenderer({ body }: { body: string }) {
  const segs = segment(body);
  return (
    <div className="article">
      {segs.map((seg, i) => {
        if (seg.type === "mermaid") return <Mermaid key={i} chart={seg.content} />;
        if (seg.type === "callout") {
          const c = CALLOUT[seg.variant] ?? CALLOUT.NOTE;
          return (
            <div key={i} className={"mt-4 rounded-lg border px-4 py-3 " + c.box}>
              <div className={"mb-1 text-[11px] font-semibold uppercase tracking-wide " + c.label}>
                {c.name}
              </div>
              <div className="[&>p:first-child]:mt-0 text-sm">
                <Md content={seg.content} />
              </div>
            </div>
          );
        }
        return <Md key={i} content={seg.content} />;
      })}
    </div>
  );
}
