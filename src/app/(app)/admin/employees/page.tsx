import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { toDateInput } from "@/lib/labels";
import { getDepartments, unionDepartments } from "@/lib/departments";
import { getBusinessUnits } from "@/lib/business-units";
import { deriveTenureBand, statusFromEndDate } from "@/lib/tenure";
import { EmployeeGrid, type GridRow, type ColCfg } from "@/components/admin/EmployeeGrid";
import { RegistryHeader } from "@/components/admin/RegistryHeader";
import { EMPLOYEES_COLUMNS_PREF } from "@/app/(app)/admin/employees/grid-prefs";

export const dynamic = "force-dynamic";

/** Read this admin's saved Employees-grid column layout (account-level), or null. */
function readSavedColumns(uiPrefs: unknown): ColCfg[] | null {
  if (!uiPrefs || typeof uiPrefs !== "object" || Array.isArray(uiPrefs)) return null;
  const raw = (uiPrefs as Record<string, unknown>)[EMPLOYEES_COLUMNS_PREF];
  if (!Array.isArray(raw)) return null;
  const out: ColCfg[] = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const key = (item as { key?: unknown }).key;
      const visible = (item as { visible?: unknown }).visible;
      if (typeof key === "string" && key && typeof visible === "boolean") out.push({ key, visible });
    }
  }
  return out.length ? out : null;
}

export default async function EmployeesPage() {
  const actor = await requireAdmin();
  const canSalary = isSuperUser(actor.role);
  const [employees, managers, managedDepartments, businessUnits, prefRow, resettable] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        department: true,
        phone: true,
        legalName: true,
        legalNameAr: true,
        nationalId: true,
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
        businessUnitId: true,
        employeeId: true,
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getDepartments(),
    getBusinessUnits(),
    prisma.user.findUnique({ where: { id: actor.id }, select: { uiPrefs: true } }),
    // The password picker's list. Queried separately from the grid rows so the
    // password hash is read in isolation and only ever leaves as a boolean, and
    // filtered exactly like `generateTeamPasswords` so the list can't offer
    // someone the server would then refuse to reset.
    prisma.user.findMany({
      where: { status: "ACTIVE", id: { not: actor.id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, passwordHash: true },
    }),
  ]);

  const initialColumns = readSavedColumns(prefRow?.uiPrefs);

  const rows: GridRow[] = employees.map((e) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    title: e.title ?? "",
    department: e.department ?? "",
    phone: e.phone ?? "",
    legalName: e.legalName ?? "",
    legalNameAr: e.legalNameAr ?? "",
    nationalId: e.nationalId ?? "",
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
    businessUnitId: e.businessUnitId ?? "",
    employeeId: e.employeeId ?? "",
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
        resettableEmployees={resettable.map((e) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          hasPassword: e.passwordHash != null,
        }))}
        backHref="/admin"
        backLabel="Admin"
      />

      <EmployeeGrid
        rows={rows}
        managers={managers}
        departments={departments}
        businessUnits={businessUnits.map((b) => ({ id: b.id, name: b.name }))}
        canEditRole={isSuperUser(actor.role)}
        canSeeSalary={canSalary}
        initialColumns={initialColumns}
      />
    </div>
  );
}
