import type {
  EmploymentType,
  MaritalStatus,
  Role,
  TenureBand,
  EmployeeStatus,
} from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  EMPLOYEE: "Employee",
  HR_ADMIN: "HR Admin",
  SUPER_USER: "Super User",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
};

export const TENURE_BAND_LABEL: Record<TenureBand, string> = {
  BAND_6MO_2Y: "6 months – 2 years",
  BAND_2_4Y: "2 – 4 years",
  BAND_4_7Y: "4 – 7 years",
  BAND_7_10Y: "7 – 10 years",
};

/** Order of the four tenure bands (index aligns with benefits ceiling arrays). */
export const TENURE_BAND_ORDER: TenureBand[] = [
  "BAND_6MO_2Y",
  "BAND_2_4Y",
  "BAND_4_7Y",
  "BAND_7_10Y",
];

export const MARITAL_STATUS_LABEL: Record<MaritalStatus, string> = {
  SINGLE: "Single",
  MARRIED: "Married",
  DIVORCED: "Divorced",
  WIDOWED: "Widowed",
};

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  LEFT: "Left",
};

export const DEPARTMENTS = [
  "Consulting Department",
  "Financial Department",
  "Top Management",
  "Marketing & Community",
  "Data Management Unit",
] as const;

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Date → "YYYY-MM-DD" for <input type="date">, or "" when null. */
export function toDateInput(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}
