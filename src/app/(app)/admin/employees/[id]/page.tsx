import { notFound } from "next/navigation";
import { requireAdmin, isSuperUser } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { EmployeeForm } from "@/components/admin/EmployeeForm";
import { AdminPasswordCard } from "@/components/admin/AdminPasswordCard";
import { ResetBenefitsCard } from "@/components/admin/ResetBenefitsCard";
import { getDepartments } from "@/lib/departments";
import { getBusinessUnits } from "@/lib/business-units";
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

  const [employee, managers, departments, businessUnits, claimRows, medicalAgg] = await Promise.all([
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
    getBusinessUnits(),
    // Per-benefit breakdown for the reset card (all plan years).
    prisma.benefitClaim.findMany({
      where: { userId: id },
      select: {
        amount: true,
        guaranteedBenefitId: true,
        catalogItemId: true,
        guaranteedBenefit: { select: { name: true } },
        catalogItem: { select: { name: true, isMedical: true } },
      },
    }),
    prisma.medicalCommitment.aggregate({ where: { userId: id }, _count: true, _sum: { premium: true } }),
  ]);

  if (!employee) notFound();

  // Group claims into one line per benefit (guaranteed or flexible catalog item),
  // then prepend the medical commitment line if one exists.
  const lineMap = new Map<string, { target: string; label: string; type: "Guaranteed" | "Flexible"; count: number; total: number }>();
  for (const c of claimRows) {
    let key: string, label: string, type: "Guaranteed" | "Flexible";
    if (c.guaranteedBenefitId) {
      key = `guaranteed:${c.guaranteedBenefitId}`;
      label = c.guaranteedBenefit?.name ?? "Guaranteed benefit";
      type = "Guaranteed";
    } else if (c.catalogItemId) {
      key = `catalog:${c.catalogItemId}`;
      label = c.catalogItem?.name ?? "Flexible benefit";
      type = "Flexible";
    } else {
      continue;
    }
    const row = lineMap.get(key) ?? { target: key, label, type, count: 0, total: 0 };
    row.count += 1;
    row.total += c.amount;
    lineMap.set(key, row);
  }
  const resetLines: import("@/components/admin/ResetBenefitsCard").BenefitLine[] = [
    ...(medicalAgg._count > 0
      ? [{ target: "medical", label: "Medical commitment", type: "Medical" as const, count: medicalAgg._count, total: medicalAgg._sum.premium ?? 0 }]
      : []),
    ...[...lineMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
  ];

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
        businessUnits={businessUnits.map((b) => ({ id: b.id, name: b.name }))}
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
          businessUnitId: employee.businessUnitId,
          employeeId: employee.employeeId,
          emergencyContactName: employee.emergencyContactName,
          emergencyContactRelationship: employee.emergencyContactRelationship,
          emergencyContactPhone: employee.emergencyContactPhone,
          dependants: employee.dependants.map((d) => ({
            name: d.name,
            dateOfBirth: toDateInput(d.dateOfBirth),
            kind: d.kind,
          })),
        }}
      />

      <div className="mt-8">
        <AdminPasswordCard userId={employee.id} name={employee.name} />
      </div>

      <div className="mt-8">
        <ResetBenefitsCard
          userId={employee.id}
          name={employee.name}
          lines={resetLines}
        />
      </div>
    </div>
  );
}
