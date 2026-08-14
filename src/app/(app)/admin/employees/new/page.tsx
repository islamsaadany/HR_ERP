import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { EmployeeForm } from "@/components/admin/EmployeeForm";
import { getDepartments } from "@/lib/departments";
import { getBusinessUnits } from "@/lib/business-units";
import { BackLink } from "@/components/admin/BackLink";
import { createEmployee } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewEmployeePage() {
  const actor = await requireAdmin();
  const [managers, departments, businessUnits] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getDepartments(),
    getBusinessUnits(),
  ]);

  return (
    <div>
      <BackLink href="/admin/employees" label="Employees" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Registry
      </p>
      <h1 className="mt-1 mb-6 font-serif text-3xl text-ink">New employee</h1>
      <EmployeeForm
        action={createEmployee}
        canEditRole={isSuperUser(actor.role)}
        canSeeSalary={isSuperUser(actor.role)}
        managers={managers}
        departments={departments}
        businessUnits={businessUnits.map((b) => ({ id: b.id, name: b.name }))}
        companyDomain={(process.env.ALLOWED_EMAIL_DOMAIN ?? "forefront.consulting").toLowerCase()}
        submitLabel="Create employee"
        values={{
          name: "",
          email: "",
          phone: null,
          department: null,
          title: null,
          role: "EMPLOYEE",
          employmentType: null,
          tenureBand: null,
          startDate: null,
          endDate: null,
          monthlySalary: null,
          status: "ACTIVE",
          dateOfBirth: null,
          maritalStatus: null,
          reportsToId: null,
          businessUnitId: null,
          employeeId: null,
          emergencyContactName: null,
          emergencyContactRelationship: null,
          emergencyContactPhone: null,
          dependants: [],
        }}
      />
    </div>
  );
}
