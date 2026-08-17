import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { EMPLOYMENT_TYPE_LABEL, MARITAL_STATUS_LABEL } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** Minimal RFC-4180 CSV field escaping. */
function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * Export the current employees as a CSV in the exact format the importer reads —
 * so HR can download, fix missing/wrong fields, and re-upload to update everyone
 * (matched by email). Only round-trippable fields are included (the importer does
 * not change role, status, or salary). HR / Super User only.
 */
export async function GET() {
  await requireAdmin();

  const employees = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      name: true,
      email: true,
      legalName: true,
      legalNameAr: true,
      nationalId: true,
      employeeId: true,
      department: true,
      businessUnit: { select: { name: true } },
      title: true,
      employmentType: true,
      startDate: true,
      phone: true,
      dateOfBirth: true,
      maritalStatus: true,
      reportsTo: { select: { email: true } },
      dependants: { select: { name: true, dateOfBirth: true, kind: true }, orderBy: { dateOfBirth: "asc" } },
      emergencyContactName: true,
      emergencyContactRelationship: true,
      emergencyContactPhone: true,
    },
  });

  // Split dependants: the spouse (kind SPOUSE, at most one) is its own pair; children get Kid N columns.
  const childrenOf = (e: (typeof employees)[number]) => e.dependants.filter((d) => d.kind === "CHILD");
  const spouseOf = (e: (typeof employees)[number]) => e.dependants.find((d) => d.kind === "SPOUSE") ?? null;
  const maxKids = employees.reduce((m, e) => Math.max(m, childrenOf(e).length), 0);
  const kidHeaders = Array.from({ length: maxKids }, (_, i) => [`Kid ${i + 1} Name`, `Kid ${i + 1} Date of Birth`]).flat();

  const header = [
    "Name",
    "Email",
    "Legal Name (English)",
    "Legal Name (Arabic)",
    "National ID",
    "Employee ID",
    "Department",
    "Business Unit",
    "Title",
    "Contract Type",
    "Date of Hiring",
    "Phone Number",
    "Date of Birth",
    "Marital Status",
    "Manager Email",
    "Spouse Name",
    "Spouse Date of Birth",
    "Number of Kids",
    ...kidHeaders,
    "Emergency Contact Name",
    "Emergency Contact Relationship",
    "Emergency Contact Phone",
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const e of employees) {
    const kids = childrenOf(e);
    const spouse = spouseOf(e);
    const row = [
      e.name,
      e.email,
      e.legalName ?? "",
      e.legalNameAr ?? "",
      e.nationalId ?? "",
      e.employeeId ?? "",
      e.department ?? "",
      e.businessUnit?.name ?? "",
      e.title ?? "",
      e.employmentType ? EMPLOYMENT_TYPE_LABEL[e.employmentType] : "",
      iso(e.startDate),
      e.phone ?? "",
      iso(e.dateOfBirth),
      e.maritalStatus ? MARITAL_STATUS_LABEL[e.maritalStatus] : "",
      e.reportsTo?.email ?? "",
      spouse?.name ?? "",
      iso(spouse?.dateOfBirth ?? null),
      kids.length ? String(kids.length) : "",
      ...Array.from({ length: maxKids }, (_, i) => [kids[i]?.name ?? "", iso(kids[i]?.dateOfBirth ?? null)]).flat(),
      e.emergencyContactName ?? "",
      e.emergencyContactRelationship ?? "",
      e.emergencyContactPhone ?? "",
    ];
    lines.push(row.map(csvCell).join(","));
  }

  const csv = lines.join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="employees.csv"`,
    },
  });
}
