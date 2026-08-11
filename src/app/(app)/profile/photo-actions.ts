"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const OK_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Only delete blobs we host (never an external Google photo URL). */
function isOwnBlob(url: string | null | undefined): url is string {
  return !!url && url.includes("blob.vercel-storage.com");
}

/** Employee self-service: upload/replace their own profile photo (spec: profile picture). */
export async function updateProfilePhoto(formData: FormData): Promise<void> {
  const me = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/profile?photoError=" + encodeURIComponent("Choose an image."));
  }
  const f = file as File;
  if (f.size > MAX_BYTES) {
    redirect("/profile?photoError=" + encodeURIComponent("Image too large — max 5 MB."));
  }
  if (f.type && !OK_TYPES.includes(f.type)) {
    redirect("/profile?photoError=" + encodeURIComponent("Use a JPG, PNG, WEBP or GIF image."));
  }

  const ext = (f.name.split(".").pop() ?? "img").replace(/[^a-z0-9]/gi, "").toLowerCase() || "img";
  const blob = await put(`avatars/${me.id}.${ext}`, f, { access: "public", addRandomSuffix: true });

  const prev = await prisma.user.findUnique({ where: { id: me.id }, select: { photoUrl: true } });
  await prisma.user.update({ where: { id: me.id }, data: { photoUrl: blob.url } });
  if (isOwnBlob(prev?.photoUrl)) {
    try { await del(prev.photoUrl); } catch { /* already gone — ignore */ }
  }

  revalidatePath("/profile");
  revalidatePath("/directory");
  revalidatePath("/", "layout"); // refresh the nav avatar
}

/** Employee self-service: remove their profile photo (falls back to initials). */
export async function removeProfilePhoto(): Promise<void> {
  const me = await requireUser();
  const prev = await prisma.user.findUnique({ where: { id: me.id }, select: { photoUrl: true } });
  await prisma.user.update({ where: { id: me.id }, data: { photoUrl: null } });
  if (isOwnBlob(prev?.photoUrl)) {
    try { await del(prev.photoUrl); } catch { /* already gone — ignore */ }
  }
  revalidatePath("/profile");
  revalidatePath("/directory");
  revalidatePath("/", "layout");
}
