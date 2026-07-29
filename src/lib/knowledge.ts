/** Knowledge Base article authoring helpers (front-matter + slugs). */

export type ParsedArticle = {
  title?: string;
  category?: string;
  summary?: string;
  readingMinutes?: number;
  body: string;
};

/**
 * Parse a pasted article: an optional `--- key: value ---` front-matter block
 * followed by the Markdown body. Tolerant of quotes and key spelling variants.
 */
export function parseArticleMarkdown(input: string): ParsedArticle {
  const text = input.replace(/\r\n/g, "\n").replace(/^﻿/, "").trimStart();
  const fm = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(text);
  if (!fm) return { body: input.trim() };

  const meta: Record<string, string> = {};
  for (const line of fm[1].split("\n")) {
    const m = /^([A-Za-z_ -]+):[ \t]*(.*)$/.exec(line.trim());
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/[ -]/g, "_");
      meta[key] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }

  const body = text.slice(fm[0].length).trim();
  const rmRaw = meta["reading_minutes"] ?? meta["reading_time"] ?? meta["readingminutes"];
  const rm = rmRaw ? parseInt(rmRaw, 10) : NaN;

  return {
    title: meta["title"] || undefined,
    category: meta["category"] || undefined,
    summary: meta["summary"] || undefined,
    readingMinutes: Number.isFinite(rm) ? rm : undefined,
    body,
  };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** ~200 wpm reading estimate, floored at 1 minute. */
export function estimateReadingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** The house prompt shown in the admin so anyone can generate an article. */
export const ARTICLE_PROMPT = `You are writing ONE focused article ("knowledge bite") for Forefront
Consulting's internal Knowledge Base. One idea, a 3-6 minute read.
Output ONLY the article in the exact format below - no preamble.

---
title: <concise, specific title>
category: <e.g. Strategy Consulting | AI-Strategy Consulting | Assignment Phases | Change Management & Influence>
summary: <one sentence, max 160 chars>
reading_minutes: <integer>
---

Write the body in Markdown:
- Start with a short "## Key takeaways" list (2-4 bullets).
- Use ## / ### headings, short paragraphs, and bullet lists.
- Use | tables | for comparisons, matrices, and grids.
- Use numbered lists for steps or phases.
- **Bold** key terms.
- Add callout boxes where useful (a blockquote whose first line is a tag):
  > [!KEY] The single most important takeaway.
  > [!TIP] A practical tip.
  > [!NOTE] Context or a definition.
  > [!WARNING] A common pitfall.
- When a process, flow, relationship, or 2x2 makes it clearer, add a
  Mermaid diagram in a fenced code block, e.g.:
  \`\`\`mermaid
  flowchart LR
    A[New Lead] --> B[Assignment Mgmt] --> C[Closure] --> D[Continuous Development]
  \`\`\`

Stay accurate to the source; do NOT invent figures, names, or numbers.

TOPIC: <what this article covers>
SOURCE: <paste the relevant slides / text here>`;
