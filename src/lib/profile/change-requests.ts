/**
 * Reads over profile change requests (spec 029).
 *
 * Kept out of the server-action files on purpose: every export of a `"use server"` module is a
 * callable endpoint, and a query that takes a `userId` must not be one.
 */

import { prisma } from "@/lib/prisma";
import { REQUESTABLE_FIELDS, type RequestableField } from "@/lib/profile/requestable";

/**
 * The employee's request that still has undecided fields, or null.
 *
 * "Open" is derived from the fields rather than stored on the request, so a part-decided request
 * stays open until its last field is decided (FR-013a) with no status column to fall out of step.
 */
export async function openRequestFor(userId: string) {
  return prisma.profileChangeRequest.findFirst({
    where: { userId, fields: { some: { status: "PENDING" } } },
    include: {
      fields: { orderBy: { createdAt: "asc" }, include: { decidedBy: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** The employee's most recent fully-decided request, so they can see the outcome and any reason. */
export async function lastDecidedRequestFor(userId: string) {
  return prisma.profileChangeRequest.findFirst({
    where: { userId, fields: { every: { status: { not: "PENDING" } } } },
    include: {
      fields: { orderBy: { createdAt: "asc" }, include: { decidedBy: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** How many requests are waiting on HR — the admin badge (FR-008). */
export async function pendingRequestCount(): Promise<number> {
  return prisma.profileChangeRequest.count({
    where: { fields: { some: { status: "PENDING" } } },
  });
}

/** Every request with an undecided field, oldest first — HR works the queue front to back. */
export async function pendingRequests() {
  return prisma.profileChangeRequest.findMany({
    where: { fields: { some: { status: "PENDING" } } },
    include: {
      fields: { orderBy: { createdAt: "asc" }, include: { decidedBy: { select: { name: true } } } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          department: true,
          status: true,
          emergencyContactName: true,
          emergencyContactRelationship: true,
          emergencyContactPhone: true,
          dateOfBirth: true,
          maritalStatus: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The registry as plain data a client component can receive — the registry entries themselves
 * carry functions, which cannot cross the server/client boundary.
 */
export type FieldDescriptor = {
  key: string;
  label: string;
  group: string;
  input: RequestableField["input"];
  options?: { value: string; label: string }[];
  /** The record's current value, as the text the form submits. */
  current: string;
};

export function fieldDescriptors(
  user: Parameters<RequestableField["serialise"]>[0]
): FieldDescriptor[] {
  return REQUESTABLE_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    group: f.group,
    input: f.input,
    options: f.options,
    current: f.serialise(user),
  }));
}
