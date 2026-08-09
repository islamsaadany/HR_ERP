"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { BRAND_DEFAULTS } from "@/lib/brand";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function updateBrand(formData: FormData): Promise<void> {
  await requireSuperUser();

  const companyName = (formData.get("companyName") as string | null)?.trim() || "";
  const shortName = (formData.get("shortName") as string | null)?.trim() || "";
  const primaryColor = ((formData.get("primaryColor") as string | null)?.trim() || "").toLowerCase();
  const accentColor = ((formData.get("accentColor") as string | null)?.trim() || "").toLowerCase();
  const removeLogo = formData.get("removeLogo") === "on";
  const file = formData.get("logo");

  if (!companyName || !shortName) {
    redirect("/admin/brand?error=" + encodeURIComponent("Company name and short name are required."));
  }
  if (!HEX.test(primaryColor) || !HEX.test(accentColor)) {
    redirect("/admin/brand?error=" + encodeURIComponent("Colors must be hex like #1a2b3c."));
  }

  const existing = await prisma.brandSettings.findFirst();
  let logoUrl = existing?.logoUrl ?? null;

  if (removeLogo) logoUrl = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      redirect("/admin/brand?error=" + encodeURIComponent("Logo must be an image."));
    }
    if (file.size > 2 * 1024 * 1024) {
      redirect("/admin/brand?error=" + encodeURIComponent("Logo too large (max 2MB)."));
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    try {
      const blob = await put(`brand/${safeName}`, file, { access: "public", addRandomSuffix: true });
      logoUrl = blob.url;
    } catch (err) {
      console.error("[brand] logo upload to Vercel Blob failed:", err);
      const hint = !process.env.BLOB_READ_WRITE_TOKEN
        ? "Logo upload failed — file storage isn't configured yet (BLOB_READ_WRITE_TOKEN is missing)."
        : "Logo upload failed — please try again.";
      redirect("/admin/brand?error=" + encodeURIComponent(hint));
    }
  }

  await prisma.brandSettings.upsert({
    where: { id: "singleton" },
    update: { companyName, shortName, primaryColor, accentColor, logoUrl },
    create: { id: "singleton", companyName, shortName, primaryColor, accentColor, logoUrl },
  });

  revalidatePath("/", "layout"); // re-theme + re-name across the whole app
  redirect("/admin/brand?saved=1");
}

export async function resetBrand(): Promise<void> {
  await requireSuperUser();
  await prisma.brandSettings.upsert({
    where: { id: "singleton" },
    update: {
      companyName: BRAND_DEFAULTS.companyName,
      shortName: BRAND_DEFAULTS.shortName,
      logoUrl: null,
      primaryColor: BRAND_DEFAULTS.primaryColor,
      accentColor: BRAND_DEFAULTS.accentColor,
    },
    create: { id: "singleton" },
  });
  revalidatePath("/", "layout");
  redirect("/admin/brand?saved=1");
}
