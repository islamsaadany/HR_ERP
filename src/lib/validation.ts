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
});

export const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  phone: strOrNull,
  department: strOrNull,
  title: strOrNull,
  role: z.enum(["EMPLOYEE", "HR_ADMIN", "SUPER_USER"]),
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
  // Emergency contact (HR-managed, spec 001 registry extension) — all three required on input.
  emergencyContactName: z.string().trim().min(1, "Emergency contact name is required"),
  emergencyContactRelationship: z.string().trim().min(1, "Emergency contact relationship is required"),
  emergencyContactPhone: z.string().trim().min(1, "Emergency contact phone is required"),
  dependants: z.array(dependantSchema).default([]),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
