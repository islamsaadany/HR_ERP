"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ARTICLE_PROMPT, CLUSTER_SUGGESTIONS, parseArticleMarkdown } from "@/lib/knowledge";
import { ArticleRenderer } from "./ArticleRenderer";
import type { ArticleActionState } from "@/app/(app)/admin/knowledge/actions";

type Initial = {
  title: string;
  cluster: string;
  category: string;
  summary: string;
  body: string;
  readingMinutes: string;
  order: number;
  published: boolean;
};

const EMPTY: Initial = {
  title: "",
  cluster: "",
  category: "",
  summary: "",
  body: "",
  readingMinutes: "",
  order: 0,
  published: true,
};

export function ArticleForm({
  action,
  initial,
  submitLabel = "Save article",
}: {
  action: (prev: ArticleActionState, formData: FormData) => Promise<ArticleActionState>;
  initial?: Partial<Initial>;
  submitLabel?: string;
}) {
  const start = { ...EMPTY, ...initial };
  const [state, formAction, pending] = useActionState<ArticleActionState, FormData>(action, null);

  const [paste, setPaste] = useState("");
  const [title, setTitle] = useState(start.title);
  const [cluster, setCluster] = useState(start.cluster);
  const [category, setCategory] = useState(start.category);
  const [summary, setSummary] = useState(start.summary);
  const [body, setBody] = useState(start.body);
  const [readingMinutes, setReadingMinutes] = useState(start.readingMinutes);
  const [order, setOrder] = useState(String(start.order));
  const [published, setPublished] = useState(start.published);
  const [showPrompt, setShowPrompt] = useState(false);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  function applyParse() {
    const p = parseArticleMarkdown(paste);
    if (p.title) setTitle(p.title);
    if (p.cluster) setCluster(p.cluster);
    if (p.category) setCategory(p.category);
    if (p.summary) setSummary(p.summary);
    if (typeof p.readingMinutes === "number") setReadingMinutes(String(p.readingMinutes));
    setBody(p.body);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ARTICLE_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const input =
    "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus:border-navy-500 focus:outline-none";

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: authoring */}
      <form action={formAction} className="space-y-4">
        {/* Prompt helper */}
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-ink">1 · Generate with Claude</div>
            <div className="flex gap-2">
              <button type="button" onClick={copyPrompt} className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-navy-50">
                {copied ? "Copied ✓" : "Copy prompt"}
              </button>
              <button type="button" onClick={() => setShowPrompt((s) => !s)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-navy-50">
                {showPrompt ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">
            Copy this into Claude, add your topic + source, then paste the result below and press Parse.
          </p>
          {showPrompt ? (
            <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-line bg-navy-50 p-3 text-[11px] leading-relaxed text-navy-900 whitespace-pre-wrap">
              {ARTICLE_PROMPT}
            </pre>
          ) : null}
        </div>

        {/* Paste + parse */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">2 · Paste Claude&apos;s output</label>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste the full article (front-matter + body) here…"
            className={input + " h-40 font-mono text-xs"}
          />
          <button type="button" onClick={applyParse} disabled={!paste.trim()} className="mt-2 rounded-lg bg-navy-800 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-50">
            Parse into fields ↓
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-3 border-t border-line pt-4">
          <div className="text-sm font-semibold text-ink">3 · Review &amp; save</div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Title</label>
            <input name="title" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Cluster</label>
            <input name="cluster" value={cluster} onChange={(e) => setCluster(e.target.value)} list="cluster-suggestions" placeholder="e.g. Consulting" className={input} />
            <datalist id="cluster-suggestions">
              {CLUSTER_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Topic</label>
            <input name="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. The Consultant's Craft" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Summary</label>
            <input name="summary" value={summary} onChange={(e) => setSummary(e.target.value)} className={input} />
          </div>
          <div className="flex gap-3">
            <div className="w-28">
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Read (min)</label>
              <input name="readingMinutes" value={readingMinutes} onChange={(e) => setReadingMinutes(e.target.value)} inputMode="numeric" placeholder="auto" className={input} />
            </div>
            <div className="w-24">
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Order</label>
              <input name="order" value={order} onChange={(e) => setOrder(e.target.value)} inputMode="numeric" className={input} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-ink">
              <input type="checkbox" name="published" checked={published} onChange={(e) => setPublished(e.target.checked)} className="h-4 w-4" />
              Published
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Body (Markdown)</label>
            <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} className={input + " h-56 font-mono text-xs"} />
          </div>

          {state?.error ? (
            <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</div>
          ) : null}

          <div className="flex items-center gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700 disabled:opacity-60">
              {pending ? "Saving…" : submitLabel}
            </button>
            <Link href="/admin/knowledge" className="rounded-lg border border-line px-4 py-2.5 text-sm text-muted hover:bg-navy-50">
              Cancel
            </Link>
          </div>
        </div>
      </form>

      {/* Right: live preview */}
      <div className="lg:sticky lg:top-6 h-fit">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">Preview</div>
          <button type="button" onClick={() => setPreview((p) => !p)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:bg-navy-50">
            {preview ? "Hide" : "Show"}
          </button>
        </div>
        {preview ? (
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-line bg-surface p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gold-600">{category || "Category"}</div>
            <h1 className="mt-1 font-serif text-2xl text-ink">{title || "Untitled article"}</h1>
            {summary ? <p className="mt-2 text-muted">{summary}</p> : null}
            <div className="mt-4">
              <ArticleRenderer body={body} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
            Press Show to preview how the article will render (tables, callouts, diagrams).
          </div>
        )}
      </div>
    </div>
  );
}
