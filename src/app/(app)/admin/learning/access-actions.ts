"use server";

import { revalidatePath } from "next/cache";
import type { AudienceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireLearningManager } from "@/lib/learning/managers";
import { courseAccessFor } from "@/lib/learning/access";
// ACCESS_FIELDS lives in a plain module, NOT here: a "use server" file may export only
// async functions, and one exported array made every action on the course page 500 before
// it ran. See the note in that file.
import { ACCESS_FIELDS, type AccessField } from "@/lib/learning/access-fields";

/**
 * Who a course reaches (spec 038 US2). HR Admin + Super User.
 *
 * Nothing here creates an enrollment. Assignment is ELIGIBILITY; enrollment happens when the
 * employee first opens the course. Keeping them separate is what makes "never started, so lose
 * access immediately" expressible at all (FR-045) — if assigning auto-enrolled, as the source
 * platform does, every assigned person would be permanently grandfathered from day one.
 */

export type AccessResult = { ok: true } | { ok: false; error: string };

function revalidate(courseId: string) {
  revalidatePath(`/admin/learning/${courseId}`);
  revalidatePath("/admin/learning");
  revalidatePath("/learning");
}

export async function setVisibility(
  courseId: string,
  visibility: "OPEN" | "RESTRICTED"
): Promise<AccessResult> {
  await requireLearningManager();
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

const AUDIENCE_FIELDS: AccessField[] = [
  "DEPARTMENT",
  "BUSINESS_UNIT",
  "EMPLOYMENT_TYPE",
  "TENURE_BAND",
  "REPORTS_TO",
];

/**
 * Add several choices to one field at once.
 *
 * All-or-nothing is deliberately NOT used here — unlike the course importer, where a half-imported
 * curriculum would be worse than none. Here each choice stands alone, so a stale name in a list of
 * eight must not throw the other seven away. Every fault is reported together, so the operator
 * fixes them in one go rather than one refusal at a time.
 */
export async function addAccessChoices(
  courseId: string,
  field: AccessField,
  values: string[]
): Promise<AccessResult> {
  const admin = await requireLearningManager();
  if (!ACCESS_FIELDS.includes(field)) return { ok: false, error: "Unknown field." };
  const wanted = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (wanted.length === 0) return { ok: false, error: "Nothing selected." };

  const faults: string[] = [];

  for (const value of wanted) {
    if (AUDIENCE_FIELDS.includes(field)) {
      const kind = field as AudienceKind;
      const problem = await validateRule(kind, value);
      if (problem) {
        faults.push(problem);
        continue;
      }
      // Idempotent (FR-018): choosing the same thing twice is a no-op, not a duplicate.
      const existing = await prisma.courseAudience.count({ where: { courseId, kind, value } });
      if (existing > 0) continue;
      await prisma.courseAudience.create({
        data: { courseId, kind, value, createdById: admin.id },
      });
      continue;
    }

    if (field === "GROUP") {
      const group = await prisma.learnerGroup.count({ where: { id: value } });
      if (group === 0) {
        faults.push("One of those groups no longer exists.");
        continue;
      }
      // Upsert, not create: re-adding a group whose grant was revoked REINSTATES it.
      await prisma.courseAssignment.upsert({
        where: { courseId_groupId: { courseId, groupId: value } },
        create: { courseId, groupId: value, grantedById: admin.id },
        update: { revokedAt: null, grantedById: admin.id, grantedAt: new Date() },
      });
      continue;
    }

    // PERSON
    const person = await prisma.user.findUnique({
      where: { id: value },
      select: { status: true, name: true },
    });
    if (!person) {
      faults.push("One of those employees no longer exists.");
      continue;
    }
    if (person.status !== "ACTIVE") {
      faults.push(`${person.name} has left, so they can't be given a course.`);
      continue;
    }
    await prisma.courseAssignment.upsert({
      where: { courseId_userId: { courseId, userId: value } },
      create: { courseId, userId: value, grantedById: admin.id },
      update: { revokedAt: null, grantedById: admin.id, grantedAt: new Date() },
    });
  }

  revalidate(courseId);
  return faults.length > 0 ? { ok: false, error: faults.join(" ") } : { ok: true };
}

/**
 * Remove one choice.
 *
 * An audience rule is DELETED (it is a rule, and an unwanted rule is just gone); an assignment is
 * STAMPED revoked, because the trail of who granted a named person a course is worth keeping.
 */
export async function removeAccessChoice(
  courseId: string,
  field: AccessField,
  rowId: string
): Promise<AccessResult> {
  await requireLearningManager();
  if (field === "GROUP" || field === "PERSON") {
    await prisma.courseAssignment.update({
      where: { id: rowId },
      data: { revokedAt: new Date() },
    });
  } else {
    await prisma.courseAudience.deleteMany({ where: { id: rowId, courseId } });
  }
  revalidate(courseId);
  return { ok: true };
}

/**
 * Clear a legacy "Everyone" audience rule.
 *
 * Courses created before 2026-08-22 can carry one: the old Add-a-route box offered "Everyone" as
 * an audience, so a course could be set to RESTRICTED and still reach the whole company. The new
 * form cannot create one; this removes the ones that exist.
 */
export async function clearEveryoneRule(courseId: string): Promise<AccessResult> {
  await requireLearningManager();
  await prisma.courseAudience.deleteMany({ where: { courseId, kind: "ALL_ACTIVE" } });
  revalidate(courseId);
  return { ok: true };
}

// ─── Groups ─────────────────────────────────────────────────────────────
// Names are trimmed and deduped case-insensitively, following lib/departments.ts, so "2026 New
// Joiners" and "2026 new joiners" can't both exist and confuse whoever assigns the course.

const normalizeName = (s: string) => s.trim().replace(/\s+/g, " ");
const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function createGroup(name: string): Promise<AccessResult & { id?: string }> {
  const admin = await requireLearningManager();
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
  await requireLearningManager();
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
  await requireLearningManager();
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
  const admin = await requireLearningManager();
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
  await requireLearningManager();
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
  const admin = await requireLearningManager();
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
