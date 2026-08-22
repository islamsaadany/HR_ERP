"use server";

import { put, del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import type { CourseDocumentSlot, CourseResourceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import {
  DOCUMENT_SLOTS,
  MAX_DOCUMENT_BYTES,
  RESOURCE_KINDS,
  normaliseResourceUrl,
} from "@/lib/learning/materials";

/**
 * Course materials — the HR side (spec 038 materials, 2026-08-22).
 *
 * Every action here starts with `requireAdmin()`. Nothing in this file decides who may SEE a
 * document; that is `EMPLOYEE_VISIBLE_SLOTS` in `src/lib/learning/materials.ts`, enforced by the
 * serving route. Keeping the two apart is deliberate — an upload screen must never be the thing
 * that decides visibility.
 */

export type MaterialsResult = { ok: true } | { ok: false; error: string };

const clean = (v: FormDataEntryValue | null | undefined) =>
  typeof v === "string" ? v.trim() : "";

function revalidate(courseId: string) {
  revalidatePath(`/admin/learning/${courseId}`);
  revalidatePath("/admin/learning");
  revalidatePath(`/learning/${courseId}`);
}

// ─── Documents ──────────────────────────────────────────────────────────

/**
 * Upload (or replace) one of the three fixed document slots.
 *
 * Replacing deletes the OLD blob after the row points at the new one — in that order, so a failed
 * delete leaves an orphaned file rather than a row pointing at nothing. An orphan costs storage;
 * a dangling row costs the operator a document they think they have.
 */
export async function uploadCourseDocument(formData: FormData): Promise<MaterialsResult> {
  const admin = await requireAdmin();
  const courseId = clean(formData.get("courseId"));
  const slot = clean(formData.get("slot")) as CourseDocumentSlot;
  const file = formData.get("file");

  if (!courseId) return { ok: false, error: "Missing course." };
  if (!DOCUMENT_SLOTS.includes(slot as (typeof DOCUMENT_SLOTS)[number])) {
    return { ok: false, error: "Unknown document slot." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "That file is over 25 MB. Please upload a smaller one." };
  }

  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
  if (!course) return { ok: false, error: "That course no longer exists." };

  const existing = await prisma.courseDocument.findUnique({
    where: { courseId_slot: { courseId, slot } },
    select: { blobUrl: true },
  });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`learning/${courseId}/${slot.toLowerCase()}/${safeName}`, file, {
    access: "private",
    addRandomSuffix: true,
  });

  await prisma.courseDocument.upsert({
    where: { courseId_slot: { courseId, slot } },
    create: {
      courseId,
      slot,
      blobUrl: blob.url,
      fileName: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      uploadedById: admin.id,
    },
    update: {
      blobUrl: blob.url,
      fileName: file.name,
      contentType: file.type || null,
      sizeBytes: file.size,
      uploadedById: admin.id,
    },
  });

  if (existing?.blobUrl && existing.blobUrl !== blob.url) {
    // Best effort: the row is already correct, so a failure here is storage waste, not data loss.
    await del(existing.blobUrl).catch(() => undefined);
  }

  revalidate(courseId);
  return { ok: true };
}

export async function removeCourseDocument(documentId: string): Promise<MaterialsResult> {
  await requireAdmin();
  const doc = await prisma.courseDocument.findUnique({
    where: { id: documentId },
    select: { courseId: true, blobUrl: true },
  });
  if (!doc) return { ok: false, error: "That document has already been removed." };

  await prisma.courseDocument.delete({ where: { id: documentId } });
  await del(doc.blobUrl).catch(() => undefined);
  revalidate(doc.courseId);
  return { ok: true };
}

// ─── Resources ──────────────────────────────────────────────────────────

/** HR adding a resource directly — published straight away; there is nobody to approve it past. */
export async function addCourseResource(formData: FormData): Promise<MaterialsResult> {
  await requireAdmin();
  const courseId = clean(formData.get("courseId"));
  const kind = clean(formData.get("kind")) as CourseResourceKind;
  const name = clean(formData.get("name"));
  const rawUrl = clean(formData.get("url"));

  if (!courseId) return { ok: false, error: "Missing course." };
  if (!RESOURCE_KINDS.includes(kind as (typeof RESOURCE_KINDS)[number])) {
    return { ok: false, error: "Choose what kind of resource this is." };
  }
  if (!name) return { ok: false, error: "Give the resource a name." };
  if (name.length > 200) return { ok: false, error: "That name is too long (200 characters max)." };

  const url = normaliseResourceUrl(rawUrl);
  if (rawUrl && !url) return { ok: false, error: "That doesn't look like a web address." };

  const max = await prisma.courseResource.aggregate({
    where: { courseId },
    _max: { order: true },
  });
  await prisma.courseResource.create({
    data: {
      courseId,
      kind,
      name,
      url,
      status: "PUBLISHED",
      order: (max._max.order ?? 0) + 1,
    },
  });
  revalidate(courseId);
  return { ok: true };
}

export async function removeCourseResource(resourceId: string): Promise<MaterialsResult> {
  await requireAdmin();
  const resource = await prisma.courseResource.findUnique({
    where: { id: resourceId },
    select: { courseId: true },
  });
  if (!resource) return { ok: false, error: "That resource has already been removed." };
  await prisma.courseResource.delete({ where: { id: resourceId } });
  revalidate(resource.courseId);
  return { ok: true };
}

/**
 * Approve an employee's suggestion into the library.
 *
 * HR may correct the name and the link on the way through — a typed URL is a typed URL, and a
 * suggestion worth keeping should not be declined over a missing "https".
 */
export async function approveSuggestion(formData: FormData): Promise<MaterialsResult> {
  const admin = await requireAdmin();
  const resourceId = clean(formData.get("resourceId"));
  const name = clean(formData.get("name"));
  const rawUrl = clean(formData.get("url"));

  const resource = await prisma.courseResource.findUnique({
    where: { id: resourceId },
    select: { id: true, courseId: true, status: true, name: true, url: true },
  });
  if (!resource) return { ok: false, error: "That suggestion no longer exists." };
  if (resource.status !== "PENDING") {
    return { ok: false, error: "That suggestion has already been reviewed." };
  }

  const url = rawUrl ? normaliseResourceUrl(rawUrl) : resource.url;
  if (rawUrl && !url) return { ok: false, error: "That doesn't look like a web address." };

  const max = await prisma.courseResource.aggregate({
    where: { courseId: resource.courseId },
    _max: { order: true },
  });
  await prisma.courseResource.update({
    where: { id: resource.id },
    data: {
      name: name || resource.name,
      url,
      status: "PUBLISHED",
      order: (max._max.order ?? 0) + 1,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });
  revalidate(resource.courseId);
  return { ok: true };
}

/**
 * Decline a suggestion. Deliberately SILENT — the employee is not told.
 *
 * A "no" on a book recommendation is not worth a notification, and telling somebody their
 * suggestion was rejected is a good way to stop them suggesting anything again. The row is kept
 * rather than deleted so the same link cannot be re-suggested into the queue forever unnoticed.
 */
export async function declineSuggestion(resourceId: string): Promise<MaterialsResult> {
  const admin = await requireAdmin();
  const resource = await prisma.courseResource.findUnique({
    where: { id: resourceId },
    select: { id: true, courseId: true, status: true },
  });
  if (!resource) return { ok: false, error: "That suggestion no longer exists." };
  if (resource.status !== "PENDING") {
    return { ok: false, error: "That suggestion has already been reviewed." };
  }
  await prisma.courseResource.update({
    where: { id: resource.id },
    data: { status: "DECLINED", reviewedById: admin.id, reviewedAt: new Date() },
  });
  revalidate(resource.courseId);
  return { ok: true };
}
