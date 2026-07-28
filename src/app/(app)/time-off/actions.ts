"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";

const requestSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    note: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.string().trim().max(500).nullable().optional()
    ),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: "End date must be on or after the start date",
  });

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function createLeaveRequest(formData: FormData): Promise<void> {
  const me = await requireUser();
  const parsed = requestSchema.safeParse({
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    redirect(
      "/time-off?error=" +
        encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid dates")
    );
  }
  const data = parsed.data;
  if (data.startDate < startOfToday()) {
    redirect("/time-off?error=" + encodeURIComponent("Start date can't be in the past"));
  }

  // Approver = direct manager, else a Super User (no-manager fallback).
  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: { reportsToId: true },
  });
  let approverId = dbUser?.reportsToId ?? null;
  if (!approverId) {
    const su = await prisma.user.findFirst({
      where: { role: "SUPER_USER", status: "ACTIVE", NOT: { id: me.id } },
      select: { id: true },
    });
    approverId = su?.id ?? null;
  }

  await prisma.leaveRequest.create({
    data: {
      userId: me.id,
      startDate: data.startDate,
      endDate: data.endDate,
      note: data.note ?? null,
      approverId,
      status: "PENDING",
    },
  });
  revalidatePath("/time-off");
  revalidatePath("/dashboard");
}

export async function cancelLeaveRequest(formData: FormData): Promise<void> {
  const me = await requireUser();
  const id = formData.get("id") as string;
  if (!id) return;
  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.userId !== me.id || req.status !== "PENDING") return;
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/time-off");
  revalidatePath("/dashboard");
}

export async function decideLeaveRequest(formData: FormData): Promise<void> {
  const me = await requireUser();
  const id = formData.get("id") as string;
  const decision = formData.get("decision") as string; // "APPROVED" | "DECLINED"
  const comment = (formData.get("comment") as string | null)?.trim() || null;
  if (!id || (decision !== "APPROVED" && decision !== "DECLINED")) return;

  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return;
  // Only the assigned approver (the requester's direct manager / fallback) may decide.
  if (req.approverId !== me.id) return;

  await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: decision,
      decisionComment: comment,
      decidedAt: new Date(),
    },
  });
  revalidatePath("/time-off");
  revalidatePath("/dashboard");
}
