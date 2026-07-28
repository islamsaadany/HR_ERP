import Link from "next/link";
import { requireAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import {
  EMPLOYMENT_TYPE_LABEL,
  ROLE_LABEL,
  STATUS_LABEL,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  await requireAdmin();
  const employees = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      title: true,
      employmentType: true,
      status: true,
      role: true,
    },
  });

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
        <Link
          href="/admin/employees/new"
          className="rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-700"
        >
          + New employee
        </Link>
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{e.name}</div>
                  <div className="text-xs text-muted">{e.email}</div>
                </td>
                <td className="px-4 py-3 text-muted">{e.department ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{e.title ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {e.employmentType ? EMPLOYMENT_TYPE_LABEL[e.employmentType] : "—"}
                </td>
                <td className="px-4 py-3 text-muted">{ROLE_LABEL[e.role]}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      e.status === "ACTIVE"
                        ? "rounded-full bg-navy-50 px-2 py-0.5 text-xs text-navy-700"
                        : "rounded-full bg-gray-100 px-2 py-0.5 text-xs text-muted"
                    }
                  >
                    {STATUS_LABEL[e.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/employees/${e.id}`}
                    className="text-sm font-medium text-navy-600 hover:text-navy-800"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
