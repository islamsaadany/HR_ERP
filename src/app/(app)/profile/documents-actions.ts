"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, isAdmin } from "@/lib/roles";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/** Upload a personal document to the signed-in user's own file. */
export async function uploadMyDocument(formData: FormData): Promise<void> {
  const me = await requireUser();
  const file = formData.get("file");
  const title = (formData.get("title") as string | null)?.trim();

  if (!(file instanceof File) || file.size === 0) {
    redirect("/profile?docError=Choose+a+file");
  }
  const f = file as File;
  if (f.size > MAX_BYTES) {
    redirect("/profile?docError=File+too+large+(max+10MB)");
  }

  const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`personal/${me.id}/${safeName}`, f, {
    access: "public",
    addRandomSuffix: true,
  });

  await prisma.personalDocument.create({
    data: {
      ownerId: me.id,
      title: title && title.length > 0 ? title : f.name,
      blobUrl: blob.url,
      contentType: f.type || null,
      sizeBytes: f.size,
      uploadedById: me.id,
    },
  });

  revalidatePath("/profile");
}

/** Delete a personal document. Owner or HR/Super User only. */
export async function deleteMyDocument(formData: FormData): Promise<void> {
  const me = await requireUser();
  const id = formData.get("id") as string;
  if (!id) return;

  const doc = await prisma.personalDocument.findUnique({ where: { id } });
  if (!doc) return;
  if (doc.ownerId !== me.id && !isAdmin(me.role)) {
    redirect("/profile?docError=Not+allowed");
  }

  try {
    await del(doc.blobUrl);
  } catch {
    // Blob may already be gone; still remove the record.
  }
  await prisma.personalDocument.delete({ where: { id } });
  revalidatePath("/profile");
}
