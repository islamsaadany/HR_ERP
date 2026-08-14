"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { normalizeBuName, sameBuName } from "@/lib/business-units";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Result shape consumed by ToastResultForm (green/red toast + silent refresh). */
export type BuResult = { ok: boolean; error?: string };
const err = (error: string): BuResult => ({ ok: false, error });
const ok = (): BuResult => ({ ok: true });

/** All units (for case-insensitive dedupe). */
async function allNames(exceptId?: string): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.businessUnit.findMany({ select: { id: true, name: true } });
  return exceptId ? rows.filter((r) => r.id !== exceptId) : rows;
}

/** Add a business unit (name only; brand defaults to navy/gold, editable after). */
export async function addBusinessUnit(formData: FormData): Promise<BuResult> {
  await requireSuperUser();
  const name = normalizeBuName((formData.get("name") as string | null) ?? "");
  if (!name) return err("Enter a business unit name.");
  if ((await allNames()).some((u) => sameBuName(u.name, name))) {
    return err("A business unit with that name already exists.");
  }
  const count = await prisma.businessUnit.count();
  await prisma.businessUnit.create({ data: { name, shortName: name, order: count } });
  revalidatePath("/", "layout");
  return ok();
}

/** Edit a unit's brand: name, short name, colors, and logo (upload / remove). */
export async function updateBusinessUnit(formData: FormData): Promise<BuResult> {
  await requireSuperUser();
  const id = (formData.get("id") as string | null)?.trim() || "";
  const name = normalizeBuName((formData.get("name") as string | null) ?? "");
  const platformName = ((formData.get("platformName") as string | null) ?? "").trim();
  const shortName = ((formData.get("shortName") as string | null) ?? "").trim();
  const primaryColor = ((formData.get("primaryColor") as string | null) ?? "").trim().toLowerCase();
  const accentColor = ((formData.get("accentColor") as string | null) ?? "").trim().toLowerCase();
  const removeLogo = formData.get("removeLogo") === "on";
  const file = formData.get("logo");

  const existing = await prisma.businessUnit.findUnique({ where: { id } });
  if (!existing) return err("That business unit no longer exists.");
  if (!name) return err("Enter a business unit name.");
  if (!shortName) return err("Enter a short name.");
  if (!HEX.test(primaryColor) || !HEX.test(accentColor)) return err("Colors must be hex like #1a2b3c.");
  if ((await allNames(id)).some((u) => sameBuName(u.name, name))) {
    return err("Another business unit already uses that name.");
  }

  let logoUrl = existing.logoUrl;
  if (removeLogo) logoUrl = null;
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return err("Logo must be an image.");
    if (file.size > 2 * 1024 * 1024) return err("Logo too large (max 2MB).");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    try {
      const blob = await put(`business-units/${id}/${safeName}`, file, {
        access: "private",
        addRandomSuffix: true,
      });
      logoUrl = blob.url;
    } catch (uploadErr) {
      console.error("[business-units] logo upload failed:", uploadErr);
      return err(
        !process.env.BLOB_READ_WRITE_TOKEN
          ? "Logo upload failed — file storage isn't configured yet (BLOB_READ_WRITE_TOKEN is missing)."
          : "Logo upload failed — please try again.",
      );
    }
  }

  await prisma.businessUnit.update({
    where: { id },
    data: { name, platformName: platformName || null, shortName, primaryColor, accentColor, logoUrl },
  });
  revalidatePath("/", "layout");
  return ok();
}

/** Remove a unit — blocked while any employee is assigned to it. */
export async function removeBusinessUnit(formData: FormData): Promise<BuResult> {
  await requireSuperUser();
  const id = (formData.get("id") as string | null)?.trim() || "";
  const inUse = await prisma.user.count({ where: { businessUnitId: id } });
  if (inUse > 0) {
    return err(`Can't remove — ${inUse} employee${inUse === 1 ? " is" : "s are"} still assigned to it.`);
  }
  await prisma.businessUnit.delete({ where: { id } });
  revalidatePath("/", "layout");
  return ok();
}
