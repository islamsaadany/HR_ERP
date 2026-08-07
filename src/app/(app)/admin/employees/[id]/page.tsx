import { notFound } from "next/navigation";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { EmployeeForm } from "@/components/admin/EmployeeForm";
import { AdminPasswordCard } from "@/components/admin/AdminPasswordCard";
import { getDepartments } from "@/lib/departments";
import { BackLink } from "@/components/admin/BackLink";
import { updateEmployee } from "../actions";
import { toDateInput } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdmin();
  const { id } = await params;

  const [employee, managers, departments] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { dependants: { orderBy: { dateOfBirth: "asc" } } },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", NOT: { id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getDepartments(),
  ]);

  if (!employee) notFound();

  const boundUpdate = updateEmployee.bind(null, id);

  return (
    <div>
      <BackLink href="/admin/employees" label="Employees" />
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-600">
        Admin · Registry
      </p>
      <h1 className="mt-1 mb-6 font-serif text-3xl text-ink">
        Edit — {employee.name}
      </h1>
      <EmployeeForm
        action={boundUpdate}
        canEditRole={isSuperUser(actor.role)}
        canSeeSalary={isSuperUser(actor.role)}
        managers={managers}
        departments={departments}
        companyDomain={(process.env.ALLOWED_EMAIL_DOMAIN ?? "forefront.consulting").toLowerCase()}
        submitLabel="Save changes"
        values={{
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          department: employee.department,
          title: employee.title,
          role: employee.role,
          employmentType: employee.employmentType,
          tenureBand: employee.tenureBand,
          startDate: toDateInput(employee.startDate),
          endDate: toDateInput(employee.endDate),
          // Confidential: never send salary to the client for a non-Super-User.
          monthlySalary: isSuperUser(actor.role) && employee.monthlySalary != null ? String(employee.monthlySalary) : null,
          status: employee.status,
          dateOfBirth: toDateInput(employee.dateOfBirth),
          maritalStatus: employee.maritalStatus,
          reportsToId: employee.reportsToId,
          dependants: employee.dependants.map((d) => ({
            name: d.name,
            dateOfBirth: toDateInput(d.dateOfBirth),
          })),
        }}
      />

      <div className="mt-8">
        <AdminPasswordCard userId={employee.id} name={employee.name} />
      </div>
    </div>
  );
}
