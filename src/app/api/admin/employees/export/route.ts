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
      department: true,
      title: true,
      employmentType: true,
      startDate: true,
      phone: true,
      dateOfBirth: true,
      maritalStatus: true,
      reportsTo: { select: { email: true } },
      dependants: { select: { dateOfBirth: true }, orderBy: { dateOfBirth: "asc" } },
    },
  });

  const maxKids = employees.reduce((m, e) => Math.max(m, e.dependants.length), 0);
  const kidHeaders = Array.from({ length: maxKids }, (_, i) => `Kid ${i + 1} Date of Birth`);

  const header = [
    "Name",
    "Email",
    "Department",
    "Title",
    "Contract Type",
    "Date of Hiring",
    "Phone Number",
    "Date of Birth",
    "Marital Status",
    "Manager Email",
    "Number of Kids",
    ...kidHeaders,
  ];

  const lines = [header.map(csvCell).join(",")];
  for (const e of employees) {
    const row = [
      e.name,
      e.email,
      e.department ?? "",
      e.title ?? "",
      e.employmentType ? EMPLOYMENT_TYPE_LABEL[e.employmentType] : "",
      iso(e.startDate),
      e.phone ?? "",
      iso(e.dateOfBirth),
      e.maritalStatus ? MARITAL_STATUS_LABEL[e.maritalStatus] : "",
      e.reportsTo?.email ?? "",
      e.dependants.length ? String(e.dependants.length) : "",
      ...Array.from({ length: maxKids }, (_, i) => iso(e.dependants[i]?.dateOfBirth ?? null)),
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
