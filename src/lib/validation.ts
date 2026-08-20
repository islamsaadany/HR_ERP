import { z } from "zod";
import { isValidNationalId, isValidStoredPhone } from "@/lib/phone";

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const dateOrNull = z.preprocess(
  emptyToNull,
  z.coerce.date().nullable().optional()
);

const strOrNull = z.preprocess(
  emptyToNull,
  z.string().trim().nullable().optional()
);

export const dependantSchema = z.object({
  name: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  dateOfBirth: z.coerce.date(),
  // Spec 023: a covered spouse is a dependant (kind = SPOUSE); children default to CHILD.
  kind: z.enum(["CHILD", "SPOUSE"]).default("CHILD"),
});

/**
 * Values already stored on the record being edited, for the strict identity fields.
 *
 * Migration 053 deliberately left un-parseable legacy phones alone ("corrected by its owner
 * the next time they edit"), and `PhoneInput` re-submits a stored value verbatim until the
 * operator types in the box. Enforcing the strict rule on those untouched values made the
 * WHOLE employee form unsavable for such a record — an unrelated edit (employment type, title,
 * manager) was silently rejected because of a phone nobody had touched. So a submitted value
 * IDENTICAL to what is already stored is let through unchanged; anything the operator actually
 * changes is validated strictly, as is every other write path (grid, importer, self-service).
 * Reported + fixed 2026-08-20.
 */
export type StoredIdentityValues = {
  nationalId?: string | null;
  phone?: string | null;
  emergencyContactPhone?: string | null;
};

/** Strict check, plus a pass for re-submitting the exact value already on the record. */
function strictOrUnchanged(
  isValid: (v: string) => boolean,
  message: string,
  stored: string | null | undefined
) {
  const keep = stored?.trim() || null;
  return strOrNull.refine((v) => v == null || isValid(v) || v === keep, { message });
}

/**
 * The employee create/edit form's schema.
 *
 * Pass the record's current identity values on EDIT so a legacy value cannot block an
 * unrelated change (see `StoredIdentityValues`). Call with no argument — as `employeeSchema`
 * below does — for the fully strict schema used on create and by the inline grid edits.
 */
export function employeeFormSchema(stored: StoredIdentityValues = {}) {
  return z.object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().toLowerCase().email("Valid email required"),
    // Full official name as on the national ID (English + Arabic) and the national ID number —
    // all three employee-editable on My Profile too. National ID: exactly 14 digits (strict
    // everywhere, 2026-08-17 round 5).
    legalName: strOrNull,
    legalNameAr: strOrNull,
    nationalId: strictOrUnchanged(
      isValidNationalId,
      "National ID must be exactly 14 digits, no spaces.",
      stored.nationalId
    ),
    // Stored as one "+<dial><digits>" sequence, length validated per country (strict everywhere).
    phone: strictOrUnchanged(
      isValidStoredPhone,
      "Phone must be a country code plus digits only (e.g. +201001234567).",
      stored.phone
    ),
    department: strOrNull,
    title: strOrNull,
    // Optional: the Role control is disabled (and so not submitted) for non-super
    // admins, and the server derives role from the actor for them anyway — it never
    // trusts the client's role for non-super-users. Required-ness here only broke
    // HR/Finance edits with a generic "Invalid input".
    role: z.enum(["EMPLOYEE", "HR_ADMIN", "FINANCE", "SUPER_USER"]).optional(),
    employmentType: z.preprocess(
      emptyToNull,
      z.enum(["FULL_TIME", "PART_TIME"]).nullable().optional()
    ),
    tenureBand: z.preprocess(
      emptyToNull,
      z
        .enum(["BAND_6MO_2Y", "BAND_2_4Y", "BAND_4_7Y", "BAND_7_10Y"])
        .nullable()
        .optional()
    ),
    startDate: dateOrNull,
    endDate: dateOrNull,
    monthlySalary: z.preprocess(
      emptyToNull,
      z.coerce.number().int().min(0).nullable().optional()
    ),
    // Status is derived from the end date (an end date ⇒ LEFT), not hand-entered;
    // kept optional so the form can omit it. The server sets it from endDate.
    status: z.enum(["ACTIVE", "LEFT"]).optional(),
    dateOfBirth: dateOrNull,
    maritalStatus: z.preprocess(
      emptyToNull,
      z
        .enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"])
        .nullable()
        .optional()
    ),
    reportsToId: strOrNull,
    // Business unit (multi-brand, spec 024) — HR-managed FK; optional. Drives the
    // brand this employee sees. Distinct from `department`.
    businessUnitId: strOrNull,
    // Employee ID (spec 025) — HR-managed person identifier; optional, not unique.
    employeeId: strOrNull,
    // Emergency contact (HR-managed, spec 001 registry extension) — optional so HR is
    // never blocked from saving other edits on a record that lacks them; filled when known.
    emergencyContactName: strOrNull,
    emergencyContactRelationship: strOrNull,
    // Same strict phone rule as the employee's own number (2026-08-17 round 5).
    emergencyContactPhone: strictOrUnchanged(
      isValidStoredPhone,
      "Emergency contact phone must be a country code plus digits only (e.g. +201001234567).",
      stored.emergencyContactPhone
    ),
    dependants: z.array(dependantSchema).default([]),
  });
}

/**
 * The strict schema: create, and the per-field inline grid edits (which only ever send a
 * value the operator just typed, so there is nothing legacy to tolerate).
 */
export const employeeSchema = employeeFormSchema();

export type EmployeeInput = z.infer<ReturnType<typeof employeeFormSchema>>;
