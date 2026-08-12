import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/labels";
import { getDepartments, unionDepartments } from "@/lib/departments";
import { deriveTenureBand, statusFromEndDate } from "@/lib/tenure";
import { EmployeeGrid, type GridRow } from "@/components/admin/EmployeeGrid";
import { RegistryHeader } from "@/components/admin/RegistryHeader";

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
        emergencyContactName: true,
        emergencyContactRelationship: true,
        emergencyContactPhone: true,
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
    // Tenure band and status are derived (never hand-entered) so the grid is
    // always current: band from the hire date, status from the end date.
    tenureBand: deriveTenureBand(e.startDate).band ?? "",
    startDate: toDateInput(e.startDate),
    endDate: toDateInput(e.endDate),
    // Confidential: never send salary to the client for a non-Super-User.
    monthlySalary: canSalary && e.monthlySalary != null ? String(e.monthlySalary) : "",
    dateOfBirth: toDateInput(e.dateOfBirth),
    maritalStatus: e.maritalStatus ?? "",
    emergencyContactName: e.emergencyContactName ?? "",
    emergencyContactRelationship: e.emergencyContactRelationship ?? "",
    emergencyContactPhone: e.emergencyContactPhone ?? "",
    status: statusFromEndDate(e.endDate),
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
    // Full-height flex column (desktop) so the grid fills the leftover space and
    // is the only scroller; mobile keeps normal page flow.
    <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
      <RegistryHeader
        employeeCount={employees.length}
        canResetAll={isSuperUser(actor.role)}
        backHref="/admin"
        backLabel="Admin"
      />

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
