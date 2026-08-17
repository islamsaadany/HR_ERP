"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDataRequestManager } from "@/lib/roles";
import { normalizeCampaignKeys } from "@/lib/profile/campaign-fields";

export type CampaignState = { error?: string } | null;

/**
 * Launch a data request campaign (spec 033, US2).
 *
 * The audience is resolved to a concrete list of ACTIVE employees here, at launch (FR-002):
 * "who was asked" stays auditable, and later hires are never silently added. Every target
 * gets one PENDING state per requested field.
 */
export async function createCampaign(
  _prev: CampaignState,
  formData: FormData
): Promise<CampaignState> {
  const actor = await requireDataRequestManager();

  const title = String(formData.get("title") ?? "").trim();
  if (title === "") return { error: "Give the request a title — employees see it." };
  if (title.length > 120) return { error: "The title is too long (max 120)." };

  const fields = normalizeCampaignKeys(
    formData.getAll("fields").map(String)
  );
  if (fields.length === 0) return { error: "Pick at least one field to request." };

  const audienceMode = String(formData.get("audience") ?? "all");
  let where: object;
  let audienceLabel: string;
  if (audienceMode === "departments") {
    const departments = formData.getAll("departments").map(String).filter(Boolean);
    if (departments.length === 0) return { error: "Pick at least one department." };
    where = { status: "ACTIVE", department: { in: departments } };
    audienceLabel = `Departments: ${departments.join(", ")}`;
  } else if (audienceMode === "picked") {
    const userIds = formData.getAll("userIds").map(String).filter(Boolean);
    if (userIds.length === 0) return { error: "Pick at least one employee." };
    where = { status: "ACTIVE", id: { in: userIds } };
    audienceLabel = "Selected employees";
  } else {
    where = { status: "ACTIVE" };
    audienceLabel = "All active employees";
  }

  const users = await prisma.user.findMany({ where, select: { id: true } });
  if (users.length === 0) return { error: "That audience contains no active employees." };

  const campaign = await prisma.dataRequestCampaign.create({
    data: {
      title,
      fields,
      audience: `${audienceLabel} (${users.length})`,
      createdById: actor.id,
      targets: {
        create: users.map((u) => ({
          userId: u.id,
          fields: { create: fields.map((field) => ({ field })) },
        })),
      },
    },
  });

  revalidatePath("/admin/data-requests");
  redirect(`/admin/data-requests/${campaign.id}`);
}

/** Close a campaign (FR-010): popups and badges vanish; the tracker stays; answers stay. */
export async function closeCampaign(formData: FormData): Promise<void> {
  await requireDataRequestManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.dataRequestCampaign.update({
    where: { id },
    data: { closedAt: new Date() },
  });
  revalidatePath("/admin/data-requests");
  revalidatePath(`/admin/data-requests/${id}`);
}

/**
 * Delete a campaign entirely (2026-08-17 follow-up): removes it from the Data Requests tab,
 * its popups/badges, and its tracker history (targets + field states cascade). Values already
 * written to employee records STAY — they were direct profile writes, not campaign data.
 */
export async function deleteCampaign(formData: FormData): Promise<void> {
  await requireDataRequestManager();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.dataRequestCampaign.delete({ where: { id } }).catch(() => {
    // Already gone (double click / two admins) — deleting is idempotent.
  });
  revalidatePath("/admin/data-requests");
  redirect("/admin/data-requests");
}
