import { z } from "zod";

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

export const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  // Full official name as on the national ID — employee-editable on My Profile too.
  legalName: strOrNull,
  phone: strOrNull,
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
  emergencyContactPhone: strOrNull,
  dependants: z.array(dependantSchema).default([]),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
