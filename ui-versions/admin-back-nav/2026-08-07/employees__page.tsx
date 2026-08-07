import Link from "next/link";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/labels";
import { getDepartments, unionDepartments } from "@/lib/departments";
import { EmployeeGrid, type GridRow } from "@/components/admin/EmployeeGrid";
import { TempPasswordsPanel } from "@/components/admin/TempPasswordsPanel";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const actor = await requireAdmin();
  const canSalary = isSuperUser(actor.role);
  const [employees, managers, managedDepartments] = await Promise.all([
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
    getDepartments(),
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
    // Confidential: never send salary to the client for a non-Super-User.
    monthlySalary: canSalary && e.monthlySalary != null ? String(e.monthlySalary) : "",
    dateOfBirth: toDateInput(e.dateOfBirth),
    maritalStatus: e.maritalStatus ?? "",
    status: e.status,
    role: e.role,
    reportsToId: e.reportsToId ?? "",
    reportsToName: e.reportsTo?.name ?? "",
  }));

  // Known departments = the managed list plus any stray values already present on records.
  const departments = unionDepartments(
    managedDepartments,
    employees.map((e) => e.department)
  );

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
          <a
            href="/api/admin/employees/export"
            className="rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper"
          >
            Export CSV
          </a>
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

      <TempPasswordsPanel canResetAll={isSuperUser(actor.role)} />

      <EmployeeGrid
        rows={rows}
        managers={managers}
        departments={departments}
        canEditRole={isSuperUser(actor.role)}
        canSeeSalary={canSalary}
      />
    </div>
  );
}
