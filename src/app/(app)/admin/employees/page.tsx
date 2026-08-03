import Link from "next/link";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { toDateInput, DEPARTMENTS } from "@/lib/labels";
import { EmployeeGrid, type GridRow } from "@/components/admin/EmployeeGrid";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const actor = await requireAdmin();
  const [employees, managers] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        department: true,
        phone: true,
        employmentType: true,
        tenureBand: true,
        startDate: true,
        endDate: true,
        monthlySalary: true,
        dateOfBirth: true,
        maritalStatus: true,
        status: true,
        role: true,
        reportsToId: true,
        reportsTo: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const rows: GridRow[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    title: e.title ?? "",
    department: e.department ?? "",
    phone: e.phone ?? "",
    employmentType: e.employmentType ?? "",
    tenureBand: e.tenureBand ?? "",
    startDate: toDateInput(e.startDate),
    endDate: toDateInput(e.endDate),
    monthlySalary: e.monthlySalary != null ? String(e.monthlySalary) : "",
    dateOfBirth: toDateInput(e.dateOfBirth),
    maritalStatus: e.maritalStatus ?? "",
    status: e.status,
    role: e.role,
    reportsToId: e.reportsToId ?? "",
    reportsToName: e.reportsTo?.name ?? "",
  }));

  // Known departments = the house list plus any already present on records.
  const departments = Array.from(
    new Set<string>([
      ...DEPARTMENTS,
      ...employees.map((e) => e.department).filter((d): d is string => !!d),
    ])
  ).sort();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
            Admin · Registry
          </p>
          <h1 className="mt-1 font-serif text-3xl text-ink">Employees</h1>
          <p className="mt-1 text-muted">{employees.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/employees/import"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            Import CSV
          </Link>
          <Link
            href="/admin/employees/new"
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
          >
            + New employee
          </Link>
        </div>
      </div>

      <EmployeeGrid
        rows={rows}
        managers={managers}
        departments={departments}
        canEditRole={isSuperUser(actor.role)}
      />
    </div>
  );
}
