"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { slugify, estimateReadingMinutes } from "@/lib/knowledge";

const articleSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  category: z.string().trim().min(1, "Category is required"),
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
  await prisma.knowledgeArticle.create({
    data: {
      slug,
      title: d.title,
      category: d.category,
      summary: d.summary ?? null,
      body: d.body,
      readingMinutes: d.readingMinutes ?? estimateReadingMinutes(d.body),
      order: d.order,
      published: d.published,
      authorId: admin.id,
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
  const clash = await prisma.knowledgeArticle.findFirst({ where: { slug, NOT: { id } } });
  if (clash) return { error: "Another article already uses that slug." };
  await prisma.knowledgeArticle.update({
    where: { id },
    data: {
      slug,
      title: d.title,
      category: d.category,
      summary: d.summary ?? null,
      body: d.body,
      readingMinutes: d.readingMinutes ?? estimateReadingMinutes(d.body),
      order: d.order,
      published: d.published,
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
    await prisma.knowledgeArticle.delete({ where: { id } });
    revalidatePath("/admin/knowledge");
    revalidatePath("/knowledge");
  }
}
