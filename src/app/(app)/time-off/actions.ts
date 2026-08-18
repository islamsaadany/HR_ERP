"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/roles";
import { getHolidaySet } from "@/lib/holidays";
import { countWorkingDays } from "@/lib/workdays";
import { canDecideLeave } from "@/lib/leave-queries";

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
  // Spec 035 FR-004: a range with no working days books nothing — refuse it plainly
  // rather than record a zero-day request.
  const holidays = await getHolidaySet();
  if (countWorkingDays(data.startDate, data.endDate, holidays) === 0) {
    redirect(
      "/time-off?error=" +
        encodeURIComponent(
          "That range has no working days — it's all weekend (Fri/Sat) or public holidays."
        )
    );
  }

  // Approver snapshot: the current manager IF they are active, else a Super User. This is
  // routing history only — decisions resolve against the CURRENT org chart (spec 035
  // FR-007, lib/leave-queries), so a later reporting-line change moves the request.
  const dbUser = await prisma.user.findUnique({
    where: { id: me.id },
    select: { reportsTo: { select: { id: true, status: true } } },
  });
  let approverId =
    dbUser?.reportsTo?.status === "ACTIVE" ? dbUser.reportsTo.id : null;
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

/**
 * Cancel one's own request (spec 035, FR-009): a PENDING request any time; an APPROVED
 * trip only strictly BEFORE its start date — the days return to the year count and the
 * cancellation stays visible to manager/HR (cancelledAt + the kept decidedAt mark it as
 * "was approved, called off"). Started/past trips are history; HR corrects those.
 */
export async function cancelLeaveRequest(formData: FormData): Promise<void> {
  const me = await requireUser();
  const id = formData.get("id") as string;
  if (!id) return;
  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.userId !== me.id) return;
  const cancellable =
    req.status === "PENDING" ||
    (req.status === "APPROVED" && req.startDate.getTime() > startOfToday().getTime());
  if (!cancellable) return;
  await prisma.leaveRequest.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  revalidatePath("/time-off");
  revalidatePath("/admin/time-off");
  revalidatePath("/dashboard");
}

/**
 * Apply a decision to a pending request. Authority is the CURRENT org chart, not the
 * stored snapshot (spec 035, FR-007): the requester's current active manager decides;
 * HR Admin / Super User remain the fallback (spec 005 FR-013). The decider is recorded
 * onto approverId so history names who actually decided.
 */
async function applyDecision(
  id: string,
  decision: "APPROVED" | "DECLINED",
  comment: string | null
): Promise<void> {
  const me = await requireUser();
  const req = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!req || req.status !== "PENDING") return;
  if (!(await canDecideLeave(me, req.userId))) return;

  await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: decision,
      approverId: me.id,
      decisionComment: comment,
      decidedAt: new Date(),
      decisionSeenAt: null, // fresh decision — badge the requester until they view it
    },
  });
  revalidatePath("/time-off");
  revalidatePath("/admin/time-off");
  revalidatePath("/dashboard");
}

function readIdComment(formData: FormData): { id: string; comment: string | null } {
  return {
    id: (formData.get("id") as string) ?? "",
    comment: (formData.get("comment") as string | null)?.trim() || null,
  };
}

export async function approveLeaveRequest(formData: FormData): Promise<void> {
  const { id, comment } = readIdComment(formData);
  if (id) await applyDecision(id, "APPROVED", comment);
}

export async function declineLeaveRequest(formData: FormData): Promise<void> {
  const { id, comment } = readIdComment(formData);
  if (id) await applyDecision(id, "DECLINED", comment);
}

/**
 * Delete a request outright (HR Admin / Super User only) — for entries added by mistake
 * (requested 2026-08-18). A hard delete: the request vanishes from every view and from the
 * working-day counts (counts are derived live, so nothing needs recomputing). The client
 * guards it behind an explicit confirm.
 */
export async function deleteLeaveRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (!id) return;
  await prisma.leaveRequest.delete({ where: { id } }).catch(() => {});
  revalidatePath("/time-off");
  revalidatePath("/admin/time-off");
  revalidatePath("/dashboard");
}

/** Mark the current user's decided-but-unseen requests as seen — clears the nav badge (FR-014). */
export async function markLeaveDecisionsSeen(): Promise<void> {
  const me = await requireUser();
  await prisma.leaveRequest.updateMany({
    where: {
      userId: me.id,
      status: { in: ["APPROVED", "DECLINED"] },
      decisionSeenAt: null,
    },
    data: { decisionSeenAt: new Date() },
  });
  revalidatePath("/time-off");
  revalidatePath("/dashboard");
}
