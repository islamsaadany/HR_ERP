"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put, del } from "@vercel/blob";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { slugify, estimateReadingMinutes } from "@/lib/knowledge";

const MAX_DECK_BYTES = 25 * 1024 * 1024;

type DeckFields = {
  attachmentUrl: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
};

/**
 * Resolve the deck (PDF) attachment for a save.
 * - new file present  -> validate (PDF, ≤25MB), upload to Blob, delete the old blob, set fields
 * - "removeDeck" flag  -> delete the existing blob, clear the fields
 * - otherwise          -> keep whatever is stored (`{ keep: true }` — no change)
 * `existing` is the currently-stored deck (edit flow) so we can clean up the old blob.
 */
async function resolveDeck(
  formData: FormData,
  slug: string,
  existing?: { attachmentUrl: string | null }
): Promise<{ fields: DeckFields } | { keep: true } | { error: string }> {
  const file = formData.get("deck");
  const remove = formData.get("removeDeck");

  if (file instanceof File && file.size > 0) {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return { error: "The deck must be a PDF file." };
    if (file.size > MAX_DECK_BYTES) return { error: "The deck is too large (max 25MB)." };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const blob = await put(`knowledge/${slug}/${safeName}`, file, {
      access: "public",
      addRandomSuffix: true,
    });
    if (existing?.attachmentUrl) {
      try {
        await del(existing.attachmentUrl);
      } catch {
        /* best-effort cleanup of the replaced deck */
      }
    }
    return {
      fields: {
        attachmentUrl: blob.url,
        attachmentName: file.name,
        attachmentType: file.type || "application/pdf",
        attachmentSize: file.size,
      },
    };
  }

  if (remove === "on" || remove === "true") {
    if (existing?.attachmentUrl) {
      try {
        await del(existing.attachmentUrl);
      } catch {
        /* best-effort cleanup */
      }
    }
    return { fields: { attachmentUrl: null, attachmentName: null, attachmentType: null, attachmentSize: null } };
  }

  return { keep: true };
}

const articleSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  cluster: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable().optional()
  ),
  category: z.string().trim().min(1, "Topic is required"),
  slug: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable().optional()
  ),
  summary: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable().optional()
  ),
  body: z.preprocess((v) => v ?? "", z.string()),
  readingMinutes: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.coerce.number().int().positive().nullable().optional()
  ),
  order: z.coerce.number().int().default(0),
  published: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type ArticleActionState = { error?: string } | null;

function parse(formData: FormData) {
  return articleSchema.safeParse({
    title: formData.get("title"),
    cluster: formData.get("cluster"),
    category: formData.get("category"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    body: formData.get("body"),
    readingMinutes: formData.get("readingMinutes"),
    order: formData.get("order") ?? 0,
    published: formData.get("published"),
  });
}

export async function createArticle(
  _prev: ArticleActionState,
  formData: FormData
): Promise<ArticleActionState> {
  const admin = await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const slug = slugify(d.slug || d.title);
  if (!slug) return { error: "Could not derive a slug from the title." };
  const clash = await prisma.knowledgeArticle.findUnique({ where: { slug } });
  if (clash) return { error: "An article with that slug already exists." };
  const deck = await resolveDeck(formData, slug);
  if ("error" in deck) return { error: deck.error };
  const deckFields = "fields" in deck ? deck.fields : {};
  await prisma.knowledgeArticle.create({
    data: {
      slug,
      title: d.title,
      cluster: d.cluster ?? null,
      category: d.category,
      summary: d.summary ?? null,
      body: d.body,
      readingMinutes: d.readingMinutes ?? estimateReadingMinutes(d.body),
      order: d.order,
      published: d.published,
      authorId: admin.id,
      ...deckFields,
    },
  });
  revalidatePath("/admin/knowledge");
  revalidatePath("/knowledge");
  redirect("/admin/knowledge");
}

export async function updateArticle(
  id: string,
  _prev: ArticleActionState,
  formData: FormData
): Promise<ArticleActionState> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const slug = slugify(d.slug || d.title);
  if (!slug) return { error: "Could not derive a slug from the title." };
  const existing = await prisma.knowledgeArticle.findUnique({
    where: { id },
    select: { attachmentUrl: true },
  });
  if (!existing) return { error: "Article not found." };
  const clash = await prisma.knowledgeArticle.findFirst({ where: { slug, NOT: { id } } });
  if (clash) return { error: "Another article already uses that slug." };
  const deck = await resolveDeck(formData, slug, existing);
  if ("error" in deck) return { error: deck.error };
  const deckFields = "fields" in deck ? deck.fields : {};
  await prisma.knowledgeArticle.update({
    where: { id },
    data: {
      slug,
      title: d.title,
      cluster: d.cluster ?? null,
      category: d.category,
      summary: d.summary ?? null,
      body: d.body,
      readingMinutes: d.readingMinutes ?? estimateReadingMinutes(d.body),
      order: d.order,
      published: d.published,
      ...deckFields,
    },
  });
  revalidatePath("/admin/knowledge");
  revalidatePath("/knowledge");
  redirect("/admin/knowledge");
}

export async function deleteArticle(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (id) {
    const existing = await prisma.knowledgeArticle.findUnique({
      where: { id },
      select: { attachmentUrl: true },
    });
    await prisma.knowledgeArticle.delete({ where: { id } });
    if (existing?.attachmentUrl) {
      try {
        await del(existing.attachmentUrl);
      } catch {
        /* best-effort cleanup of the article's deck */
      }
    }
    revalidatePath("/admin/knowledge");
    revalidatePath("/knowledge");
  }
}

/**
 * Reorder a cluster, a topic within its cluster, or an article within its topic,
 * then renumber every article's `order` canonically as
 * clusterIndex*10000 + topicIndex*100 + articleIndex. Gap-free, no ties.
 * `kind` is "cluster" | "topic" | "article", `dir` is "up" | "down".
 */
export async function reorderKnowledge(formData: FormData): Promise<void> {
  await requireAdmin();
  const kind = formData.get("kind") as string;
  const dir = formData.get("dir") as string;
  const id = formData.get("id") as string | null;
  const cluster = formData.get("cluster") as string | null;
  const category = formData.get("category") as string | null;

  const all = await prisma.knowledgeArticle.findMany();
  const sorted = [...all].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const key = (c: string | null) => c ?? "";
  // cluster -> ordered topics -> ordered articles
  const clusterOrder: string[] = [];
  const clusters = new Map<string, { topicOrder: string[]; byTopic: Map<string, typeof all> }>();
  for (const a of sorted) {
    const ck = key(a.cluster);
    if (!clusters.has(ck)) {
      clusters.set(ck, { topicOrder: [], byTopic: new Map() });
      clusterOrder.push(ck);
    }
    const grp = clusters.get(ck)!;
    if (!grp.byTopic.has(a.category)) {
      grp.byTopic.set(a.category, []);
      grp.topicOrder.push(a.category);
    }
    grp.byTopic.get(a.category)!.push(a);
  }

  const swap = <T,>(arr: T[], i: number, d: string) => {
    const j = d === "up" ? i - 1 : i + 1;
    if (i >= 0 && j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]];
  };

  if (kind === "cluster" && cluster != null) {
    swap(clusterOrder, clusterOrder.indexOf(key(cluster)), dir);
  } else if (kind === "topic" && cluster != null && category) {
    const grp = clusters.get(key(cluster));
    if (grp) swap(grp.topicOrder, grp.topicOrder.indexOf(category), dir);
  } else if (kind === "article" && id) {
    const a = all.find((x) => x.id === id);
    const grp = a ? clusters.get(key(a.cluster)) : undefined;
    const list = a && grp ? grp.byTopic.get(a.category) : undefined;
    if (list) swap(list, list.findIndex((x) => x.id === id), dir);
  }

  const targets: { id: string; order: number }[] = [];
  clusterOrder.forEach((ck, ci) => {
    const grp = clusters.get(ck)!;
    grp.topicOrder.forEach((t, ti) => {
      grp.byTopic.get(t)!.forEach((a, ai) => {
        const newOrder = ci * 10000 + ti * 100 + ai;
        if (a.order !== newOrder) targets.push({ id: a.id, order: newOrder });
      });
    });
  });
  if (targets.length) {
    await prisma.$transaction(
      targets.map((t) => prisma.knowledgeArticle.update({ where: { id: t.id }, data: { order: t.order } }))
    );
  }

  revalidatePath("/admin/knowledge");
  revalidatePath("/knowledge");
}
