"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type PhotoResult = { error?: string };

/** Only delete blobs we host (never an external Google photo URL). */
function isOwnBlob(url: string | null | undefined): url is string {
  return !!url && url.includes("blob.vercel-storage.com");
}

/**
 * Employee self-service: upload/replace their own profile photo (spec: profile picture).
 * Returns a friendly error string instead of throwing/redirecting — this action is called
 * imperatively from the client, where a thrown redirect would surface as a client-side crash.
 */
export async function updateProfilePhoto(formData: FormData): Promise<PhotoResult> {
  const me = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  const f = file as File;
  if (f.size > MAX_BYTES) return { error: "That image is larger than 5 MB — please pick a smaller one." };
  if (f.type && !OK_TYPES.includes(f.type)) {
    return { error: "That image format isn't supported — please use a JPG, PNG, WEBP or GIF." };
  }

  try {
    const ext = (f.name.split(".").pop() ?? "img").replace(/[^a-z0-9]/gi, "").toLowerCase() || "img";
    const blob = await put(`avatars/${me.id}.${ext}`, f, { access: "public", addRandomSuffix: true });

    const prev = await prisma.user.findUnique({ where: { id: me.id }, select: { photoUrl: true } });
    await prisma.user.update({ where: { id: me.id }, data: { photoUrl: blob.url } });
    if (isOwnBlob(prev?.photoUrl)) {
      try { await del(prev.photoUrl); } catch { /* already gone — ignore */ }
    }
  } catch {
    return { error: "Couldn't upload the photo right now — please try again." };
  }

  revalidatePath("/profile");
  revalidatePath("/directory");
  revalidatePath("/", "layout");
  return {};
}

/** Employee self-service: remove their profile photo (falls back to initials). */
export async function removeProfilePhoto(): Promise<PhotoResult> {
  const me = await requireUser();
  try {
    const prev = await prisma.user.findUnique({ where: { id: me.id }, select: { photoUrl: true } });
    await prisma.user.update({ where: { id: me.id }, data: { photoUrl: null } });
    if (isOwnBlob(prev?.photoUrl)) {
      try { await del(prev.photoUrl); } catch { /* already gone — ignore */ }
    }
  } catch {
    return { error: "Couldn't remove the photo right now — please try again." };
  }
  revalidatePath("/profile");
  revalidatePath("/directory");
  revalidatePath("/", "layout");
  return {};
}
