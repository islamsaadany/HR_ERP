"use server";

import { revalidatePath } from "next/cache";
import type { AudienceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import { courseAccessFor } from "@/lib/learning/access";
import { audienceWhere, type AudienceRule } from "@/lib/learning/audience";

/**
 * Who a course reaches (spec 038 US2). HR Admin + Super User.
 *
 * Nothing here creates an enrollment. Assignment is ELIGIBILITY; enrollment happens when the
 * employee first opens the course. Keeping them separate is what makes "never started, so lose
 * access immediately" expressible at all (FR-045) — if assigning auto-enrolled, as the source
 * platform does, every assigned person would be permanently grandfathered from day one.
 */

export type AccessResult = { ok: true; reach?: number } | { ok: false; error: string };

function revalidate(courseId: string) {
  revalidatePath(`/admin/learning/${courseId}`);
  revalidatePath("/admin/learning");
  revalidatePath("/learning");
}

export async function setVisibility(
  courseId: string,
  visibility: "OPEN" | "RESTRICTED"
): Promise<AccessResult> {
  await requireAdmin();
  await prisma.course.update({ where: { id: courseId }, data: { visibility } });
  revalidate(courseId);
  return { ok: true };
}

/** Validate an audience rule against the real registry before storing it. */
async function validateRule(kind: AudienceKind, value: string | null): Promise<string | null> {
  const v = value?.trim() ?? "";
  switch (kind) {
    case "ALL_ACTIVE":
      return null;
    case "DEPARTMENT": {
      const exists = await prisma.department.count({ where: { name: v } });
      return exists > 0 ? null : "That department doesn't exist.";
    }
    case "BUSINESS_UNIT": {
      const exists = await prisma.businessUnit.count({ where: { id: v } });
      return exists > 0 ? null : "That business unit doesn't exist.";
    }
    case "EMPLOYMENT_TYPE":
      return v === "FULL_TIME" || v === "PART_TIME" ? null : "Pick full-time or part-time.";
    case "TENURE_BAND":
      return ["BAND_6MO_2Y", "BAND_2_4Y", "BAND_4_7Y", "BAND_7_10Y"].includes(v)
        ? null
        : "Pick a tenure band.";
    case "REPORTS_TO": {
      const manager = await prisma.user.count({ where: { id: v, status: "ACTIVE" } });
      return manager > 0 ? null : "That manager isn't an active employee.";
    }
  }
}

export async function addAudience(
  courseId: string,
  kind: AudienceKind,
  value: string | null
): Promise<AccessResult> {
  const admin = await requireAdmin();
  const problem = await validateRule(kind, value);
  if (problem) return { ok: false, error: problem };

  const stored = kind === "ALL_ACTIVE" ? null : (value?.trim() ?? null);
  const existing = await prisma.courseAudience.count({
    where: { courseId, kind, value: stored },
  });
  // Idempotent (FR-018): adding the same rule twice is a no-op, not a duplicate row.
  if (existing > 0) return { ok: true };

  await prisma.courseAudience.create({
    data: { courseId, kind, value: stored, createdById: admin.id },
  });
  revalidate(courseId);
  return { ok: true, reach: await audienceReach(courseId) };
}

export async function removeAudience(courseId: string, audienceId: string): Promise<AccessResult> {
  await requireAdmin();
  await prisma.courseAudience.delete({ where: { id: audienceId } });
  revalidate(courseId);
  return { ok: true };
}

/** How many active employees this course's audience rules reach right now. */
export async function audienceReach(courseId: string): Promise<number> {
  const rules = await prisma.courseAudience.findMany({
    where: { courseId },
    select: { kind: true, value: true },
  });
  const where = audienceWhere(rules as AudienceRule[]);
  return where ? prisma.user.count({ where }) : 0;
}

export async function assignToUser(courseId: string, userId: string): Promise<AccessResult> {
  const admin = await requireAdmin();
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!person) return { ok: false, error: "That employee doesn't exist." };
  if (person.status !== "ACTIVE") {
    return { ok: false, error: "That employee has left, so they can't be assigned a course." };
  }

  // Upsert rather than create: re-assigning someone whose grant was revoked should REINSTATE it,
  // not fail on the unique key and not leave them stuck revoked.
  await prisma.courseAssignment.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId, grantedById: admin.id },
    update: { revokedAt: null, grantedById: admin.id, grantedAt: new Date() },
  });
  revalidate(courseId);
  return { ok: true };
}

export async function assignToGroup(courseId: string, groupId: string): Promise<AccessResult> {
  const admin = await requireAdmin();
  await prisma.courseAssignment.upsert({
    where: { courseId_groupId: { courseId, groupId } },
    create: { courseId, groupId, grantedById: admin.id },
    update: { revokedAt: null, grantedById: admin.id, grantedAt: new Date() },
  });
  revalidate(courseId);
  return { ok: true };
}

/** Revocation is a STAMP, never a delete — the trail of who granted what survives. */
export async function revokeAssignment(
  courseId: string,
  assignmentId: string
): Promise<AccessResult> {
  await requireAdmin();
  await prisma.courseAssignment.update({
    where: { id: assignmentId },
    data: { revokedAt: new Date() },
  });
  revalidate(courseId);
  return { ok: true };
}

// ─── Groups ─────────────────────────────────────────────────────────────
// Names are trimmed and deduped case-insensitively, following lib/departments.ts, so "2026 New
// Joiners" and "2026 new joiners" can't both exist and confuse whoever assigns the course.

const normalizeName = (s: string) => s.trim().replace(/\s+/g, " ");
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function createGroup(name: string): Promise<AccessResult & { id?: string }> {
  const admin = await requireAdmin();
  const clean = normalizeName(name);
  if (!clean) return { ok: false, error: "Give the group a name." };

  const existing = await prisma.learnerGroup.findMany({ select: { name: true } });
  if (existing.some((g) => sameName(g.name, clean))) {
    return { ok: false, error: "A group with that name already exists." };
  }
  const group = await prisma.learnerGroup.create({
    data: { name: clean, createdById: admin.id },
    select: { id: true },
  });
  revalidatePath("/admin/learning/groups");
  return { ok: true, id: group.id };
}

export async function renameGroup(groupId: string, name: string): Promise<AccessResult> {
  await requireAdmin();
  const clean = normalizeName(name);
  if (!clean) return { ok: false, error: "Give the group a name." };

  const others = await prisma.learnerGroup.findMany({
    where: { id: { not: groupId } },
    select: { name: true },
  });
  if (others.some((g) => sameName(g.name, clean))) {
    return { ok: false, error: "A group with that name already exists." };
  }
  await prisma.learnerGroup.update({ where: { id: groupId }, data: { name: clean } });
  revalidatePath("/admin/learning/groups");
  return { ok: true };
}

export async function deleteGroup(groupId: string): Promise<AccessResult> {
  await requireAdmin();
  const live = await prisma.courseAssignment.count({
    where: { groupId, revokedAt: null },
  });
  if (live > 0) {
    return {
      ok: false,
      error: `This group still has ${live} course${live === 1 ? "" : "s"} assigned to it. Remove those first — deleting it now would quietly take the course away from everyone in it.`,
    };
  }
  await prisma.learnerGroup.delete({ where: { id: groupId } });
  revalidatePath("/admin/learning/groups");
  return { ok: true };
}

export async function addGroupMembers(groupId: string, userIds: string[]): Promise<AccessResult> {
  const admin = await requireAdmin();
  if (userIds.length === 0) return { ok: true };
  // createMany + skipDuplicates: adding someone already in the group is a no-op, and membership
  // is live, so they pick up every course assigned to the group with no back-fill write.
  await prisma.learnerGroupMember.createMany({
    data: userIds.map((userId) => ({ groupId, userId, addedById: admin.id })),
    skipDuplicates: true,
  });
  revalidatePath("/admin/learning/groups");
  revalidatePath("/learning");
  return { ok: true };
}

export async function removeGroupMember(groupId: string, userId: string): Promise<AccessResult> {
  await requireAdmin();
  await prisma.learnerGroupMember.deleteMany({ where: { groupId, userId } });
  revalidatePath("/admin/learning/groups");
  revalidatePath("/learning");
  return { ok: true };
}

/**
 * End access that is being held ONLY because the person is mid-course (FR-043/FR-044).
 *
 * Refused for anyone holding the course by a real route. Without that check this becomes a way to
 * strip normal access one person at a time, invisibly — the assignment would still be listed, the
 * audience would still match, and nobody looking at the Access tab could see why they'd lost it.
 */
export async function withdrawGrandfatheredAccess(
  courseId: string,
  enrollmentId: string
): Promise<AccessResult> {
  const admin = await requireAdmin();
  const enrollment = await prisma.courseEnrollment.findUnique({
    where: { id: enrollmentId },
    select: { userId: true, courseId: true },
  });
  if (!enrollment || enrollment.courseId !== courseId) {
    return { ok: false, error: "That enrollment doesn't belong to this course." };
  }

  const access = await courseAccessFor(enrollment.userId, courseId);
  if (!access.grandfatheredOnly) {
    return {
      ok: false,
      error:
        "This person holds the course through an assignment, a group, or an audience — not just because they started it. Remove that route instead.",
    };
  }

  await prisma.courseEnrollment.update({
    where: { id: enrollmentId },
    data: { accessWithdrawnAt: new Date(), accessWithdrawnById: admin.id },
  });
  revalidate(courseId);
  return { ok: true };
}
