"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, requireAdmin } from "@/lib/roles";
import { getHolidaySet } from "@/lib/holidays";
import { countWorkingDays } from "@/lib/workdays";
import { canDecideLeave, leaveApproversFor } from "@/lib/leave-queries";
import { formatDate } from "@/lib/labels";
import { sendEmail } from "@/lib/email/client";
import { leaveRequestedToApprover, leaveDecidedToEmployee } from "@/lib/email/templates";

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
  const workingDays = countWorkingDays(data.startDate, data.endDate, holidays);
  if (workingDays === 0) {
    redirect(
      "/time-off?error=" +
        encodeURIComponent(
          "That range has no working days — it's all weekend (Fri/Sat) or public holidays."
        )
    );
  }

  // The people whose queue this lands in: the current manager IF they are active, else the
  // Super Users (lib/leave-queries, the inverse of the queue rule). The first is snapshotted as
  // routing history only — decisions resolve against the CURRENT org chart (spec 035 FR-007),
  // so a later reporting-line change moves the request.
  const approvers = await leaveApproversFor(me.id);
  const approverId = approvers[0]?.id ?? null;

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

  // After the write, never inside it, and a failure is swallowed (sendEmail): the request
  // exists whether or not the mail goes. One separate message per approver — never a shared
  // `to` — so nobody sees another's address. (Spec 035 amendment, 2026-09-08.)
  const message = leaveRequestedToApprover({
    employeeName: me.name ?? "An employee",
    startDate: formatDate(data.startDate),
    endDate: formatDate(data.endDate),
    workingDays,
    note: data.note ?? null,
  });
  for (const approver of approvers) {
    await sendEmail({ to: approver.email, ...message });
  }

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
  const req = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });
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

  // Tell the requester, after the write (spec 035 amendment, 2026-09-08). A decision is true
  // the moment it is made, so this fires here — unlike money, which waits for the bank. The
  // in-app badge stays as it was; the email is in addition, and its failure changes nothing.
  const holidays = await getHolidaySet();
  await sendEmail({
    to: req.user.email,
    ...leaveDecidedToEmployee({
      decision,
      startDate: formatDate(req.startDate),
      endDate: formatDate(req.endDate),
      workingDays: countWorkingDays(req.startDate, req.endDate, holidays),
      deciderName: me.name ?? "Your manager",
      comment,
    }),
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
