"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const sectionSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  slug: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable().optional()
  ),
  summary: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable().optional()
  ),
  body: z.preprocess((v) => v ?? "", z.string()),
  order: z.coerce.number().int().default(0),
  active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type SectionActionState = { error?: string } | null;

function parseSection(formData: FormData) {
  return sectionSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    summary: formData.get("summary"),
    body: formData.get("body"),
    order: formData.get("order") ?? 0,
    active: formData.get("active"),
  });
}

export async function createSection(
  _prev: SectionActionState,
  formData: FormData
): Promise<SectionActionState> {
  await requireAdmin();
  const parsed = parseSection(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const slug = d.slug ? slugify(d.slug) : slugify(d.title);
  const clash = await prisma.handbookSection.findUnique({ where: { slug } });
  if (clash) return { error: "A section with that slug already exists." };
  await prisma.handbookSection.create({
    data: {
      slug,
      title: d.title,
      summary: d.summary ?? null,
      body: d.body,
      order: d.order,
      active: d.active,
    },
  });
  revalidatePath("/admin/handbook");
  redirect("/admin/handbook");
}

export async function updateSection(
  id: string,
  _prev: SectionActionState,
  formData: FormData
): Promise<SectionActionState> {
  await requireAdmin();
  const parsed = parseSection(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const d = parsed.data;
  const slug = d.slug ? slugify(d.slug) : slugify(d.title);
  const clash = await prisma.handbookSection.findFirst({
    where: { slug, NOT: { id } },
  });
  if (clash) return { error: "Another section already uses that slug." };
  await prisma.handbookSection.update({
    where: { id },
    data: {
      slug,
      title: d.title,
      summary: d.summary ?? null,
      body: d.body,
      order: d.order,
      active: d.active,
    },
  });
  revalidatePath("/admin/handbook");
  redirect("/admin/handbook");
}

export async function deleteSection(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (id) {
    await prisma.handbookSection.delete({ where: { id } });
    revalidatePath("/admin/handbook");
  }
}

// ── Resources ──

export async function uploadResource(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  const title = (formData.get("title") as string | null)?.trim();
  const category = (formData.get("category") as string | null)?.trim() || "Other";

  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin/handbook?resError=Choose+a+file");
  }
  const f = file as File;
  if (f.size > 25 * 1024 * 1024) {
    redirect("/admin/handbook?resError=File+too+large+(max+25MB)");
  }
  const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`resources/${safeName}`, f, {
    access: "public",
    addRandomSuffix: true,
  });
  await prisma.resource.create({
    data: {
      title: title && title.length ? title : f.name,
      category,
      blobUrl: blob.url,
      contentType: f.type || null,
      sizeBytes: f.size,
      uploadedById: admin.id,
    },
  });
  revalidatePath("/admin/handbook");
  revalidatePath("/handbook");
}

export async function deleteResource(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  const r = await prisma.resource.findUnique({ where: { id } });
  if (!r) return;
  try {
    await del(r.blobUrl);
  } catch {
    // ignore
  }
  await prisma.resource.delete({ where: { id } });
  revalidatePath("/admin/handbook");
  revalidatePath("/handbook");
}
