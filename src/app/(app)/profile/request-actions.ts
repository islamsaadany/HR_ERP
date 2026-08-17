"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/roles";
import { REQUESTABLE_FIELDS } from "@/lib/profile/requestable";
import { openRequestFor } from "@/lib/profile/change-requests";
import {
  isValidStoredPhone,
  isValidNationalId,
  nationalNumberError,
  splitStoredPhone,
} from "@/lib/phone";

export type RequestState = { ok?: true; error?: string } | null;

/**
 * Record an employee's proposed corrections to their own record (spec 029, US1).
 *
 * Records ONLY the fields whose submitted value differs from the record as it stands right now
 * (FR-003): an unchanged field in the queue is a decision HR has to make for no reason, and it
 * would let an employee's stale form silently re-propose a value HR had already changed.
 *
 * The employee record is never touched here (FR-005) — submitting proposes, approving edits.
 */
export async function submitProfileChangeRequest(
  _prev: RequestState,
  formData: FormData
): Promise<RequestState> {
  const me = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      emergencyContactName: true,
      emergencyContactRelationship: true,
      emergencyContactPhone: true,
      dateOfBirth: true,
      maritalStatus: true,
      dependants: {
        select: { name: true, dateOfBirth: true, kind: true },
        orderBy: { dateOfBirth: "asc" },
      },
    },
  });
  if (!user) return { error: "Profile not found." };

  // One open request at a time (FR-006). Two live requests could propose conflicting values for
  // the same field, and HR would have no way to tell which one the employee still means.
  const existing = await openRequestFor(me.id);
  if (existing) {
    return { error: "You already have a request awaiting HR. It has to be decided first." };
  }

  const changes: { field: string; requestedValue: string }[] = [];
  for (const field of REQUESTABLE_FIELDS) {
    const raw = formData.get(field.key);
    // A field absent from the form is not a proposal to clear it — it just wasn't rendered.
    if (raw === null) continue;
    const submitted = String(raw);
    const parsed = field.parse(submitted);
    if (!parsed.ok) return { error: parsed.error };

    // Compare in serialised form, so "did this change?" and "what do we store?" can never
    // disagree — e.g. trailing whitespace or a differently-typed empty value.
    const normalised = serialiseParsed(parsed.value);
    if (normalised === field.serialise(user)) continue;
    changes.push({ field: field.key, requestedValue: normalised });
  }

  // FR-004: a submission with nothing in it creates nothing, rather than an empty row HR has to
  // open to discover it is empty.
  if (changes.length === 0) {
    return { error: "Nothing has changed, so there is nothing to send." };
  }

  const reason = String(formData.get("reason") ?? "").trim();

  await prisma.profileChangeRequest.create({
    data: {
      userId: me.id,
      reason: reason === "" ? null : reason.slice(0, 500),
      fields: { create: changes },
    },
  });

  revalidatePath("/profile");
  revalidatePath("/admin/change-requests");
  return { ok: true };
}

/** Cancel one's own request while HR has not decided any of it. */
export async function cancelProfileChangeRequest(formData: FormData): Promise<void> {
  const me = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const req = await prisma.profileChangeRequest.findUnique({
    where: { id },
    include: { fields: { select: { status: true } } },
  });
  // Only the owner, and only while untouched — withdrawing a request HR has already part-decided
  // would erase the record of a decision they made.
  if (!req || req.userId !== me.id) return;
  if (req.fields.some((f) => f.status !== "PENDING")) return;

  await prisma.profileChangeRequest.delete({ where: { id } });
  revalidatePath("/profile");
  revalidatePath("/admin/change-requests");
}

/** Result shape shared by the direct self-edit actions (phone, legal name). */
export type SelfEditState = { ok?: true; error?: string } | null;

/**
 * The employee's own phone number, edited directly — no request, no review, no pending count
 * (FR-002a/FR-019). It is their contact number; nothing reads it for eligibility or money, so
 * routing it through HR would add a person to a change nobody else depends on.
 */
export async function updateOwnPhone(_prev: SelfEditState, formData: FormData): Promise<SelfEditState> {
  const me = await requireUser();
  const raw = String(formData.get("phone") ?? "").trim();
  // Strict format (2026-08-17 round 5): one sequence "+<dial><digits>", digits-only, length
  // validated per country (Egypt 10). The client dropdown builds this; the server re-checks.
  if (raw !== "" && !isValidStoredPhone(raw)) {
    const split = splitStoredPhone(raw);
    return {
      error: split
        ? nationalNumberError(split.country, split.digits) ??
          "That phone number isn't valid for the chosen country."
        : "Pick a country code and enter the number in digits only.",
    };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { phone: raw === "" ? null : raw },
  });

  revalidatePath("/profile");
  revalidatePath("/directory");
  return { ok: true };
}

/**
 * The employee's own identity facts — legal names (English/Arabic) and national ID — edited
 * directly for the same reason as phone: nothing reads them for eligibility or money, and HR
 * can always correct them on the admin record. Never shown in the Directory.
 *
 * One helper, three exported actions: only exports of a "use server" file become endpoints.
 */
async function saveOwnText(
  column: "legalName" | "legalNameAr" | "nationalId",
  formData: FormData,
  max: number,
  tooLong: string
): Promise<SelfEditState> {
  const me = await requireUser();
  const raw = String(formData.get(column) ?? "").trim();
  if (raw.length > max) return { error: tooLong };

  await prisma.user.update({
    where: { id: me.id },
    data: { [column]: raw === "" ? null : raw },
  });

  revalidatePath("/profile");
  return { ok: true };
}

export async function updateOwnLegalName(
  _prev: SelfEditState,
  formData: FormData
): Promise<SelfEditState> {
  return saveOwnText("legalName", formData, 120, "That name is too long (max 120 characters).");
}

export async function updateOwnLegalNameAr(
  _prev: SelfEditState,
  formData: FormData
): Promise<SelfEditState> {
  return saveOwnText("legalNameAr", formData, 120, "That name is too long (max 120 characters).");
}

export async function updateOwnNationalId(
  _prev: SelfEditState,
  formData: FormData
): Promise<SelfEditState> {
  const me = await requireUser();
  const raw = String(formData.get("nationalId") ?? "").trim();
  // Exactly 14 digits, no spaces (2026-08-17 round 5). Empty clears the field.
  if (raw !== "" && !isValidNationalId(raw)) {
    return { error: "The national ID must be exactly 14 digits, with no spaces." };
  }

  await prisma.user.update({
    where: { id: me.id },
    data: { nationalId: raw === "" ? null : raw },
  });

  revalidatePath("/profile");
  return { ok: true };
}

/** Round-trip a parsed value back to the text stored on the request. */
function serialiseParsed(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
