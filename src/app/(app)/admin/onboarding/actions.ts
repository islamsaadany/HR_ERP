"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";

const activitySchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().nullable().optional()
  ),
  type: z.enum(["POLICY", "ACTION"]),
  stage: z.enum(["DAY_1", "WEEK_1", "FIRST_MONTH", "CHECK_INS"]),
  track: z.enum(["COMMON_CORE", "CONSULTING"]),
  linkUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z
      .string()
      .trim()
      .refine(
        (s) => s.startsWith("/") || /^https?:\/\//.test(s),
        "Link must be an internal path (/…) or a valid URL"
      )
      .nullable()
      .optional()
  ),
  order: z.coerce.number().int().default(0),
  active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

export type ActivityActionState = { error?: string } | null;

function parse(formData: FormData) {
  return activitySchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    type: formData.get("type"),
    stage: formData.get("stage"),
    track: formData.get("track"),
    linkUrl: formData.get("linkUrl"),
    order: formData.get("order") ?? 0,
    active: formData.get("active"),
  });
}

export async function createActivity(
  _prev: ActivityActionState,
  formData: FormData
): Promise<ActivityActionState> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await prisma.onboardingActivity.create({ data: parsed.data });
  revalidatePath("/admin/onboarding");
  redirect("/admin/onboarding");
}

export async function updateActivity(
  id: string,
  _prev: ActivityActionState,
  formData: FormData
): Promise<ActivityActionState> {
  await requireAdmin();
  const parsed = parse(formData);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await prisma.onboardingActivity.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/onboarding");
  redirect("/admin/onboarding");
}

export async function deleteActivity(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (id) {
    await prisma.onboardingActivity.delete({ where: { id } });
    revalidatePath("/admin/onboarding");
  }
}
