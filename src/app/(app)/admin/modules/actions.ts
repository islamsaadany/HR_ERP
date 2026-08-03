"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperUser } from "@/lib/roles";
import { MODULES } from "@/lib/modules";

export async function setModuleEnabled(formData: FormData): Promise<void> {
  await requireSuperUser();
  const key = String(formData.get("key") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!MODULES.some((m) => m.key === key)) return;
  await prisma.moduleFlag.upsert({
    where: { key },
    update: { enabled },
    create: { key, enabled },
  });
  revalidatePath("/admin/modules");
  revalidatePath("/", "layout"); // refresh the nav everywhere
}
