"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { BRAND_DEFAULTS } from "@/lib/brand";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Result shape consumed by ToastResultForm (green/red toast + silent refresh). */
export type BrandResult = { ok: boolean; error?: string };
const err = (error: string): BrandResult => ({ ok: false, error });

export async function updateBrand(formData: FormData): Promise<BrandResult> {
  await requireSuperUser();

  const companyName = (formData.get("companyName") as string | null)?.trim() || "";
  const platformName = (formData.get("platformName") as string | null)?.trim() || "";
  const shortName = (formData.get("shortName") as string | null)?.trim() || "";
  const primaryColor = ((formData.get("primaryColor") as string | null)?.trim() || "").toLowerCase();
  const accentColor = ((formData.get("accentColor") as string | null)?.trim() || "").toLowerCase();
  const removeLogo = formData.get("removeLogo") === "on";
  const file = formData.get("logo");

  if (!companyName || !shortName) return err("Company name and short name are required.");
  if (!HEX.test(primaryColor) || !HEX.test(accentColor)) return err("Colors must be hex like #1a2b3c.");

  const existing = await prisma.brandSettings.findFirst();
  let logoUrl = existing?.logoUrl ?? null;

  if (removeLogo) logoUrl = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return err("Logo must be an image.");
    if (file.size > 2 * 1024 * 1024) return err("Logo too large (max 2MB).");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    try {
      const blob = await put(`brand/${safeName}`, file, { access: "private", addRandomSuffix: true });
      logoUrl = blob.url;
    } catch (uploadErr) {
      console.error("[brand] logo upload to Vercel Blob failed:", uploadErr);
      return err(
        !process.env.BLOB_READ_WRITE_TOKEN
          ? "Logo upload failed — file storage isn't configured yet (BLOB_READ_WRITE_TOKEN is missing)."
          : "Logo upload failed — please try again.",
      );
    }
  }

  await prisma.brandSettings.upsert({
    where: { id: "singleton" },
    update: { companyName, platformName: platformName || null, shortName, primaryColor, accentColor, logoUrl },
    create: { id: "singleton", companyName, platformName: platformName || null, shortName, primaryColor, accentColor, logoUrl },
  });

  revalidatePath("/", "layout"); // re-theme + re-name across the whole app
  return { ok: true };
}

export async function resetBrand(): Promise<BrandResult> {
  await requireSuperUser();
  await prisma.brandSettings.upsert({
    where: { id: "singleton" },
    update: {
      companyName: BRAND_DEFAULTS.companyName,
      platformName: null,
      shortName: BRAND_DEFAULTS.shortName,
      logoUrl: null,
      primaryColor: BRAND_DEFAULTS.primaryColor,
      accentColor: BRAND_DEFAULTS.accentColor,
    },
    create: { id: "singleton" },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
