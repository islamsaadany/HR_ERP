"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { requestableField, parseDependantsList } from "@/lib/profile/requestable";

export type DecisionState = { ok?: true; error?: string } | null;

/**
 * Approve one requested field (spec 029, US2).
 *
 * Approving IS the edit: this writes that one column and nothing else (FR-011a), which is the
 * whole point of the feature — no value is re-typed, so transcription stops being a source of
 * error. Undecided fields in the same request are untouched, so HR can accept the emergency
 * contact and still query the date of birth.
 */
export async function approveProfileField(
  _prev: DecisionState,
  formData: FormData
): Promise<DecisionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("fieldId") ?? "").trim();
  if (!id) return { error: "Missing field." };

  const row = await prisma.profileChangeField.findUnique({
    where: { id },
    include: { request: { select: { userId: true } } },
  });
  if (!row) return { error: "That request no longer exists." };
  // FR-017: a decided field is closed. Two admins opening the same queue must not have the
  // second click quietly overwrite the first one's decision.
  if (row.status !== "PENDING") return { error: "That field has already been decided." };

  const field = requestableField(row.field);
  if (!field) return { error: "That field can no longer be changed from here." };

  const parsed = field.parse(row.requestedValue);
  if (!parsed.ok) return { error: parsed.error };

  const markApproved = prisma.profileChangeField.update({
    where: { id },
    data: {
      status: "APPROVED",
      decidedById: admin.id,
      decidedAt: new Date(),
      decisionReason: null,
    },
  });

  if (field.key === "dependants") {
    // The dependant list is a SET, not a column: approval replaces the whole list, mirroring
    // how the admin employee form already writes dependants. Removal is safe for medical
    // history — MedicalCoveredPerson keeps its snapshot (dependantId just goes null).
    const list = parseDependantsList(String(parsed.value ?? "[]"));
    if (!list.ok) return { error: list.error };
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.request.userId },
        data: {
          dependants: {
            deleteMany: {},
            create: list.list.map((d) => ({
              name: d.name,
              dateOfBirth: new Date(`${d.dateOfBirth}T00:00:00.000Z`),
              kind: d.kind,
            })),
          },
        },
      }),
      markApproved,
    ]);
  } else {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.request.userId },
        data: { [field.key]: parsed.value },
      }),
      markApproved,
    ]);
  }

  revalidateSurfaces(row.request.userId);
  return { ok: true };
}

/**
 * Decline one requested field, with a reason the employee reads against that field (FR-012).
 *
 * The record is not touched. The reason is required: "declined" with no explanation sends the
 * employee back to HR's inbox, which is the thing this feature exists to stop.
 */
export async function declineProfileField(
  _prev: DecisionState,
  formData: FormData
): Promise<DecisionState> {
  const admin = await requireAdmin();
  const id = String(formData.get("fieldId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return { error: "Missing field." };
  if (reason === "") return { error: "Give a reason so the employee knows what to do next." };

  const row = await prisma.profileChangeField.findUnique({
    where: { id },
    include: { request: { select: { userId: true } } },
  });
  if (!row) return { error: "That request no longer exists." };
  if (row.status !== "PENDING") return { error: "That field has already been decided." };

  await prisma.profileChangeField.update({
    where: { id },
    data: {
      status: "DECLINED",
      decisionReason: reason.slice(0, 500),
      decidedById: admin.id,
      decidedAt: new Date(),
    },
  });

  revalidateSurfaces(row.request.userId);
  return { ok: true };
}

function revalidateSurfaces(userId: string) {
  revalidatePath("/admin/change-requests");
  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${userId}`);
  revalidatePath("/profile");
  revalidatePath("/directory");
}
