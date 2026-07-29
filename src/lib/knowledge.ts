/** Knowledge Base article authoring helpers (front-matter + slugs). */

export type ParsedArticle = {
  title?: string;
  cluster?: string;
  category?: string;
  summary?: string;
  readingMinutes?: number;
  body: string;
};

/** Suggested clusters for the admin form (free-text; any value is allowed). */
export const CLUSTER_SUGGESTIONS = [
  "Consulting",
  "AI in Consulting",
  "Managing Assignments",
  "Personal Development",
];

/**
 * Parse a pasted article: an optional `--- key: value ---` front-matter block
 * followed by the Markdown body. Tolerant of quotes and key spelling variants.
 */
export function parseArticleMarkdown(input: string): ParsedArticle {
  const text = input.replace(/\r\n/g, "\n").replace(/^﻿/, "").trimStart();

  // Front-matter may be wrapped in --- fences, or (tolerantly) just be a leading
  // block of `key: value` lines using the known keys — models/paste often drop the fences.
  let metaBlock: string | null = null;
  let rest = text;

  const fenced = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(text);
  if (fenced) {
    metaBlock = fenced[1];
    rest = text.slice(fenced[0].length);
  } else {
    const lines = text.split("\n");
    const KEY = /^(title|cluster|category|topic|summary|reading[_ ]?minutes|reading[_ ]?time)[ \t]*:/i;
    let i = 0;
    const metaLines: string[] = [];
    while (i < lines.length && KEY.test(lines[i].trim())) {
      metaLines.push(lines[i]);
      i++;
    }
    if (metaLines.length) {
      metaBlock = metaLines.join("\n");
      rest = lines.slice(i).join("\n");
    }
  }

  if (!metaBlock) return { body: text.trim() };

  const meta: Record<string, string> = {};
  for (const line of metaBlock.split("\n")) {
    const m = /^([A-Za-z_ -]+):[ \t]*(.*)$/.exec(line.trim());
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/[ -]/g, "_");
      meta[key] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }

  const rmRaw = meta["reading_minutes"] ?? meta["reading_time"] ?? meta["readingminutes"];
  const rm = rmRaw ? parseInt(rmRaw, 10) : NaN;

  return {
    title: meta["title"] || undefined,
    cluster: meta["cluster"] || undefined,
    category: meta["category"] || meta["topic"] || undefined,
    summary: meta["summary"] || undefined,
    readingMinutes: Number.isFinite(rm) ? rm : undefined,
    body: rest.trim(),
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
Output ONLY the article in the EXACT format below - no preamble, and KEEP the --- fences.

---
title: <SHORT and specific — 3 to 6 words, no colon-subtitle>
cluster: <Consulting | AI in Consulting | Managing Assignments | Personal Development>
category: <the topic within that cluster, e.g. The Consultant's Craft | Engagement Management | Stakeholder Management>
summary: <one sentence, max 160 chars>
reading_minutes: <integer>
---

Write the body in Markdown:
- Start with a "## Key takeaways" heading followed by 2-4 bullets.
- Use ## / ### headings, short paragraphs, and bullet lists.
- Use | tables | for comparisons, matrices, and grids (prefer a table over a diagram).
- Use numbered lists for steps or phases; **bold** key terms.
- Callout boxes where useful (a blockquote whose first line is a tag):
  > [!KEY] The single most important takeaway.
  > [!TIP] A practical tip.
  > [!NOTE] Context or a definition.
  > [!WARNING] A common pitfall.

DIAGRAMS — follow strictly or the page breaks:
- Only add a diagram for a genuinely simple flow/relationship.
- It MUST be inside a fenced \`\`\`mermaid block with VALID mermaid syntax, e.g.:
  \`\`\`mermaid
  flowchart LR
    A[New Lead] --> B[Assignment Mgmt] --> C[Closure] --> D[Continuous Development]
  \`\`\`
- NEVER write diagram node labels as loose lines of text. If you are not
  certain the mermaid is valid, use a table or a bullet list instead.

Stay accurate to the SOURCE; do NOT invent figures, names, or numbers. If a
diagram exists in the source, reproduce it as valid mermaid or a table.

TOPIC: <what this article covers>
SOURCE: <paste the relevant slides / text here>`;
